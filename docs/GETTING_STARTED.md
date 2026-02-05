# Getting Started with RawDiffusion

Run Stable Diffusion locally with clean Python code. No subscriptions, no cloud dependency.

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | 4GB VRAM (SD 1.5) | 8GB+ VRAM (SDXL) |
| RAM | 8GB | 16GB+ |
| Storage | 10GB | 50GB+ (for models) |
| OS | Windows/Linux/macOS | Linux recommended |

### GPU Compatibility
- **NVIDIA**: GTX 1060+ (CUDA)
- **AMD**: RX 5000+ (ROCm on Linux)
- **Apple Silicon**: M1/M2/M3 (MPS)
- **CPU**: Works but very slow

## Step 1: Install Python

You need Python 3.10 or 3.11 (3.12 has some compatibility issues).

```bash
# Check your version
python --version

# Ubuntu/Debian
sudo apt install python3.10 python3.10-venv

# macOS (with Homebrew)
brew install python@3.11

# Windows: Download from python.org
```

## Step 2: Install PyTorch

Install PyTorch with CUDA support for your GPU:

```bash
# NVIDIA GPU (CUDA 11.8)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# NVIDIA GPU (CUDA 12.1)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# AMD GPU (ROCm - Linux only)
pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm5.6

# Apple Silicon
pip install torch torchvision

# CPU only
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

## Step 3: Install Diffusers

```bash
pip install diffusers transformers accelerate safetensors
```

## Step 4: Download Models

Models are the "brains" of image generation. Download from these trusted sources:

### SDXL Models (Recommended for quality)
| Model | Best For | VRAM | Link |
|-------|----------|------|------|
| JuggernautXL v9 | Photorealistic | 8GB | [CivitAI](https://civitai.com/models/133005/juggernaut-xl) |
| RealVisXL v5 | Photorealistic | 8GB | [CivitAI](https://civitai.com/models/139562/realvisxl-v50) |
| DreamShaper XL | Artistic/Fantasy | 8GB | [CivitAI](https://civitai.com/models/112902/dreamshaper-xl) |
| Pony Diffusion XL | Stylized/Anime | 8GB | [CivitAI](https://civitai.com/models/257749/pony-diffusion-v6-xl) |

### SD 1.5 Models (Lower VRAM requirement)
| Model | Best For | VRAM | Link |
|-------|----------|------|------|
| DreamShaper 8 | General/Fantasy | 4GB | [CivitAI](https://civitai.com/models/4384/dreamshaper) |
| RealisticVision v5 | Photorealistic | 4GB | [CivitAI](https://civitai.com/models/4201/realistic-vision-v60-b1) |
| AnythingV5 | Anime | 4GB | [CivitAI](https://civitai.com/models/9409/anything-v5) |

### Where to Put Models

Create a `models` folder and organize by type:

```
~/sd-models/
├── checkpoints/          # Main models (.safetensors)
│   ├── juggernautXL_v9.safetensors
│   └── dreamshaper_8.safetensors
├── loras/                # LoRA fine-tunes
├── controlnet/           # ControlNet models
└── upscalers/            # Upscale models
```

## Step 5: Run Your First Generation

Create a file called `test.py`:

```python
import torch
from diffusers import StableDiffusionXLPipeline

# Path to your downloaded model
MODEL_PATH = "~/sd-models/checkpoints/juggernautXL_v9.safetensors"

# Setup
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

# Load model
pipe = StableDiffusionXLPipeline.from_single_file(
    MODEL_PATH,
    torch_dtype=dtype,
)
pipe.to(device)

# Generate
image = pipe(
    prompt="a golden retriever in a field of sunflowers, golden hour lighting",
    negative_prompt="blurry, low quality, distorted",
    num_inference_steps=30,
    guidance_scale=7.0,
).images[0]

# Save
image.save("output.png")
print("Saved to output.png")
```

Run it:
```bash
python test.py
```

## Step 6: Use RawDiffusion Templates

Now use RawDiffusion to generate code from templates:

### VS Code Extension
1. Install the RawDiffusion extension
2. Open the Gallery panel
3. Click a template
4. Click "View Code"
5. Update the MODEL_PATH
6. Run!

### Web UI
1. Start the server: `cd server && python main.py`
2. Open `web/index.html` in your browser
3. Browse templates
4. Click "Copy" to get the code

## Troubleshooting

### "CUDA out of memory"

Your GPU doesn't have enough VRAM. Try:

```python
# Option 1: CPU offloading (slower but works)
pipe.enable_model_cpu_offload()

# Option 2: Attention slicing (less VRAM)
pipe.enable_attention_slicing()

# Option 3: Use a smaller model (SD 1.5 instead of SDXL)
```

### "Model not found"

Make sure the path is correct:
```python
# Use absolute path
MODEL_PATH = "/home/username/sd-models/checkpoints/model.safetensors"

# Or expand ~
from pathlib import Path
MODEL_PATH = Path("~/sd-models/checkpoints/model.safetensors").expanduser()
```

### "No CUDA available"

PyTorch can't find your GPU:
```bash
# Check if CUDA is available
python -c "import torch; print(torch.cuda.is_available())"

# Check CUDA version
nvidia-smi

# Reinstall PyTorch with correct CUDA version
```

### Slow generation

- Make sure you're using GPU, not CPU
- Use `torch.float16` dtype
- Enable FreeU for faster quality:
  ```python
  pipe.enable_freeu(s1=0.9, s2=0.2, b1=1.3, b2=1.4)
  ```

## Next Steps

- Browse more templates in the Gallery
- Try different models for different styles
- Learn about ControlNet for pose/composition control
- Explore LoRAs for specific styles or characters
- Join the community to share your creations

## Resources

- [Diffusers Documentation](https://huggingface.co/docs/diffusers)
- [CivitAI](https://civitai.com) - Model downloads
- [HuggingFace](https://huggingface.co/models?pipeline_tag=text-to-image) - More models
- [Stable Diffusion Subreddit](https://reddit.com/r/StableDiffusion)
