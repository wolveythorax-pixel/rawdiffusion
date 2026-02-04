import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';

export interface Template {
    id: string;
    name: string;
    version: string;
    description: string;
    author?: string;
    tags?: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    category: string;
    requirements?: {
        base_model?: {
            architecture: string;
            recommended?: string[];
            vram_minimum_gb?: number;
        };
        loras?: Array<{
            name: string;
            url?: string;
            required?: boolean;
            default_weight?: number;
        }>;
        controlnets?: Array<{
            type: string;
            model?: string;
            required?: boolean;
        }>;
        extensions?: string[];
    };
    parameters?: Record<string, TemplateParameter>;
    pipeline?: Array<{
        id: string;
        type: string;
        config?: Record<string, any>;
        inputs?: Record<string, string>;
        outputs?: string[];
        skip_if?: Record<string, any>;
    }>;
    presets?: Record<string, Record<string, any>>;
    app_adaptations?: {
        vscode?: Record<string, any>;
        davinci?: Record<string, any>;
        gimp?: Record<string, any>;
    };
    source?: {
        type: string;
        url?: string;
        workflow_json?: string;
    };
    filePath?: string;
}

export interface TemplateParameter {
    type: 'string' | 'number' | 'integer' | 'boolean' | 'select' | 'image' | 'video' | 'color';
    default: any;
    label?: string;
    description?: string;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    group?: string;
    visible_if?: Record<string, any>;
}

export class TemplateManager {
    private templates: Template[] = [];
    private loaded = false;

    constructor(private context: vscode.ExtensionContext) {}

    async getTemplates(): Promise<Template[]> {
        if (!this.loaded) {
            await this.loadTemplates();
        }
        return this.templates;
    }

    async loadTemplates(): Promise<void> {
        this.templates = [];

        // Load built-in templates from extension
        const extensionPath = this.context.extensionPath;
        const builtInPath = path.join(extensionPath, '..', 'templates');

        // Load from multiple locations
        const templatePaths = [
            builtInPath,
            path.join(extensionPath, 'templates'),
        ];

        // Add custom template directory from settings
        const config = vscode.workspace.getConfiguration('rawdiffusion');
        const customDir = config.get<string>('templateDirectory');
        if (customDir && fs.existsSync(customDir)) {
            templatePaths.push(customDir);
        }

        // Load from workspace if available
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const workspaceTemplates = path.join(folder.uri.fsPath, 'rawdiffusion-templates');
                if (fs.existsSync(workspaceTemplates)) {
                    templatePaths.push(workspaceTemplates);
                }
            }
        }

        for (const basePath of templatePaths) {
            await this.loadTemplatesFromDirectory(basePath);
        }

        // Sort templates by category, then name
        this.templates.sort((a, b) => {
            if (a.category !== b.category) {
                return a.category.localeCompare(b.category);
            }
            return a.name.localeCompare(b.name);
        });

        this.loaded = true;
    }

    private async loadTemplatesFromDirectory(basePath: string): Promise<void> {
        if (!fs.existsSync(basePath)) {
            return;
        }

        try {
            const files = await glob('**/*.json', {
                cwd: basePath,
                absolute: true,
                nodir: true,
                ignore: ['**/schema/**', '**/node_modules/**']
            });

            for (const file of files) {
                try {
                    const content = fs.readFileSync(file, 'utf-8');
                    const template = JSON.parse(content) as Template;

                    // Validate it's a valid template
                    if (template.id && template.name && template.parameters) {
                        template.filePath = file;
                        this.templates.push(template);
                    }
                } catch (error) {
                    console.error(`Error loading template from ${file}:`, error);
                }
            }
        } catch (error) {
            console.error(`Error scanning templates in ${basePath}:`, error);
        }
    }

    getTemplateById(id: string): Template | undefined {
        return this.templates.find(t => t.id === id);
    }

    getTemplatesByCategory(category: string): Template[] {
        return this.templates.filter(t => t.category === category);
    }

    getTemplatesByTag(tag: string): Template[] {
        return this.templates.filter(t => t.tags?.includes(tag));
    }

    async refresh(): Promise<void> {
        this.loaded = false;
        await this.loadTemplates();
    }
}
