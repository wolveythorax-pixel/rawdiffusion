"""
ComfyUI Workflow Parser

Parses workflow JSON into a structured graph for analysis.
"""

from dataclasses import dataclass, field
from typing import Any, Optional
from collections import defaultdict


@dataclass
class NodeInput:
    """Represents an input to a node"""
    name: str
    value: Any  # Either a literal value or None if it's a link
    is_link: bool = False
    source_node: Optional[str] = None
    source_output: Optional[int] = None


@dataclass
class Node:
    """Represents a ComfyUI node"""
    id: str
    class_type: str
    inputs: dict[str, NodeInput] = field(default_factory=dict)
    # Populated during graph analysis
    output_connections: list[tuple[str, str, int]] = field(default_factory=list)  # [(target_node, target_input, output_idx)]
    execution_order: int = -1


@dataclass
class WorkflowGraph:
    """Parsed workflow as a graph structure"""
    nodes: dict[str, Node] = field(default_factory=dict)
    # Analysis results
    root_nodes: list[str] = field(default_factory=list)  # Nodes with no inputs (loaders)
    terminal_nodes: list[str] = field(default_factory=list)  # Nodes with no outputs (save/preview)
    execution_order: list[str] = field(default_factory=list)


class WorkflowParser:
    """Parses ComfyUI workflow JSON into a WorkflowGraph"""

    # Known node categories for classification
    LOADER_NODES = {
        'CheckpointLoaderSimple', 'CheckpointLoader',
        'VAELoader', 'LoraLoader', 'LoraLoaderModelOnly',
        'ControlNetLoader', 'CLIPLoader', 'UNETLoader',
        'CLIPVisionLoader', 'StyleModelLoader',
        'UpscaleModelLoader', 'GLIGENLoader',
        'unCLIPCheckpointLoader', 'DiffusersLoader',
        # IPAdapter loaders
        'IPAdapterModelLoader', 'IPAdapterUnifiedLoader',
        # AnimateDiff
        'AnimateDiffLoaderWithContext',
    }

    OUTPUT_NODES = {
        'SaveImage', 'PreviewImage',
        'SaveLatent', 'PreviewLatent',
        # Video
        'VHS_VideoCombine', 'SaveAnimatedWEBP', 'SaveAnimatedPNG',
    }

    SAMPLER_NODES = {
        'KSampler', 'KSamplerAdvanced',
        'SamplerCustom', 'SamplerCustomAdvanced',
    }

    CONDITIONING_NODES = {
        'CLIPTextEncode', 'CLIPTextEncodeSDXL',
        'ConditioningCombine', 'ConditioningConcat',
        'ConditioningAverage', 'ConditioningSetArea',
        'ConditioningSetMask', 'ConditioningZeroOut',
        'ControlNetApply', 'ControlNetApplyAdvanced',
        'unCLIPConditioning', 'GLIGENTextBoxApply',
        # IPAdapter
        'IPAdapterApply', 'IPAdapterAdvanced',
    }

    LATENT_NODES = {
        'EmptyLatentImage', 'VAEEncode', 'VAEEncodeForInpaint',
        'LatentUpscale', 'LatentUpscaleBy',
        'LatentComposite', 'LatentBlend',
        'SetLatentNoiseMask',
    }

    IMAGE_NODES = {
        'LoadImage', 'LoadImageMask',
        'VAEDecode', 'VAEDecodeTiled',
        'ImageScale', 'ImageScaleBy',
        'ImageUpscaleWithModel',
        'ImageInvert', 'ImageBatch',
    }

    def parse(self, workflow_json: dict) -> WorkflowGraph:
        """Parse workflow JSON into a WorkflowGraph"""
        graph = WorkflowGraph()

        # First pass: create all nodes
        for node_id, node_data in workflow_json.items():
            node = self._parse_node(node_id, node_data)
            graph.nodes[node_id] = node

        # Second pass: resolve links and build connections
        self._resolve_links(graph)

        # Third pass: analyze graph structure
        self._analyze_graph(graph)

        # Fourth pass: determine execution order
        self._compute_execution_order(graph)

        return graph

    def _parse_node(self, node_id: str, node_data: dict) -> Node:
        """Parse a single node from workflow JSON"""
        node = Node(
            id=node_id,
            class_type=node_data.get('class_type', 'Unknown'),
        )

        inputs = node_data.get('inputs', {})
        for input_name, input_value in inputs.items():
            node_input = self._parse_input(input_name, input_value)
            node.inputs[input_name] = node_input

        return node

    def _parse_input(self, name: str, value: Any) -> NodeInput:
        """Parse a node input - either a literal or a link"""
        # Links are [node_id, output_index] arrays
        if isinstance(value, list) and len(value) == 2:
            # Check if it looks like a link (first element is string/int node id)
            if isinstance(value[0], (str, int)) and isinstance(value[1], int):
                return NodeInput(
                    name=name,
                    value=None,
                    is_link=True,
                    source_node=str(value[0]),
                    source_output=value[1],
                )

        # Otherwise it's a literal value
        return NodeInput(name=name, value=value, is_link=False)

    def _resolve_links(self, graph: WorkflowGraph):
        """Build output_connections for each node based on input links"""
        for node_id, node in graph.nodes.items():
            for input_name, node_input in node.inputs.items():
                if node_input.is_link and node_input.source_node:
                    source_node = graph.nodes.get(node_input.source_node)
                    if source_node:
                        source_node.output_connections.append(
                            (node_id, input_name, node_input.source_output)
                        )

    def _analyze_graph(self, graph: WorkflowGraph):
        """Identify root and terminal nodes"""
        for node_id, node in graph.nodes.items():
            # Root nodes: no linked inputs (only literal values)
            has_linked_input = any(inp.is_link for inp in node.inputs.values())
            if not has_linked_input:
                graph.root_nodes.append(node_id)

            # Terminal nodes: no output connections OR is a known output node
            if not node.output_connections or node.class_type in self.OUTPUT_NODES:
                graph.terminal_nodes.append(node_id)

    def _compute_execution_order(self, graph: WorkflowGraph):
        """Topological sort to determine execution order"""
        # Build dependency count for each node
        in_degree = defaultdict(int)
        for node_id, node in graph.nodes.items():
            for inp in node.inputs.values():
                if inp.is_link:
                    in_degree[node_id] += 1

        # Start with nodes that have no dependencies
        queue = [nid for nid in graph.nodes if in_degree[nid] == 0]
        order = []
        order_idx = 0

        while queue:
            # Sort queue for deterministic order (by node id)
            queue.sort()
            node_id = queue.pop(0)
            order.append(node_id)

            node = graph.nodes[node_id]
            node.execution_order = order_idx
            order_idx += 1

            # Reduce in_degree for nodes that depend on this one
            for target_node, _, _ in node.output_connections:
                in_degree[target_node] -= 1
                if in_degree[target_node] == 0:
                    queue.append(target_node)

        graph.execution_order = order

    def get_node_category(self, class_type: str) -> str:
        """Categorize a node by its class type"""
        if class_type in self.LOADER_NODES:
            return 'loader'
        elif class_type in self.OUTPUT_NODES:
            return 'output'
        elif class_type in self.SAMPLER_NODES:
            return 'sampler'
        elif class_type in self.CONDITIONING_NODES:
            return 'conditioning'
        elif class_type in self.LATENT_NODES:
            return 'latent'
        elif class_type in self.IMAGE_NODES:
            return 'image'
        else:
            return 'other'

    def print_graph(self, graph: WorkflowGraph):
        """Debug: print graph structure"""
        print(f"Workflow Graph ({len(graph.nodes)} nodes)")
        print(f"Root nodes: {graph.root_nodes}")
        print(f"Terminal nodes: {graph.terminal_nodes}")
        print(f"\nExecution order:")
        for i, node_id in enumerate(graph.execution_order):
            node = graph.nodes[node_id]
            inputs_summary = ', '.join(
                f"{k}={'LINK' if v.is_link else repr(v.value)[:20]}"
                for k, v in list(node.inputs.items())[:3]
            )
            print(f"  {i}: [{node_id}] {node.class_type}({inputs_summary}...)")
