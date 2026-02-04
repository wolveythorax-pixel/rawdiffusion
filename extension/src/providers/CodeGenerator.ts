import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Template, TemplateParameter } from './TemplateManager';

export class CodeGenerator {
    constructor(private context: vscode.ExtensionContext) {}

    async generate(template: Template, parameters?: Record<string, any>): Promise<string> {
        const params = parameters || this.getDefaultParameters(template);
        const config = vscode.workspace.getConfiguration('rawdiffusion');

        const lines: string[] = [];

        // Header
        lines.push('# RawDiffusion Generated Code');
        lines.push(`# Template: ${template.name}`);
        lines.push(`# Generated: ${new Date().toISOString()}`);
        lines.push('#');
        lines.push(`# ${template.description}`);
        lines.push('');

        // Imports
        lines.push(...this.generateImports(template, params));
        lines.push('');

        // Configuration
        lines.push(...this.generateConfig(template, params, config));
        lines.push('');

        // Main code
        lines.push(...this.generateMainCode(template, params, config));

        return lines.join('\n');
    }

    async importFromComfyUI(filePath: string): Promise<string> {
        // This would call the Python translator server
        // For now, return a placeholder
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.json') {
            const content = fs.readFileSync(filePath, 'utf-8');
            // TODO: Call Python translator
            return `# Imported from ComfyUI workflow: ${path.basename(filePath)}
#
# This feature requires the RawDiffusion server to be running.
# Start it with: python -m rawdiffusion.server
#
# Workflow JSON:
# ${content.substring(0, 500)}...
`;
        }

