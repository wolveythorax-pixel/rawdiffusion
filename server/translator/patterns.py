"""
Pattern Recognition for ComfyUI Workflows

Identifies common workflow patterns like txt2img, img2img,
ControlNet, IPAdapter, etc.
"""

from dataclasses import dataclass, field
from typing import Optional
from .parser import WorkflowGraph, Node


@dataclass
class PatternMatch:
    """Represents a recognized pattern in the workflow"""
    pattern_type: str
    nodes: list[str]  # Node IDs involved in this pattern
    config: dict = field(default_factory=dict)  # Extracted configuration
    sub_patterns: list['PatternMatch'] = field(default_factory=list)


class PatternRecognizer:
    """Recognizes common ComfyUI workflow patterns"""

    def analyze(self, graph: WorkflowGraph) -> list[PatternMatch]:
        """Analyze workflow and return recognized patterns"""
        patterns = []

        # Check for base generation patterns
        base_pattern = self._detect_base_pattern(graph)
        if base_pattern:
            patterns.append(base_pattern)

        # Check for modifiers (ControlNet, IPAdapter, LoRA, etc.)
        patterns.extend(self._detect_controlnet(graph))
        patterns.extend(self._detect_ipadapter(graph))
        patterns.extend(self._detect_lora(graph))

        # Check for post-processing
        patterns.extend(self._detect_upscaling(graph))
        patterns.extend(self._detect_inpainting(graph))

        return patterns

    def _detect_base_pattern(self, graph: WorkflowGraph) -> Optional[PatternMatch]:
        """Detect the base generation pattern (txt2img, img2img, etc.)"""

        # Find the checkpoint loader
        checkpoint_node = None
        for node_id, node in graph.nodes.items():
            if node.class_type in ('CheckpointLoaderSimple', 'CheckpointLoader', 'unCLIPCheckpointLoader'):
                checkpoint_node = node
                break

        if not checkpoint_node:
            return None

        # Find the sampler
        sampler_node = None
        for node_id, node in graph.nodes.items():
            if node.class_type in ('KSampler', 'KSamplerAdvanced', 'SamplerCustom'):
                sampler_node = node
                break

        if not sampler_node:
            return None

        # Determine if txt2img or img2img
        latent_input = sampler_node.inputs.get('latent_image')
        is_img2img = False
        input_image_node = None

        if latent_input and latent_input.is_link:
            latent_source = graph.nodes.get(latent_input.source_node)
            if latent_source:
                # If latent comes from VAEEncode, it's img2img
                if latent_source.class_type in ('VAEEncode', 'VAEEncodeForInpaint'):
                    is_img2img = True
                    # Trace back to find the image source
                    img_input = latent_source.inputs.get('pixels')
                    if img_input and img_input.is_link:
                        input_image_node = graph.nodes.get(img_input.source_node)

        # Extract configuration
        config = {
            'checkpoint': self._get_input_value(checkpoint_node, 'ckpt_name'),
            'steps': self._get_input_value(sampler_node, 'steps', 20),
            'cfg': self._get_input_value(sampler_node, 'cfg', 7.5),
            'sampler': self._get_input_value(sampler_node, 'sampler_name', 'euler'),
            'scheduler': self._get_input_value(sampler_node, 'scheduler', 'normal'),
            'seed': self._get_input_value(sampler_node, 'seed', 0),
            'denoise': self._get_input_value(sampler_node, 'denoise', 1.0),
        }

        # Get prompts
        positive_input = sampler_node.inputs.get('positive')
        negative_input = sampler_node.inputs.get('negative')

        if positive_input and positive_input.is_link:
            pos_node = graph.nodes.get(positive_input.source_node)
            if pos_node and pos_node.class_type == 'CLIPTextEncode':
                config['positive_prompt'] = self._get_input_value(pos_node, 'text', '')

        if negative_input and negative_input.is_link:
            neg_node = graph.nodes.get(negative_input.source_node)
            if neg_node and neg_node.class_type == 'CLIPTextEncode':
                config['negative_prompt'] = self._get_input_value(neg_node, 'text', '')

        # Get dimensions from EmptyLatentImage
        if not is_img2img and latent_input and latent_input.is_link:
            latent_source = graph.nodes.get(latent_input.source_node)
            if latent_source and latent_source.class_type == 'EmptyLatentImage':
                config['width'] = self._get_input_value(latent_source, 'width', 512)
                config['height'] = self._get_input_value(latent_source, 'height', 512)
                config['batch_size'] = self._get_input_value(latent_source, 'batch_size', 1)

        # Collect involved nodes
        nodes = [checkpoint_node.id, sampler_node.id]

        pattern_type = 'img2img' if is_img2img else 'txt2img'

        # Check for SDXL (refiner pattern)
        if self._has_refiner(graph):
            pattern_type = 'sdxl_refiner'
            config['has_refiner'] = True

        return PatternMatch(
            pattern_type=pattern_type,
            nodes=nodes,
            config=config,
        )

    def _detect_controlnet(self, graph: WorkflowGraph) -> list[PatternMatch]:
        """Detect ControlNet usage"""
        patterns = []

        for node_id, node in graph.nodes.items():
            if node.class_type in ('ControlNetApply', 'ControlNetApplyAdvanced', 'ControlNetApplySD3'):
                # Find the ControlNet model
                controlnet_input = node.inputs.get('control_net')
                controlnet_model = None
                if controlnet_input and controlnet_input.is_link:
                    loader_node = graph.nodes.get(controlnet_input.source_node)
                    if loader_node and loader_node.class_type == 'ControlNetLoader':
                        controlnet_model = self._get_input_value(loader_node, 'control_net_name')

                # Find the preprocessor if any
                image_input = node.inputs.get('image')
                preprocessor = None
                if image_input and image_input.is_link:
                    prep_node = graph.nodes.get(image_input.source_node)
                    if prep_node:
                        # Common preprocessor node types
                        if 'Canny' in prep_node.class_type:
                            preprocessor = 'canny'
                        elif 'Depth' in prep_node.class_type:
                            preprocessor = 'depth'
                        elif 'OpenPose' in prep_node.class_type or 'DW' in prep_node.class_type:
                            preprocessor = 'openpose'
                        elif 'Lineart' in prep_node.class_type:
                            preprocessor = 'lineart'

                config = {
                    'model': controlnet_model,
                    'preprocessor': preprocessor,
                    'strength': self._get_input_value(node, 'strength', 1.0),
                    'start_percent': self._get_input_value(node, 'start_percent', 0.0),
                    'end_percent': self._get_input_value(node, 'end_percent', 1.0),
                }

                patterns.append(PatternMatch(
                    pattern_type='controlnet',
                    nodes=[node_id],
                    config=config,
                ))

        return patterns

    def _detect_ipadapter(self, graph: WorkflowGraph) -> list[PatternMatch]:
        """Detect IPAdapter usage"""
        patterns = []

        ipadapter_nodes = [
            'IPAdapterApply', 'IPAdapterAdvanced', 'IPAdapterFaceID',
            'IPAdapterStyleComposition', 'IPAdapterBatch',
        ]

        for node_id, node in graph.nodes.items():
            if node.class_type in ipadapter_nodes:
                config = {
                    'type': node.class_type,
                    'weight': self._get_input_value(node, 'weight', 1.0),
                    'weight_type': self._get_input_value(node, 'weight_type', 'standard'),
                    'start_at': self._get_input_value(node, 'start_at', 0.0),
                    'end_at': self._get_input_value(node, 'end_at', 1.0),
                }

                patterns.append(PatternMatch(
                    pattern_type='ipadapter',
                    nodes=[node_id],
                    config=config,
                ))

        return patterns

    def _detect_lora(self, graph: WorkflowGraph) -> list[PatternMatch]:
        """Detect LoRA loading"""
        patterns = []

        for node_id, node in graph.nodes.items():
            if node.class_type in ('LoraLoader', 'LoraLoaderModelOnly'):
                config = {
                    'name': self._get_input_value(node, 'lora_name'),
                    'strength_model': self._get_input_value(node, 'strength_model', 1.0),
                    'strength_clip': self._get_input_value(node, 'strength_clip', 1.0),
                }

                patterns.append(PatternMatch(
                    pattern_type='lora',
                    nodes=[node_id],
                    config=config,
                ))

        return patterns

    def _detect_upscaling(self, graph: WorkflowGraph) -> list[PatternMatch]:
        """Detect upscaling patterns"""
        patterns = []

        # Latent upscale
        for node_id, node in graph.nodes.items():
            if node.class_type in ('LatentUpscale', 'LatentUpscaleBy'):
                config = {
                    'method': 'latent',
                    'scale': self._get_input_value(node, 'scale_by', 1.5),
                    'upscale_method': self._get_input_value(node, 'upscale_method', 'nearest-exact'),
                }
                patterns.append(PatternMatch(
                    pattern_type='upscale',
                    nodes=[node_id],
                    config=config,
                ))

        # Model-based upscale (ESRGAN, etc.)
        for node_id, node in graph.nodes.items():
            if node.class_type == 'ImageUpscaleWithModel':
                # Find the upscale model
                model_input = node.inputs.get('upscale_model')
                model_name = None
                if model_input and model_input.is_link:
                    loader = graph.nodes.get(model_input.source_node)
                    if loader:
                        model_name = self._get_input_value(loader, 'model_name')

                config = {
                    'method': 'model',
                    'model': model_name,
                }
                patterns.append(PatternMatch(
                    pattern_type='upscale',
                    nodes=[node_id],
                    config=config,
                ))

        return patterns

    def _detect_inpainting(self, graph: WorkflowGraph) -> list[PatternMatch]:
        """Detect inpainting patterns"""
        patterns = []

        for node_id, node in graph.nodes.items():
            if node.class_type in ('VAEEncodeForInpaint', 'InpaintModelConditioning'):
                config = {
                    'type': 'inpaint',
                    'grow_mask': self._get_input_value(node, 'grow_mask_by', 0),
                }
                patterns.append(PatternMatch(
                    pattern_type='inpaint',
                    nodes=[node_id],
                    config=config,
                ))

        return patterns

    def _has_refiner(self, graph: WorkflowGraph) -> bool:
        """Check if workflow has SDXL refiner pattern"""
        # Look for multiple checkpoint loaders or KSamplerAdvanced with specific step ranges
        checkpoint_count = sum(
            1 for n in graph.nodes.values()
            if n.class_type in ('CheckpointLoaderSimple', 'CheckpointLoader')
        )

        if checkpoint_count >= 2:
            return True

        # Or KSamplerAdvanced with start_at_step > 0
        for node in graph.nodes.values():
            if node.class_type == 'KSamplerAdvanced':
                start_step = self._get_input_value(node, 'start_at_step', 0)
                if start_step > 0:
                    return True

        return False

    def _get_input_value(self, node: Node, input_name: str, default=None):
        """Get literal value from node input"""
        inp = node.inputs.get(input_name)
        if inp and not inp.is_link:
            return inp.value
        return default

    def summarize(self, patterns: list[PatternMatch]) -> str:
        """Create a human-readable summary of detected patterns"""
        if not patterns:
            return "No recognizable patterns detected"

        lines = ["Detected patterns:"]

        for p in patterns:
            if p.pattern_type == 'txt2img':
                lines.append(f"  - Text-to-Image generation")
                lines.append(f"    Model: {p.config.get('checkpoint')}")
                lines.append(f"    Steps: {p.config.get('steps')}, CFG: {p.config.get('cfg')}")
            elif p.pattern_type == 'img2img':
                lines.append(f"  - Image-to-Image generation")
                lines.append(f"    Denoise: {p.config.get('denoise')}")
            elif p.pattern_type == 'controlnet':
                lines.append(f"  - ControlNet: {p.config.get('preprocessor', 'unknown')}")
                lines.append(f"    Strength: {p.config.get('strength')}")
            elif p.pattern_type == 'ipadapter':
                lines.append(f"  - IPAdapter: {p.config.get('type')}")
                lines.append(f"    Weight: {p.config.get('weight')}")
            elif p.pattern_type == 'lora':
                lines.append(f"  - LoRA: {p.config.get('name')}")
                lines.append(f"    Strength: {p.config.get('strength_model')}")
            elif p.pattern_type == 'upscale':
                lines.append(f"  - Upscale: {p.config.get('method')}")
            elif p.pattern_type == 'inpaint':
                lines.append(f"  - Inpainting")

        return '\n'.join(lines)
