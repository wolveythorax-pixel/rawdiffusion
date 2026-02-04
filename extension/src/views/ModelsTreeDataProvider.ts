import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';

interface ModelInfo {
    name: string;
    path: string;
    type: 'checkpoint' | 'lora' | 'controlnet' | 'vae' | 'embedding';
    size: number;
    architecture?: string;
}

export class ModelsTreeDataProvider implements vscode.TreeDataProvider<ModelItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModelItem | undefined | null | void> = new vscode.EventEmitter<ModelItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ModelItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private models: Map<string, ModelInfo[]> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        this.scanModels();
    }

    refresh(): void {
        this.scanModels();
        this._onDidChangeTreeData.fire();
    }

    private async scanModels() {
        this.models.clear();

        const config = vscode.workspace.getConfiguration('rawdiffusion');
        const modelPaths = config.get<string[]>('modelPaths') || [];

        // Add common default paths
        const defaultPaths = [
            path.join(process.env.HOME || '', '.cache', 'huggingface', 'hub'),
            path.join(process.env.HOME || '', 'llms', 'forge', 'models'),
            path.join(process.env.HOME || '', 'llms', 'A1111', 'stable-diffusion-webui', 'models'),
        ];

        const allPaths = [...new Set([...modelPaths, ...defaultPaths])];

        for (const basePath of allPaths) {
            if (!fs.existsSync(basePath)) {
                continue;
            }

            try {
                await this.scanDirectory(basePath);
            } catch (error) {
                console.error(`Error scanning ${basePath}:`, error);
            }
        }
    }

    private async scanDirectory(basePath: string) {
        const patterns = [
            '**/*.safetensors',
            '**/*.ckpt',
            '**/*.pt',
            '**/*.bin'
        ];

        for (const pattern of patterns) {
            try {
                const files = await glob(pattern, {
                    cwd: basePath,
                    absolute: true,
                    nodir: true,
                    maxDepth: 5
                });

                for (const file of files) {
                    const stats = fs.statSync(file);
                    const modelInfo = this.classifyModel(file, stats.size);

                    if (!this.models.has(modelInfo.type)) {
                        this.models.set(modelInfo.type, []);
                    }
                    this.models.get(modelInfo.type)!.push(modelInfo);
                }
            } catch (error) {
                // Ignore errors
            }
        }
    }

    private classifyModel(filePath: string, size: number): ModelInfo {
        const name = path.basename(filePath, path.extname(filePath));
        const lowerPath = filePath.toLowerCase();

        let type: ModelInfo['type'] = 'checkpoint';
        let architecture: string | undefined;

        // Classify by path
        if (lowerPath.includes('lora')) {
            type = 'lora';
        } else if (lowerPath.includes('controlnet') || lowerPath.includes('control_')) {
            type = 'controlnet';
        } else if (lowerPath.includes('vae')) {
            type = 'vae';
        } else if (lowerPath.includes('embedding') || lowerPath.includes('textual')) {
            type = 'embedding';
        }

        // Detect architecture from name
        if (lowerPath.includes('xl') || lowerPath.includes('sdxl')) {
            architecture = 'SDXL';
        } else if (lowerPath.includes('sd3') || lowerPath.includes('sd_3')) {
            architecture = 'SD3';
        } else if (lowerPath.includes('flux')) {
            architecture = 'Flux';
        } else if (size < 2_000_000_000) {
            architecture = 'SD1.5';
        } else if (size > 5_000_000_000) {
            architecture = 'SDXL';
        }

        return {
            name,
            path: filePath,
            type,
            size,
            architecture
        };
    }

    getTreeItem(element: ModelItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ModelItem): Thenable<ModelItem[]> {
        if (!element) {
            // Root level - show categories
            const categories: ModelItem[] = [];

            const typeLabels: Record<string, string> = {
                checkpoint: 'Checkpoints',
                lora: 'LoRAs',
                controlnet: 'ControlNets',
                vae: 'VAEs',
                embedding: 'Embeddings'
            };

            const typeIcons: Record<string, string> = {
                checkpoint: 'file-binary',
                lora: 'extensions',
                controlnet: 'symbol-structure',
                vae: 'symbol-namespace',
                embedding: 'symbol-text'
            };

            for (const [type, label] of Object.entries(typeLabels)) {
                const models = this.models.get(type) || [];
                if (models.length > 0) {
                    categories.push(new ModelItem(
                        `${label} (${models.length})`,
                        '',
                        vscode.TreeItemCollapsibleState.Collapsed,
                        type,
                        typeIcons[type]
                    ));
                }
            }

            if (categories.length === 0) {
                return Promise.resolve([
                    new ModelItem(
                        'No models found',
                        'Configure model paths in settings',
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        'info'
                    )
                ]);
            }

            return Promise.resolve(categories);
        }

        // Child level - show models in category
        if (element.modelType) {
            const models = this.models.get(element.modelType) || [];
            return Promise.resolve(
                models.map(m => {
                    const sizeStr = this.formatSize(m.size);
                    const desc = m.architecture ? `${m.architecture} • ${sizeStr}` : sizeStr;

                    return new ModelItem(
                        m.name,
                        desc,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        'file',
                        m.path
                    );
                })
            );
        }

        return Promise.resolve([]);
    }

    private formatSize(bytes: number): string {
        if (bytes < 1_000_000) {
            return `${(bytes / 1_000).toFixed(1)} KB`;
        }
        if (bytes < 1_000_000_000) {
            return `${(bytes / 1_000_000).toFixed(1)} MB`;
        }
        return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    }
}

class ModelItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly modelType?: string,
        icon?: string,
        public readonly modelPath?: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;

        if (modelPath) {
            this.tooltip = modelPath;
            this.contextValue = 'model';
            this.command = {
                command: 'vscode.open',
                title: 'Show in Folder',
                arguments: [vscode.Uri.file(path.dirname(modelPath))]
            };
        }
    }
}
