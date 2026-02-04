import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export class WorkflowRunner {
    private outputChannel: vscode.OutputChannel;
    private currentProcess: ChildProcess | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private _outputHandlers: ((imagePath: string, template?: string) => void)[] = [];
    private _currentTemplate?: string;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('RawDiffusion');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.text = '$(play) RawDiffusion';
        this.statusBarItem.command = 'rawdiffusion.runWorkflow';
        context.subscriptions.push(this.statusBarItem);
    }

    onOutput(handler: (imagePath: string, template?: string) => void) {
        this._outputHandlers.push(handler);
    }

    private emitOutput(imagePath: string) {
        this._outputHandlers.forEach(h => h(imagePath, this._currentTemplate));
    }

    setCurrentTemplate(template: string) {
        this._currentTemplate = template;
    }

    async run(code: string): Promise<void> {
        // Kill any existing process
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = null;
        }

        const config = vscode.workspace.getConfiguration('rawdiffusion');
        const pythonPath = config.get<string>('pythonPath') || 'python3';

        // Create temp file
        const tempDir = path.join(this.context.globalStorageUri.fsPath, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFile = path.join(tempDir, `workflow_${Date.now()}.py`);
        fs.writeFileSync(tempFile, code);

        // Show output channel
        this.outputChannel.clear();
        this.outputChannel.show(true);
        this.outputChannel.appendLine('='.repeat(50));
        this.outputChannel.appendLine('Starting RawDiffusion workflow...');
        this.outputChannel.appendLine('='.repeat(50));
        this.outputChannel.appendLine('');

        // Update status bar
        this.statusBarItem.text = '$(loading~spin) Running...';
        this.statusBarItem.show();

        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            this.currentProcess = spawn(pythonPath, [tempFile], {
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });

            this.currentProcess.stdout?.on('data', (data: Buffer) => {
                const output = data.toString();
                this.outputChannel.append(output);

                // Check for progress patterns
                if (output.includes('%|')) {
                    // Progress bar detected
                    const match = output.match(/(\d+)%\|/);
                    if (match) {
                        this.statusBarItem.text = `$(loading~spin) ${match[1]}%`;
                    }
                }
            });

            this.currentProcess.stderr?.on('data', (data: Buffer) => {
                const output = data.toString();
                this.outputChannel.append(output);

                // Many ML libraries write progress to stderr
                if (!output.toLowerCase().includes('error') && !output.toLowerCase().includes('exception')) {
                    return;
                }

                // Actual error
                this.outputChannel.appendLine('');
                this.outputChannel.appendLine('[ERROR] ' + output);
            });

            this.currentProcess.on('close', (code) => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                this.outputChannel.appendLine('');
                this.outputChannel.appendLine('='.repeat(50));

                if (code === 0) {
                    this.outputChannel.appendLine(`Completed successfully in ${duration}s`);
                    this.statusBarItem.text = '$(check) Done';
                    vscode.window.showInformationMessage(`Workflow completed in ${duration}s`);

                    // Show the output image if it exists
                    this.showOutputImage();

                    resolve();
                } else {
                    this.outputChannel.appendLine(`Process exited with code ${code}`);
                    this.statusBarItem.text = '$(error) Failed';
                    vscode.window.showErrorMessage(`Workflow failed with code ${code}`);
                    reject(new Error(`Process exited with code ${code}`));
                }

                this.outputChannel.appendLine('='.repeat(50));

                // Reset status bar after a delay
                setTimeout(() => {
                    this.statusBarItem.text = '$(play) RawDiffusion';
                }, 3000);

                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    // Ignore cleanup errors
                }

                this.currentProcess = null;
            });

            this.currentProcess.on('error', (err) => {
                this.outputChannel.appendLine(`Failed to start process: ${err.message}`);
                this.statusBarItem.text = '$(error) Failed';

                if (err.message.includes('ENOENT')) {
                    vscode.window.showErrorMessage(
                        `Python not found at "${pythonPath}". Please configure rawdiffusion.pythonPath in settings.`
                    );
                } else {
                    vscode.window.showErrorMessage(`Failed to run workflow: ${err.message}`);
                }

                reject(err);
            });
        });
    }

    private async showOutputImage() {
        // Try to find and display the output image
        const config = vscode.workspace.getConfiguration('rawdiffusion');
        const outputDir = config.get<string>('outputDirectory') || './outputs';

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        const fullOutputDir = path.isAbsolute(outputDir) ? outputDir : path.join(workspaceFolder, outputDir);

        if (!fs.existsSync(fullOutputDir)) {
            return;
        }

        // Find most recent image
        const files = fs.readdirSync(fullOutputDir)
            .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .map(f => ({
                name: f,
                path: path.join(fullOutputDir, f),
                mtime: fs.statSync(path.join(fullOutputDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length === 0) {
            return;
        }

        const latestImage = files[0];

        // Check if it was created in the last 30 seconds
        if (Date.now() - latestImage.mtime > 30000) {
            return;
        }

        // Emit output event for the output panel
        this.emitOutput(latestImage.path);

        // Focus the output view
        vscode.commands.executeCommand('rawdiffusion.output.focus');
    }

    stop() {
        if (this.currentProcess) {
            this.currentProcess.kill('SIGTERM');
            this.currentProcess = null;
            this.statusBarItem.text = '$(stop) Stopped';
            this.outputChannel.appendLine('\n[Workflow stopped by user]');
        }
    }
}
