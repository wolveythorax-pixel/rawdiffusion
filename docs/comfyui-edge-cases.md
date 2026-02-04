# ComfyUI Edge Cases & Advanced Patterns

Beyond basic txt2img, real-world ComfyUI workflows use these advanced patterns that RawDiffusion must handle.

## 1. Multiple ControlNets

Combining several control types simultaneously:

```
ControlNet Canny (edge detection)
    + ControlNet Depth (depth map)
    + ControlNet OpenPose (pose skeleton)
    → All applied to same generation
```

**Nodes involved:**
- `ControlNetLoader` (multiple)
- `ControlNetApply` / `ControlNetApplyAdvanced` (chained)
- Preprocessors: `CannyEdgePreprocessor`, `DepthAnythingV2Preprocessor`, `DWPreprocessor`

**RawDiffusion translation:** diffusers `MultiControlNetModel` or sequential application

---

## 2. IPAdapter (Image Prompting)

Use reference images instead of/alongside text prompts:

**Variants:**
- Basic IPAdapter - general style/subject transfer
- IPAdapter Plus - stronger influence
- IPAdapter FaceID - face consistency
- IPAdapter Light - subtle influence
- Regional IPAdapter - masked areas only

**Nodes:**
- `IPAdapterModelLoader`
- `CLIPVisionLoader`
- `IPAdapterAdvanced`
- `IPAdapterFaceID`

**Key insight:** IPAdapter is like "1-image LoRA" - transfers subject/style from reference

---

## 3. LoRA Stacking

Multiple LoRAs with different weights:

```
Base Model
    + LoRA 1 (style) @ 0.8 strength
    + LoRA 2 (character) @ 0.6 strength
    + LoRA 3 (detail) @ 0.4 strength
```

**Nodes:**
- `LoraLoader` (chained)
- `CR LoRA Stack` (custom node for multiple at once)

**Block Weight Control:**
- `LoRA Loader (Block Weight)` - control individual transformer blocks
- Vector format: `1,1,1,1,0.5,0.5,0.5,0,0,0,0,0` (different weights per block)

---

## 4. Regional Prompting

Different prompts for different image areas:

```
Mask 1 (left side)  → "woman with red hair"
Mask 2 (right side) → "man with blue shirt"
Background mask     → "forest landscape"
```

**Nodes:**
- `Regional Prompt Simple`
- `Regional Prompt By Color Mask`
- `Regional IPAdapter`
- `ConditioningSetMask`

**From:** ComfyUI-Inspire-Pack

---

## 5. SDXL Refiner Pipeline

Two-stage generation with base + refiner:

```
SDXL Base (steps 1-20)
    → Latent output
    → SDXL Refiner (steps 21-30)
    → Final image
```

**Nodes:**
- `CheckpointLoaderSimple` (×2 - base + refiner)
- `KSamplerAdvanced` (with start_at_step / end_at_step)

---

## 6. AnimateDiff / Video Generation

**Components:**
- Motion modules (mm_sd15_v3, etc.)
- Context windows (sliding window for long videos)
- Prompt scheduling (different prompts at different frames)
- Frame interpolation

**Nodes from ComfyUI-AnimateDiff-Evolved:**
- `AnimateDiffLoaderWithContext`
- `AnimateDiffSampler`
- `AnimateDiffSettings`
- `PromptSchedule` / `BatchPromptSchedule`
- `Context Options` nodes

**Companion packs needed:**
- ComfyUI-VideoHelperSuite (video I/O)
- ComfyUI-Advanced-ControlNet (for ControlNet + AnimateDiff)

---

## 7. Segmentation & Masking

**Models:**
- SAM2 (Segment Anything 2)
- GroundingDINO (text-guided detection)
- FashionSegmentClothing
- PersonMaskUltra

**Operations:**
- Mask growth/shrink
- Mask composition (add, subtract, intersect)
- Mask inversion
- Mask blur/feather

**Nodes:**
- `SAM2Segment`
- `GroundingDinoSAMSegment`
- `MaskComposite`
- `GrowMask`
- `InvertMask`

---

## 8. Inpainting & Outpainting

**Inpainting:** Replace masked region
**Outpainting:** Extend image beyond borders

**Nodes:**
- `VAEEncodeForInpaint`
- `SetLatentNoiseMask`
- `InpaintModelConditioning`
- `ImagePadForOutpaint`

