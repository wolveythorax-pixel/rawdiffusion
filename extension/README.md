# RawDiffusion VS Code Extension

Generate standalone Python code for image generation using diffusers. No ComfyUI required.

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "RawDiffusion"
4. Click Install

Or from command line:
```bash
code --install-extension rawdiffusion.rawdiffusion
```

## Quick Start

1. Open the **RawDiffusion Gallery** from the Activity Bar (left sidebar)
2. Browse templates by category or search
3. Click a template to see parameters
4. Click **View Code** to generate Python
5. Run the code with your local models

## How It Works

### Template to Code

When you select a template, RawDiffusion generates clean, standalone Python code:

```python
# Configuration
MODEL_PATH = "juggernautXL_v9.safetensors"

# Prompts
PROMPT = "portrait of a person, professional photography, soft lighting"
NEGATIVE_PROMPT = "blurry, low quality, artifacts"

# Generation Parameters
WIDTH = 1024
HEIGHT = 1024
STEPS = 30
CFG_SCALE = 7.0
SEED = -1

# ... pipeline code ...
```

### Prompts

**Prompts must be on a single line** for the diffusers pipeline. The extension automatically:
- Combines your base prompt with style modifiers
- Escapes special characters
- Formats everything as a single-line string

Example of how style modifiers work:
```python
# Template has style_templates:
#   "studio": "{prompt}, studio photography, soft box lighting"
#
# Your input: "product shot of headphones"
# Generated: "product shot of headphones, studio photography, soft box lighting"
```

**Writing good prompts:**
- Use commas to separate concepts: `portrait, soft lighting, shallow depth of field`
- Put important terms first: `detailed face, young woman, ...`
- Be specific: `golden hour lighting` not just `good lighting`
- Include technical terms: `85mm lens, f/1.8, bokeh`

### Negative Prompts

Negative prompts tell the model what to avoid:
```python
NEGATIVE_PROMPT = "blurry, low quality, oversaturated, cartoon, text, watermark"
```

Common negative prompt terms:
- Quality: `blurry, low quality, jpeg artifacts, pixelated`
- Style issues: `oversaturated, overexposed, underexposed`
- Unwanted elements: `text, watermark, signature, logo`
- Anatomy issues: `deformed, bad anatomy, extra fingers`

## Gallery View

### Browsing Templates

Templates are organized by:
- **Category**: txt2img, img2img, inpaint, controlnet, animation, upscale
- **Model**: JuggernautXL, DreamShaper, AnimateDiff, etc.
- **Difficulty**: beginner, intermediate, advanced

Use the search bar to find templates by name, description, or tags.

### Template Parameters

Each template has configurable parameters:

| Type | Description |
|------|-------------|
| `string` | Text input (prompts, paths) |
| `number` | Decimal values (cfg_scale, strength) |
| `integer` | Whole numbers (steps, seed, dimensions) |
| `boolean` | On/off toggles |
| `select` | Dropdown choices |
| `image` | File path to an image |

### Presets

Many templates include presets - pre-configured parameter combinations for common use cases. Click a preset button to apply its settings.

## Output Panel

After generating an image, the Output panel shows:
- Image preview
- File path
- **Push to GIMP** - Opens the image in GIMP
- **Push to DaVinci** - Copies to your DaVinci Media Pool folder

Configure paths in settings:
```json
{
  "rawdiffusion.gimpPath": "/usr/bin/gimp",
  "rawdiffusion.davinciMediaPath": "/path/to/davinci/media"
}
```

## DaVinci Resolve Integration

### Getting Source Images from Timeline

Use the command **RawDiffusion: Insert Source Image Path** to:
1. Get the file path of your current DaVinci timeline clip
2. Or select an image from file browser

The path is inserted at your cursor position in the code:
```python
IMAGE = "/path/to/your/frame.png"
```

### Frame Export for img2img

1. Export a frame from DaVinci Resolve
2. Use Insert Source Image Path to add it to your code
3. Generate a stylized version
4. Push result back to DaVinci

## Running Generated Code

### Requirements

```bash
pip install torch diffusers transformers accelerate
```

For specific templates you may also need:
```bash
pip install controlnet-aux   # ControlNet preprocessing
pip install opencv-python    # Canny edge detection
```

### Model Setup