        // Handle PNG/WebP with embedded workflow
        return `# Import from image not yet implemented
# File: ${filePath}
`;
    }

    private getDefaultParameters(template: Template): Record<string, any> {
        const params: Record<string, any> = {};

        if (template.parameters) {
            for (const [key, param] of Object.entries(template.parameters)) {
                params[key] = param.default;
            }
        }

        return params;
    }

    private generateImports(template: Template, params: Record<string, any>): string[] {
        const imports: string[] = [
            'import torch',
            'from pathlib import Path',
        ];

        const arch = template.requirements?.base_model?.architecture || 'sd15';

        // Pipeline imports
        if (arch === 'sdxl') {
            imports.push('from diffusers import StableDiffusionXLPipeline');
        } else if (arch === 'sd15') {
            imports.push('from diffusers import StableDiffusionPipeline');
            // Add SAG if needed
            if (params.enable_sag) {
                imports.push('from diffusers import StableDiffusionSAGPipeline');
            }
        }

        // ControlNet
        if (template.requirements?.controlnets?.length) {
            imports.push('from diffusers import ControlNetModel');

            for (const cn of template.requirements.controlnets) {
                if (cn.type === 'canny') {
                    imports.push('import cv2');
                    imports.push('import numpy as np');
                } else if (cn.type === 'openpose') {
                    imports.push('from controlnet_aux import OpenposeDetector');
                } else if (cn.type === 'depth') {
                    imports.push('from transformers import DPTForDepthEstimation, DPTImageProcessor');
                }
            }
        }

        // Image handling
        if (template.category !== 'txt2img' || template.requirements?.controlnets?.length) {
            imports.push('from PIL import Image');
        }

        // AnimateDiff
        if (template.category === 'animation' || template.category === 'video') {
            imports.push('from diffusers import AnimateDiffPipeline, MotionAdapter');
            imports.push('from diffusers.utils import export_to_video');
        }

        // Sort and deduplicate
        return [...new Set(imports)].sort((a, b) => {
            if (a.startsWith('import') && !b.startsWith('import')) return -1;
            if (!a.startsWith('import') && b.startsWith('import')) return 1;
            return a.localeCompare(b);
        });
    }

    private generateConfig(template: Template, params: Record<string, any>, config: vscode.WorkspaceConfiguration): string[] {
        const lines: string[] = ['# Configuration'];

        // Model path
        const recommendedModels = template.requirements?.base_model?.recommended || ['model.safetensors'];
        lines.push(`MODEL_PATH = "${recommendedModels[0]}"`);
        lines.push('');

        // Add all user-visible parameters
        if (template.parameters) {
            for (const [key, param] of Object.entries(template.parameters)) {
                const value = params[key] ?? param.default;
                const comment = param.description ? `  # ${param.description}` : '';

                if (param.type === 'string') {
                    if (key.includes('prompt')) {
                        lines.push(`${key.toUpperCase()} = """${value}"""`);
                    } else {
                        lines.push(`${key.toUpperCase()} = "${value}"${comment}`);
                    }
                } else if (param.type === 'boolean') {
                    lines.push(`${key.toUpperCase()} = ${value ? 'True' : 'False'}${comment}`);
                } else {
                    lines.push(`${key.toUpperCase()} = ${value}${comment}`);
                }
            }
        }

        // Quality enhancements
        lines.push('');
        lines.push('# Quality Enhancements');
        lines.push(`ENABLE_FREEU = ${config.get('enableFreeU') ? 'True' : 'False'}`);
        lines.push('FREEU_S1 = 0.9');
        lines.push('FREEU_S2 = 0.2');
        lines.push('FREEU_B1 = 1.3');
        lines.push('FREEU_B2 = 1.4');

        return lines;
    }

    private generateMainCode(template: Template, params: Record<string, any>, config: vscode.WorkspaceConfiguration): string[] {
        const lines: string[] = [];

        // Device setup
        lines.push('# Setup');
        lines.push('device = "cuda" if torch.cuda.is_available() else "cpu"');
        lines.push('dtype = torch.float16 if device == "cuda" else torch.float32');
        lines.push('');

        // Load model
        lines.push(...this.generateModelLoading(template, params, config));
        lines.push('');

        // Generation
        lines.push(...this.generateInference(template, params));
        lines.push('');

        // Save
        lines.push('# Save output');
        const outputDir = config.get('outputDirectory') || './outputs';
        lines.push(`output_dir = Path("${outputDir}")`);
        lines.push('output_dir.mkdir(exist_ok=True)');
        lines.push('');

        if (template.category === 'animation' || template.category === 'video') {
            lines.push('output_path = output_dir / "output.mp4"');
            lines.push('export_to_video(frames, str(output_path), fps=FPS if "FPS" in dir() else 16)');
        } else {
            lines.push('output_path = output_dir / f"output_{SEED}.png"');
            lines.push('image.save(output_path)');
        }

        lines.push('print(f"Saved to {output_path}")');

        return lines;
    }

    private generateModelLoading(template: Template, params: Record<string, any>, config: vscode.WorkspaceConfiguration): string[] {
        const lines: string[] = ['# Load model'];
        const arch = template.requirements?.base_model?.architecture || 'sd15';

        // ControlNet loading
        if (template.requirements?.controlnets?.length) {
            for (let i = 0; i < template.requirements.controlnets.length; i++) {
                const cn = template.requirements.controlnets[i];
                const model = cn.model || `lllyasviel/control_v11p_sd15_${cn.type}`;
                lines.push(`controlnet_${i} = ControlNetModel.from_pretrained("${model}", torch_dtype=dtype)`);
            }
            lines.push('');
        }

        // Pipeline loading
        if (arch === 'sdxl') {
            lines.push('pipe = StableDiffusionXLPipeline.from_single_file(');
        } else {
            lines.push('pipe = StableDiffusionPipeline.from_single_file(');
        }
        lines.push('    MODEL_PATH,');
        lines.push('    torch_dtype=dtype,');
        lines.push(')');
        lines.push('pipe.to(device)');

        // Memory optimization
        if (config.get('enableMemoryOptimization')) {
            lines.push('');
            lines.push('# Memory optimization');
            lines.push('pipe.enable_model_cpu_offload()');
        }

        // FreeU
        lines.push('');
        lines.push('# Quality enhancements');
        lines.push('if ENABLE_FREEU:');
        lines.push('    pipe.enable_freeu(s1=FREEU_S1, s2=FREEU_S2, b1=FREEU_B1, b2=FREEU_B2)');

        return lines;
    }

    private generateInference(template: Template, params: Record<string, any>): string[] {
        const lines: string[] = ['# Generate'];

        // Seed setup
        lines.push('if SEED == -1:');
        lines.push('    import random');
        lines.push('    SEED = random.randint(0, 2**32 - 1)');
        lines.push('generator = torch.Generator(device).manual_seed(SEED)');
        lines.push('');

        // Handle different generation types
        if (template.category === 'animation' || template.category === 'video') {
            lines.push('frames = pipe(');
        } else {
            lines.push('image = pipe(');
        }

        lines.push('    prompt=PROMPT,');
        lines.push('    negative_prompt=NEGATIVE_PROMPT,');

        // Dimensions
        if (template.parameters?.width && template.parameters?.height) {
            lines.push('    width=WIDTH,');
            lines.push('    height=HEIGHT,');
        }

        // Common parameters
        lines.push('    num_inference_steps=STEPS,');
        lines.push('    guidance_scale=CFG_SCALE,');
        lines.push('    generator=generator,');

        // img2img specific
        if (template.category === 'img2img') {
            lines.push('    image=Image.open("input.png"),');
            lines.push('    strength=DENOISE_STRENGTH,');
        }

        // Animation specific
        if (template.category === 'animation' || template.category === 'video') {
            lines.push('    num_frames=FRAME_COUNT if "FRAME_COUNT" in dir() else 16,');
        }

        lines.push(').images[0]' + (template.category === 'animation' || template.category === 'video' ? '' : ''));

        return lines;
    }
}