**Special models:**
- Inpainting checkpoints (trained for this)
- BrushNet (newer approach)
- Fooocus Inpaint

---

## 9. Upscaling Chains

Multiple upscalers in sequence:

```
Image (512×512)
    → Latent Upscale (1.5×)
    → KSampler (denoise 0.4)
    → VAE Decode
    → ESRGAN Upscale (4×)
    → Final (3072×3072)
```

**Nodes:**
- `LatentUpscale` / `LatentUpscaleBy`
- `ImageScale` / `ImageScaleBy`
- `UpscaleModelLoader`
- `ImageUpscaleWithModel`

**Upscale models:** ESRGAN, RealESRGAN, SwinIR, etc.

---

## 10. VAE Override

Using different VAE than checkpoint includes:

```
Checkpoint → Model + CLIP + VAE (built-in)
                              ↓
                        VAELoader → Better VAE
```

**Why:** Some VAEs produce better colors/details than checkpoint default

**Nodes:**
- `VAELoader`
- Custom VAE connection instead of checkpoint VAE output

---

## 11. Model Merging

Combining multiple checkpoints:

**Methods:**
- Weighted sum: `A * 0.7 + B * 0.3`
- Add difference: `A + (B - C) * ratio`
- Block-level merging

**Nodes:**
- `CheckpointLoader` (multiple)
- `ModelMergeSimple`
- `ModelMergeBlocks`
- `ModelMergeSD1` / `ModelMergeSDXL`

---

## 12. Embeddings & Textual Inversions

Custom trained embeddings in prompts:

```
"photo of embedding:my_character in a forest"
```

**Nodes:**
- Embeddings auto-loaded from `embeddings/` folder
- Referenced in prompt text with `embedding:name` syntax

---

## 13. Prompt Scheduling / Travel

Different prompts at different denoising steps:

```
Steps 1-10:  "rough sketch of a cat"
Steps 11-20: "detailed painting of a cat"
```

**Nodes:**
- `PromptSchedule`
- `BatchPromptSchedule` (from FizzNodes)
- `ConditioningSetTimestepRange`

---

## 14. GLIGEN (Grounded Generation)

Position objects with bounding boxes:

```
Box 1 (0,0,256,256): "red apple"
Box 2 (256,0,512,256): "green pear"
```

**Nodes:**
- `GLIGENLoader`
- `GLIGENTextBoxApply`

---

## 15. unCLIP (Image Variation)

Generate variations of input image:

```
Input image → CLIP Vision Encode → unCLIP conditioning → KSampler
```

**Nodes:**
- `unCLIPCheckpointLoader`
- `CLIPVisionEncode`
- `unCLIPConditioning`

---

## 16. Batch Processing

Multiple images in single generation:

**Methods:**
- `EmptyLatentImage` with `batch_size > 1`
- `LatentFromBatch` to extract individual latents
- `RepeatLatentBatch` to duplicate
- `ImageBatch` to combine images

---

## 17. Custom Noise Types

Non-standard noise for different effects:

**From AnimateDiff-Evolved:**
- Noise Types nodes
- Noise Layers
- `seed_override` / `seed_offset` / `batch_offset`

---

## Translation Priority for RawDiffusion

**High priority (common workflows):**
1. Basic txt2img ✓
2. ControlNet (single and multiple)
3. LoRA loading and stacking
4. IPAdapter basic
5. Inpainting
6. Upscaling

**Medium priority:**
7. SDXL Refiner
8. Regional prompting
9. VAE override
10. Img2img

**Low priority (complex/niche):**
11. AnimateDiff
12. Model merging
13. GLIGEN
14. unCLIP
15. Segmentation pipelines

---

## Sources

- [ComfyUI Official Templates](https://docs.comfy.org/interface/features/template)
- [OpenArt Workflow Templates](https://openart.ai/workflows/templates)
- [IPAdapter Plus GitHub](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
- [AnimateDiff-Evolved GitHub](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- [ComfyUI-Inspire-Pack](https://github.com/ltdrdata/ComfyUI-Inspire-Pack)
- [ControlNet + IPAdapter Guide](https://comfyui.org/en/image-style-transfer-controlnet-ipadapter-workflow)
- [ComfyWorkflows.com](https://comfyworkflows.com/)