1. Download models from [CivitAI](https://civitai.com) or [HuggingFace](https://huggingface.co)
2. Update `MODEL_PATH` in the generated code:

```python
# Local .safetensors file
MODEL_PATH = "/path/to/your/model.safetensors"

# Or HuggingFace model ID
MODEL_PATH = "stabilityai/stable-diffusion-xl-base-1.0"
```

### Running

```bash
python your_script.py
```

Output saves to `./outputs/` by default.

## Configuration

### Extension Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `rawdiffusion.outputDirectory` | Where to save generated images | `./outputs` |
| `rawdiffusion.enableFreeU` | Enable FreeU quality enhancement | `false` |
| `rawdiffusion.enableMemoryOptimization` | Use CPU offloading for low VRAM | `false` |
| `rawdiffusion.gimpPath` | Path to GIMP executable | auto-detect |
| `rawdiffusion.davinciMediaPath` | DaVinci Resolve media folder | none |

### Quality Enhancements

**FreeU** improves image quality at no speed cost:
```python
ENABLE_FREEU = True
FREEU_S1 = 0.9
FREEU_S2 = 0.2
FREEU_B1 = 1.3
FREEU_B2 = 1.4
```

**SAG (Self-Attention Guidance)** improves prompt adherence:
```python
# Use SAG pipeline instead of standard
from diffusers import StableDiffusionSAGPipeline
```

## Creating Custom Templates

Templates are JSON files in `templates/by-model/` or `templates/by-task/`.

### Basic Structure

```json
{
  "id": "my-template",
  "name": "My Custom Template",
  "version": "1.0.0",
  "description": "Description of what this template does",
  "author": "Your Name",
  "tags": ["tag1", "tag2"],
  "difficulty": "beginner",
  "category": "txt2img",
  "preview": "portrait.svg",

  "requirements": {
    "base_model": {
      "architecture": "sdxl",
      "recommended": ["juggernautXL_v9.safetensors"],
      "vram_minimum_gb": 8
    }
  },

  "parameters": {
    "prompt": {
      "type": "string",
      "default": "your default prompt",
      "label": "Prompt",
      "group": "basic"
    },
    "steps": {
      "type": "integer",
      "default": 30,
      "min": 10,
      "max": 100,
      "group": "advanced"
    }
  },

  "pipeline": [
    {"id": "load_model", "type": "load_model"},
    {"id": "generate", "type": "generate"},
    {"id": "decode", "type": "decode"},
    {"id": "save", "type": "save"}
  ],

  "presets": {
    "preset_name": {
      "prompt": "preset prompt",
      "steps": 40,
      "description": "What this preset is for"
    }
  }
}
```

### Parameter Types

```json
{
  "my_string": {
    "type": "string",
    "default": "text value"
  },
  "my_number": {
    "type": "number",
    "default": 7.5,
    "min": 1.0,
    "max": 20.0,
    "step": 0.5
  },
  "my_integer": {
    "type": "integer",
    "default": 30,
    "min": 1,
    "max": 100
  },
  "my_boolean": {
    "type": "boolean",
    "default": true
  },
  "my_select": {
    "type": "select",
    "default": "option1",
    "options": ["option1", "option2", "option3"]
  },
  "my_image": {
    "type": "image",
    "label": "Input Image"
  }
}
```

### Adding Style Modifiers

Use the `build_prompt` pipeline step to add automatic style modifiers:

```json
{
  "pipeline": [
    {
      "id": "build_prompt",
      "type": "build_prompt",
      "config": {
        "style_templates": {
          "cinematic": "{prompt}, cinematic lighting, film grain, 35mm",
          "portrait": "{prompt}, professional portrait, soft lighting",
          "anime": "{prompt}, anime style, cel shading"
        }
      }
    }
  ],
  "parameters": {
    "style": {
      "type": "select",
      "default": "cinematic",
      "options": ["cinematic", "portrait", "anime"]
    }
  }
}
```

The `{prompt}` placeholder is replaced with the user's prompt, and the style suffix is added automatically.

## Troubleshooting

### "CUDA out of memory"

Enable memory optimization in settings, or add to your code:
```python
pipe.enable_model_cpu_offload()
# or for very low VRAM:
pipe.enable_sequential_cpu_offload()
```

### "Model not found"

Check that `MODEL_PATH` points to an existing file:
```python
MODEL_PATH = "/absolute/path/to/model.safetensors"
```

### "No module named diffusers"

Install dependencies:
```bash
pip install diffusers transformers accelerate
```

### Images look bad

1. Increase steps (30-50 for quality)
2. Adjust CFG scale (7-9 for most models)
3. Enable FreeU
4. Check your negative prompt
5. Try a different seed

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/rawdiffusion/issues)
- Discussions: [GitHub Discussions](https://github.com/yourusername/rawdiffusion/discussions)

## License

MIT - Use it however you want.
