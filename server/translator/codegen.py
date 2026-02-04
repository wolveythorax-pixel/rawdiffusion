"""
Python Code Generator

Generates clean, readable Python code from recognized patterns.
"""

from typing import Optional
from .parser import WorkflowGraph
from .patterns import PatternMatch


class CodeGenerator:
    """Generates Python code from workflow patterns"""

    def __init__(self):
        self.indent = "    "

    def generate(self, graph: WorkflowGraph, patterns: list[PatternMatch]) -> str:
        """Generate complete Python script from patterns"""
        sections = []

        # Header comment
        sections.append(self._generate_header(patterns))

        # Imports
        sections.append(self._generate_imports(patterns))

        # Configuration variables
        sections.append(self._generate_config(patterns))

        # Main code
        sections.append(self._generate_main(patterns))

        return '\n\n'.join(sections)

    def _generate_header(self, patterns: list[PatternMatch]) -> str:
        """Generate header comment describing the workflow"""
        base = next((p for p in patterns if p.pattern_type in ('txt2img', 'img2img', 'sdxl_refiner')), None)

        lines = [
            "# RawDiffusion Workflow",
            "# Converted from ComfyUI",
            "#",
        ]

        if base:
            lines.append(f"# Type: {base.pattern_type}")
            if base.config.get('checkpoint'):
                lines.append(f"# Model: {base.config.get('checkpoint')}")

        # List modifiers
        modifiers = [p for p in patterns if p.pattern_type in ('controlnet', 'ipadapter', 'lora', 'upscale')]
        if modifiers:
            lines.append("#")
            lines.append("# Modifiers:")
            for m in modifiers:
                if m.pattern_type == 'controlnet':
                    lines.append(f"#   - ControlNet ({m.config.get('preprocessor', 'unknown')})")
                elif m.pattern_type == 'ipadapter':
                    lines.append(f"#   - IPAdapter")
                elif m.pattern_type == 'lora':
                    lines.append(f"#   - LoRA: {m.config.get('name')}")
                elif m.pattern_type == 'upscale':
                    lines.append(f"#   - Upscale ({m.config.get('method')})")

        return '\n'.join(lines)

    def _generate_imports(self, patterns: list[PatternMatch]) -> str:
        """Generate import statements based on patterns"""
        imports = [
            "import torch",
            "from pathlib import Path",
        ]

        base = next((p for p in patterns if p.pattern_type in ('txt2img', 'img2img', 'sdxl_refiner')), None)

        # Core pipeline import
        if base:
            if base.pattern_type == 'sdxl_refiner':
                imports.append("from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline")
            elif 'xl' in str(base.config.get('checkpoint', '')).lower():
                imports.append("from diffusers import StableDiffusionXLPipeline")
            else:
                imports.append("from diffusers import StableDiffusionPipeline")

        # ControlNet
        if any(p.pattern_type == 'controlnet' for p in patterns):
            imports.append("from diffusers import ControlNetModel")
            # Check which preprocessors are needed
            for p in patterns:
                if p.pattern_type == 'controlnet':
                    prep = p.config.get('preprocessor')
                    if prep == 'canny':
                        imports.append("import cv2")
                        imports.append("import numpy as np")
                    elif prep == 'depth':
                        imports.append("from transformers import DPTForDepthEstimation, DPTImageProcessor")
                    elif prep == 'openpose':
                        imports.append("from controlnet_aux import OpenposeDetector")

        # IPAdapter
        if any(p.pattern_type == 'ipadapter' for p in patterns):
            imports.append("from diffusers import IPAdapterMixin")

        # Image handling
        if any(p.pattern_type in ('img2img', 'controlnet', 'ipadapter', 'upscale') for p in patterns):
            imports.append("from PIL import Image")

        return '\n'.join(sorted(set(imports), key=lambda x: (not x.startswith('import'), x)))

    def _generate_config(self, patterns: list[PatternMatch]) -> str:
        """Generate configuration section"""
        lines = ["# Configuration"]

        base = next((p for p in patterns if p.pattern_type in ('txt2img', 'img2img', 'sdxl_refiner')), None)

        if base:
            # Model path
            checkpoint = base.config.get('checkpoint', 'model.safetensors')
            lines.append(f'MODEL_PATH = "{checkpoint}"')

            # Prompts
            pos_prompt = base.config.get('positive_prompt', 'a beautiful landscape')
            neg_prompt = base.config.get('negative_prompt', 'blurry, low quality')
            lines.append(f'PROMPT = """{pos_prompt}"""')
            lines.append(f'NEGATIVE_PROMPT = """{neg_prompt}"""')

            # Generation params
            lines.append(f"STEPS = {base.config.get('steps', 20)}")
            lines.append(f"CFG_SCALE = {base.config.get('cfg', 7.5)}")
            lines.append(f"SEED = {base.config.get('seed', 0)}")
            lines.append(f"WIDTH = {base.config.get('width', 512)}")
            lines.append(f"HEIGHT = {base.config.get('height', 512)}")

            if base.pattern_type == 'img2img':
                lines.append(f"DENOISE = {base.config.get('denoise', 0.75)}")

        # LoRA configs
        loras = [p for p in patterns if p.pattern_type == 'lora']
        if loras:
            lines.append("")
            lines.append("# LoRA Configuration")
            lines.append("LORAS = [")
            for lora in loras:
                name = lora.config.get('name', 'lora.safetensors')
                strength = lora.config.get('strength_model', 1.0)
                lines.append(f'    ("{name}", {strength}),')
            lines.append("]")

        # ControlNet configs
        controlnets = [p for p in patterns if p.pattern_type == 'controlnet']
        if controlnets:
            lines.append("")
            lines.append("# ControlNet Configuration")
            for i, cn in enumerate(controlnets):
                model = cn.config.get('model', 'controlnet')
                strength = cn.config.get('strength', 1.0)
                lines.append(f'CONTROLNET_{i}_MODEL = "{model}"')
                lines.append(f"CONTROLNET_{i}_STRENGTH = {strength}")

        return '\n'.join(lines)

    def _generate_main(self, patterns: list[PatternMatch]) -> str:
        """Generate main execution code"""
        lines = []

        base = next((p for p in patterns if p.pattern_type in ('txt2img', 'img2img', 'sdxl_refiner')), None)
        if not base:
            return "# Could not detect base generation pattern"

        # Setup device
        lines.append("# Setup")
        lines.append('device = "cuda" if torch.cuda.is_available() else "cpu"')
        lines.append('dtype = torch.float16 if device == "cuda" else torch.float32')
        lines.append("")

        # Load model
        lines.extend(self._generate_model_loading(patterns, base))
        lines.append("")

        # Load LoRAs
        loras = [p for p in patterns if p.pattern_type == 'lora']
        if loras:
            lines.extend(self._generate_lora_loading(loras))
            lines.append("")

        # Setup ControlNet
        controlnets = [p for p in patterns if p.pattern_type == 'controlnet']
        if controlnets:
            lines.extend(self._generate_controlnet_setup(controlnets))
            lines.append("")

        # Setup IPAdapter
        ipadapters = [p for p in patterns if p.pattern_type == 'ipadapter']
        if ipadapters:
            lines.extend(self._generate_ipadapter_setup(ipadapters))
            lines.append("")

        # Generate image
        lines.extend(self._generate_inference(base, patterns))
        lines.append("")

        # Post-processing (upscale)
        upscales = [p for p in patterns if p.pattern_type == 'upscale']
        if upscales:
            lines.extend(self._generate_upscaling(upscales))
            lines.append("")

        # Save
        lines.append("# Save output")
        lines.append('image.save("output.png")')
        lines.append('print("Saved to output.png")')

        return '\n'.join(lines)

    def _generate_model_loading(self, patterns: list[PatternMatch], base: PatternMatch) -> list[str]:
        """Generate model loading code"""
        lines = ["# Load model"]

        checkpoint = base.config.get('checkpoint', 'model.safetensors')
        is_xl = 'xl' in checkpoint.lower() or base.pattern_type == 'sdxl_refiner'

        # Check for ControlNet
        controlnets = [p for p in patterns if p.pattern_type == 'controlnet']

        if controlnets:
            # Load ControlNet models first
            lines.append("# Load ControlNet")
            for i, cn in enumerate(controlnets):
                model = cn.config.get('model', 'lllyasviel/control_v11p_sd15_canny')
                lines.append(f'controlnet_{i} = ControlNetModel.from_pretrained("{model}", torch_dtype=dtype)')

            # Load pipeline with ControlNet
            if is_xl:
                lines.append("")
                lines.append("pipe = StableDiffusionXLControlNetPipeline.from_single_file(")
            else:
                lines.append("")
                lines.append("from diffusers import StableDiffusionControlNetPipeline")
                lines.append("pipe = StableDiffusionControlNetPipeline.from_single_file(")

            lines.append(f'    MODEL_PATH,')
            if len(controlnets) == 1:
                lines.append('    controlnet=controlnet_0,')
            else:
                cn_list = ', '.join(f'controlnet_{i}' for i in range(len(controlnets)))
                lines.append(f'    controlnet=[{cn_list}],')
            lines.append('    torch_dtype=dtype,')
            lines.append(')')
        else:
            # Standard pipeline
            if is_xl:
                lines.append("pipe = StableDiffusionXLPipeline.from_single_file(")
            else:
                lines.append("pipe = StableDiffusionPipeline.from_single_file(")
            lines.append('    MODEL_PATH,')
            lines.append('    torch_dtype=dtype,')
            lines.append(')')

        lines.append("pipe.to(device)")

        # Memory optimization
        lines.append("")
        lines.append("# Memory optimization")
        lines.append("pipe.enable_model_cpu_offload()")

        return lines

    def _generate_lora_loading(self, loras: list[PatternMatch]) -> list[str]:
        """Generate LoRA loading code"""
        lines = ["# Load LoRAs"]
        lines.append("for lora_name, lora_weight in LORAS:")
        lines.append("    pipe.load_lora_weights(lora_name)")
        lines.append("    pipe.fuse_lora(lora_scale=lora_weight)")
        return lines

    def _generate_controlnet_setup(self, controlnets: list[PatternMatch]) -> list[str]:
        """Generate ControlNet preprocessing code"""
        lines = ["# Prepare ControlNet inputs"]
        lines.append('control_image = Image.open("input_image.png")  # Your control image')

        for i, cn in enumerate(controlnets):
            prep = cn.config.get('preprocessor', 'canny')
            if prep == 'canny':
                lines.append("")
                lines.append(f"# Canny edge detection for ControlNet {i}")
                lines.append("control_array = np.array(control_image)")
                lines.append("control_array = cv2.Canny(control_array, 100, 200)")
                lines.append("control_array = np.stack([control_array] * 3, axis=-1)")
                lines.append(f"control_image_{i} = Image.fromarray(control_array)")
            elif prep == 'depth':
                lines.append("")
                lines.append(f"# Depth estimation for ControlNet {i}")
                lines.append('depth_estimator = DPTForDepthEstimation.from_pretrained("Intel/dpt-large")')
                lines.append('processor = DPTImageProcessor.from_pretrained("Intel/dpt-large")')
                lines.append("inputs = processor(control_image, return_tensors='pt')")
                lines.append("with torch.no_grad():")
                lines.append("    depth = depth_estimator(**inputs).predicted_depth")
                lines.append(f"control_image_{i} = depth  # Process as needed")
            elif prep == 'openpose':
                lines.append("")
                lines.append(f"# OpenPose detection for ControlNet {i}")
                lines.append("openpose = OpenposeDetector.from_pretrained('lllyasviel/Annotators')")
                lines.append(f"control_image_{i} = openpose(control_image)")
            else:
                lines.append(f"control_image_{i} = control_image  # Preprocessor: {prep}")

        return lines

    def _generate_ipadapter_setup(self, ipadapters: list[PatternMatch]) -> list[str]:
        """Generate IPAdapter setup code"""
        lines = ["# Setup IPAdapter"]
        lines.append('pipe.load_ip_adapter("h94/IP-Adapter", subfolder="models", weight_name="ip-adapter_sd15.bin")')
        lines.append('ip_image = Image.open("reference_image.png")  # Your reference image')
        return lines

    def _generate_inference(self, base: PatternMatch, patterns: list[PatternMatch]) -> list[str]:
        """Generate inference code"""
        lines = ["# Generate image"]
        lines.append("generator = torch.Generator(device).manual_seed(SEED)")
        lines.append("")

        controlnets = [p for p in patterns if p.pattern_type == 'controlnet']
        ipadapters = [p for p in patterns if p.pattern_type == 'ipadapter']

        lines.append("image = pipe(")
        lines.append("    prompt=PROMPT,")
        lines.append("    negative_prompt=NEGATIVE_PROMPT,")

        if base.pattern_type != 'img2img':
            lines.append("    width=WIDTH,")
            lines.append("    height=HEIGHT,")
        else:
            lines.append('    image=Image.open("input.png"),')
            lines.append("    strength=DENOISE,")

        lines.append("    num_inference_steps=STEPS,")
        lines.append("    guidance_scale=CFG_SCALE,")
        lines.append("    generator=generator,")

        # ControlNet images
        if controlnets:
            if len(controlnets) == 1:
                lines.append("    image=control_image_0,")
                lines.append(f"    controlnet_conditioning_scale=CONTROLNET_0_STRENGTH,")
            else:
                cn_images = ', '.join(f'control_image_{i}' for i in range(len(controlnets)))
                cn_scales = ', '.join(f'CONTROLNET_{i}_STRENGTH' for i in range(len(controlnets)))
                lines.append(f"    image=[{cn_images}],")
                lines.append(f"    controlnet_conditioning_scale=[{cn_scales}],")

        # IPAdapter
        if ipadapters:
            lines.append("    ip_adapter_image=ip_image,")

        lines.append(").images[0]")

        return lines

    def _generate_upscaling(self, upscales: list[PatternMatch]) -> list[str]:
        """Generate upscaling code"""
        lines = ["# Upscale"]

        for up in upscales:
            if up.config.get('method') == 'model':
                model = up.config.get('model', 'RealESRGAN_x4plus')
                lines.append(f"# Using upscale model: {model}")
                lines.append("from basicsr.archs.rrdbnet_arch import RRDBNet")
                lines.append("from realesrgan import RealESRGANer")
                lines.append("")
                lines.append("upsampler = RealESRGANer(")
                lines.append(f'    model_path="{model}",')
                lines.append("    scale=4,")
                lines.append(")")
                lines.append("image, _ = upsampler.enhance(np.array(image))")
                lines.append("image = Image.fromarray(image)")
            else:
                scale = up.config.get('scale', 2)
                lines.append(f"# Simple upscale by {scale}x")
                lines.append(f"new_size = (int(image.width * {scale}), int(image.height * {scale}))")
                lines.append("image = image.resize(new_size, Image.LANCZOS)")

        return lines
