# ComfyUI Architecture Analysis

## Overview

ComfyUI is a node-based workflow system where each node is a Python class that processes inputs and produces outputs. The UI is just a visual way to construct a JSON workflow that gets executed server-side.

## Node Definition Pattern

Every node follows this structure:

```python
class MyNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "input_name": ("TYPE", {"default": value, "min": 0, "max": 100, ...}),
            },
            "optional": {
                "optional_input": ("TYPE", {}),
            },
            "hidden": {
                "hidden_input": "TYPE",
            }
        }

    RETURN_TYPES = ("OUTPUT_TYPE",)  # Tuple of output types
    RETURN_NAMES = ("output_name",)  # Optional: names for outputs
    FUNCTION = "method_name"          # Method to call
    CATEGORY = "category/subcategory" # UI organization
    DESCRIPTION = "What this node does"

    def method_name(self, input_name, optional_input=None):
        # Do processing
        return (output_value,)  # Must return tuple matching RETURN_TYPES
```

## Core Type System

Types are just strings - no runtime enforcement:

| Type | Description |
|------|-------------|
| `MODEL` | The diffusion model (UNet) |
| `CLIP` | Text encoder model |
| `VAE` | Image encoder/decoder |
| `CONDITIONING` | Encoded text embeddings |
| `LATENT` | Latent space tensor (dict with "samples" key) |
| `IMAGE` | Image tensor (B, H, W, C) - values 0-1 |
| `MASK` | Mask tensor |
| `INT` | Integer value |
| `FLOAT` | Float value |
| `STRING` | Text string |

## Workflow JSON Format

Workflows are JSON dicts where keys are node IDs:

```json
{
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 12345,
            "steps": 20,
            "cfg": 7.5,
            "model": ["4", 0],       // Link: [source_node_id, output_index]
            "positive": ["6", 0],
            "negative": ["7", 0],
            "latent_image": ["5", 0]
        }
    },
    "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
            "ckpt_name": "model.safetensors"
        }
    }
}
```

**Key insight**: Links are `[node_id, output_index]` arrays. This is how the graph is encoded.

## Execution Flow

1. **Validation** (`execution.validate_prompt`)
   - Check all node classes exist
   - Validate input types
   - Build dependency graph

2. **Topological Sort**
   - Determine execution order based on input dependencies
   - Nodes with no dependencies execute first

3. **Execute Each Node** (`execution.execute`)
   - Get input data (resolve links to actual values)
   - Instantiate node class if needed
   - Call the FUNCTION method
   - Cache outputs
   - Send progress via WebSocket

4. **Caching**
   - Results are cached by input signature
   - Re-running with same inputs skips execution
   - Multiple cache strategies (LRU, RAM pressure, classic)

## Key Files

| File | Purpose |
|------|---------|
| `nodes.py` | Core node definitions (~70 built-in nodes) |
| `execution.py` | Workflow execution engine |
| `server.py` | HTTP/WebSocket API server |
| `comfy_execution/graph.py` | Dependency resolution, execution order |
| `comfy_execution/caching.py` | Output caching system |
| `folder_paths.py` | Model/output path resolution |
| `comfy/samplers.py` | Sampling algorithms |
| `comfy/sd.py` | Model loading/management |

## Node Registration

Nodes register via `NODE_CLASS_MAPPINGS` dict:

```python
NODE_CLASS_MAPPINGS = {
    "MyNode": MyNode,
    "AnotherNode": AnotherNode,
}
```

Custom nodes in `custom_nodes/` folder export their own `NODE_CLASS_MAPPINGS` which gets merged.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/prompt` | POST | Submit workflow for execution |
| `/prompt` | GET | Get queue status |
| `/queue` | POST | Clear/delete from queue |
| `/interrupt` | POST | Stop current execution |
| `/history` | GET | Get execution history |
| `/object_info` | GET | Get all node definitions |
| `/ws` | WebSocket | Real-time progress updates |

## Common Failure Points

### 1. Missing Node Classes
```
KeyError: 'CustomNodeName' not found in NODE_CLASS_MAPPINGS
```
**Cause**: Custom node not installed or failed to load.

### 2. Type Mismatches
```
Expected CONDITIONING, got LATENT
```
**Cause**: Wrong output connected to input. Not enforced at runtime - fails during execution.

### 3. Missing Models
```
FileNotFoundError: model.safetensors not found
```
**Cause**: Model path doesn't exist or isn't in search paths.

### 4. VRAM Issues
```
CUDA out of memory
```
**Cause**: Model + tensors exceed GPU memory.

### 5. Bad Input Values
```
ValueError: steps must be >= 1
```
**Cause**: Input outside valid range (min/max in INPUT_TYPES).

### 6. Dependency Cycles
```
DependencyCycleError: Circular dependency detected
```
**Cause**: Node A depends on Node B which depends on Node A.

## Translation to RawDiffusion

### Node → Python Function

ComfyUI:
```python
class KSampler:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"model": ("MODEL",), "seed": ("INT",), ...}}
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "sample"

    def sample(self, model, seed, steps, cfg, ...):
        return common_ksampler(model, seed, ...)
```

RawDiffusion equivalent:
```python
# Direct call - no class wrapper needed
latent = pipe(
    prompt=prompt,
    num_inference_steps=steps,
    guidance_scale=cfg,
    generator=torch.Generator().manual_seed(seed),
)
```

### Workflow JSON → Python Script

ComfyUI workflow:
```json
{
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
    "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 512, "height": 512}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "a cat", "clip": ["4", 1]}},
    "3": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["6", 0], ...}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0]}}
}
```

RawDiffusion equivalent:
```python
from diffusers import StableDiffusionPipeline

pipe = StableDiffusionPipeline.from_single_file("model.safetensors")
pipe.to("cuda")

image = pipe(
    prompt="a cat",
    width=512,
    height=512,
    num_inference_steps=20,
    guidance_scale=7.5,
).images[0]

image.save("output.png")
```

**Key insight**: 6 nodes become ~10 lines of clean Python. The node system adds overhead without adding clarity.

## Next Steps

1. Build a ComfyUI workflow → Python code translator
2. Map common node combinations to diffusers patterns
3. Create templates for popular workflows
4. Document edge cases and gotchas
