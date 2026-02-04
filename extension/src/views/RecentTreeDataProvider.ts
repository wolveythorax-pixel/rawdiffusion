import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Generation {
    id: string;
    timestamp: number;
    template: string;
    outputPath: string;
    parameters: Record<string, any>;
}

export class RecentTreeDataProvider implements vscode.TreeDataProvider<GenerationItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GenerationItem | undefined | null | void> = new vscode.EventEmitter<GenerationItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<GenerationItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private generations: Generation[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadGenerations();
    }

    refresh(): void {
        this.loadGenerations();
        this._onDidChangeTreeData.fire();
    }

    private loadGenerations() {
        const stored = this.context.globalState.get<Generation[]>('recentGenerations', []);
        this.generations = stored.slice(0, 20); // Keep last 20
    }

    public addGeneration(generation: Omit<Generation, 'id' | 'timestamp'>) {
        const newGen: Generation = {
            ...generation,
            id: Date.now().toString(),
            timestamp: Date.now()
        };

        this.generations.unshift(newGen);
        this.generations = this.generations.slice(0, 20);
        this.context.globalState.update('recentGenerations', this.generations);
        this.refresh();
    }

    getTreeItem(element: GenerationItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GenerationItem): Thenable<GenerationItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        if (this.generations.length === 0) {
            return Promise.resolve([
                new GenerationItem(
                    'No recent generations',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    undefined
                )
            ]);
        }

        return Promise.resolve(
            this.generations.map(gen => {
                const date = new Date(gen.timestamp);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = date.toLocaleDateString();

                return new GenerationItem(
                    gen.template,
                    `${dateStr} ${timeStr}`,
                    vscode.TreeItemCollapsibleState.None,
                    gen.outputPath,
                    {
                        command: 'vscode.open',
                        title: 'Open Image',
                        arguments: [vscode.Uri.file(gen.outputPath)]
                    }
                );
            })
        );
    }
}

class GenerationItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        private description_: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly outputPath?: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = description_;
        this.tooltip = outputPath ? `Click to open: ${outputPath}` : undefined;

        if (outputPath && fs.existsSync(outputPath)) {
            this.iconPath = new vscode.ThemeIcon('file-media');
            this.contextValue = 'generation';
        } else if (!outputPath) {
            this.iconPath = new vscode.ThemeIcon('info');
        } else {
            this.iconPath = new vscode.ThemeIcon('warning');
        }
    }
}
