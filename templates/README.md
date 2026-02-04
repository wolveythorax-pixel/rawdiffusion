# RawDiffusion Templates

Extensible template system designed to work across multiple applications.

## Directory Structure

```
templates/
├── schema/
│   └── template-schema.json    # JSON Schema for validation
├── by-model/                   # Templates organized by model
│   ├── juggernaut-xl/
│   ├── dreamshaper/
│   ├── anything-v5/
│   ├── realvisxl/
│   └── animatediff/
├── by-task/                    # Templates organized by task type
│   ├── inpaint-brush.json
│   ├── controlnet-pose.json
│   ├── upscale-enhance.json
│   └── img2img-style-transfer.json
└── examples/                   # Example outputs (preview images)
```

## Template Categories

| Category | Description | Best For |
|----------|-------------|----------|
| `txt2img` | Text to image generation | Creating from scratch |
| `img2img` | Image to image transformation | Style transfer, variations |
| `inpaint` | Selective regeneration | Object removal, replacement |
| `outpaint` | Extend image boundaries | Expanding compositions |
| `upscale` | AI-enhanced enlargement | Quality improvement |
| `controlnet` | Pose/depth/edge guided | Character consistency |
| `animation` | Video clip generation | Motion content |
| `composite` | Multi-step pipelines | Complex workflows |

## Cross-Application Design

Templates are designed to work in multiple environments:

### VS Code Extension (Primary)
- Full Python code generation
- Interactive parameter editing
- Live preview
- Direct execution

### DaVinci Resolve (Video)
- Timeline integration
- Batch frame processing
- Marker-based generation points
- Fusion node compatibility

### GIMP (Image Editing)
- Brush-based inpainting
- Selection as mask
- Layer-based output
- Non-destructive workflow

## Template Structure

```json
{
  "id": "unique-template-id",
  "name": "Human Readable Name",
  "version": "1.0.0",
  "description": "What this template does",
  "category": "txt2img|img2img|inpaint|...",
  "difficulty": "beginner|intermediate|advanced",

  "requirements": {
    "base_model": {
      "architecture": "sd15|sdxl|flux",
      "recommended": ["model1.safetensors"],
      "vram_minimum_gb": 8
    },
    "controlnets": [],
    "loras": [],
    "extensions": []
  },

  "parameters": {
    "param_name": {
      "type": "string|number|select|image",
      "default": "value",
      "label": "Display Name",
      "group": "basic|style|advanced"
    }
  },

  "pipeline": [
    {"id": "step1", "type": "load_model"},
    {"id": "step2", "type": "generate"},
    {"id": "step3", "type": "save"}
  ],

  "presets": {
    "preset_name": {
      "param1": "value1",
      "description": "What this preset does"
    }
  },

  "app_adaptations": {
    "vscode": {},
    "davinci": {},
    "gimp": {}
  }
}
```

## Available Templates

### By Model

| Model | Templates |
|-------|-----------|
| JuggernautXL | Photorealistic Portrait, Cinematic Scene |
| DreamShaper | Fantasy Character |
| AnythingV5 | Anime Character |
| AnimateDiff | Video Generation |

### By Task

| Task | Template |
|------|----------|
| Inpainting | Brush Inpaint (GIMP optimized) |
| Pose Control | ControlNet OpenPose |
| Upscaling | AI Upscale & Enhance |
| Style Transfer | Img2Img Style Transfer |

## Creating New Templates

1. Copy an existing template as a starting point
2. Update `id`, `name`, and `description`
3. Define `requirements` for models/extensions
4. Set up `parameters` with appropriate types
5. Configure the `pipeline` steps
6. Add `presets` for common use cases
7. Define `app_adaptations` for each target app

### Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text input | Prompts |
| `number` | Decimal number | CFG scale |
| `integer` | Whole number | Steps, seed |
| `boolean` | True/false toggle | Enable FreeU |
| `select` | Dropdown options | Style presets |
| `image` | Image file input | Reference image |
| `video` | Video file input | AnimateDiff input |
| `color` | Color picker | Background color |

### Parameter Groups

- `basic` - Essential parameters (always visible)
- `style` - Style-related options
- `advanced` - Power user options (collapsible)
- `input` - File inputs
- `output` - Output settings

## Future App Integrations

### DaVinci Resolve Plugin
```python
# Timeline integration
- Read markers as generation points
- Batch process frame ranges
- Output directly to media pool
- Integrate with Fusion for compositing
```

### GIMP Plugin
```python
# Brush-based workflow
- Paint mask directly on canvas
- Selection converts to mask
- Output as new layer (non-destructive)
- Real-time preview overlay
```

### Blender Add-on (Planned)
```python
# 3D workflow integration
- Texture generation from UV maps
- Render pass to image enhancement
- Material preview generation
```

## Contributing Templates

1. Fork the repository
2. Create template following the schema
3. Test with the translator
4. Add preview images to `examples/`
5. Submit PR

Templates should be:
- Well documented
- Tested with recommended models
- Include meaningful presets
- Have app_adaptations where applicable
