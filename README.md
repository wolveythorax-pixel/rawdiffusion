# RawDiffusion

**Browse visually. Code cleanly. Own everything.**

No nodes. No black boxes. No subscriptions.

Just a beautiful gallery of templates, with the code right there for you to see, learn, and modify.

---

## The Problem

Every image generation tool hides the code from you:

- **ComfyUI** buries it behind confusing node graphs
- **Forge/A1111** hides it behind forms and dropdowns
- **Cloud services** hide it behind paywalls and APIs you can't see
- **Cloud services** show you pretty demos but never how they're made

When something breaks, you're stuck. When you want to customize, you're limited. You're always dependent on the tool instead of understanding it.

## The Solution

RawDiffusion shows you everything:

1. **Browse** - A beautiful card-based gallery (like the sites you already love)
2. **Click** - Open any template and see the exact code that made it
3. **Learn** - AI assistant explains every line
4. **Modify** - Change the code, hit run, see results
5. **Own** - Save your workflows, share them, run them anywhere

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ Template│ │ Template│ │ Template│ │ Template│   Gallery  │
│  │  Card   │ │  Card   │ │  Card   │ │  Card   │   View     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                              │
│  ┌──────────────────────┐ ┌─────────────────────┐           │
│  │                      │ │                     │           │
│  │   Live Preview       │ │   Generation        │           │
│  │                      │ │   History           │           │
│  └──────────────────────┘ └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     PYTHON SERVER                            │
│  Local Models │ Stability API │ Replicate │ FAL │ RunPod    │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VS CODE EXTENSION                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ # provider: local                                      │ │
│  │ # model: juggernautXL_v9.safetensors                  │ │
│  │                                                        │ │
│  │ from diffusers import StableDiffusionXLPipeline       │ │
│  │                                                        │ │
│  │ pipe = load_model()                                   │ │
│  │ image = pipe(                                         │ │
│  │     prompt="a sunset over mountains",                 │ │
│  │     negative_prompt="blurry, low quality",            │ │
│  │     steps=30,                                         │ │
│  │     cfg_scale=7.5                                     │ │
│  │ )                                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│  [Run] [Explain] [Save as Template]                         │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Bring Your Own Everything (BYOK)

- **Local models** - Use your existing checkpoints (SDXL, Flux, SD 1.5, etc.)
- **Stability AI** - Official API
- **Replicate** - Thousands of models, pay per run
- **FAL.ai** - Fast inference
- **RunPod/Modal** - Serverless GPU
- **Any OpenAI-compatible endpoint**

Same code, any backend. Just change the provider line.

### AI-Powered Learning

- Highlight any code → get an explanation
- "Why is cfg_scale set to 7.5?"
- "What does this sampler do?"
- "How do I add ControlNet to this?"

Works with Copilot, Claude, or any AI assistant you have configured.

### Community Templates

Browse templates organized by:
- Model (SDXL, Flux, SD 1.5, Pony, etc.)
- Style (photorealistic, anime, abstract, painterly)
- Use case (portraits, landscapes, product shots, concept art)

Every template shows the output AND the code. No secrets.

### No Lock-In

- Templates are just Python files
- Export and run anywhere
- No account required
- No credits, no subscriptions
- Fork it, modify it, make it yours

## Quick Start

```bash
# Install the VS Code extension
code --install-extension rawdiffusion.rawdiffusion

# Clone for local development
git clone https://github.com/yourusername/rawdiffusion
cd rawdiffusion

# Start the server
cd server
pip install -r requirements.txt
python main.py

# Open VS Code and start creating
```

## Philosophy

The web used to have "View Source." You could see how anything was built.

AI image generation lost that. Tools got prettier but less transparent. You became a user, not a creator.

RawDiffusion brings View Source back. Every image has a recipe. Every recipe is code. Every coder can learn.

**See it. Understand it. Own it.**

---

## Contributing

This is open source because the community should own their tools.

- Add templates
- Improve the UI
- Add new providers
- Write documentation
- Report bugs

PRs welcome. Let's build this together.

## License

MIT - Do whatever you want with it.

---

*"Browse visually. Code cleanly. Own everything."*
