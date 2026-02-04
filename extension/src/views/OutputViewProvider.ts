import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

interface OutputImage {
    path: string;
    timestamp: number;
    template?: string;
    parameters?: Record<string, any>;
}

export class OutputViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rawdiffusion.output';

    private _view?: vscode.WebviewView;
    private _currentOutput?: OutputImage;
    private _outputHistory: OutputImage[] = [];

    constructor(private readonly _extensionContext: vscode.ExtensionContext) {
        // Load history from storage
        this._outputHistory = _extensionContext.globalState.get('outputHistory', []);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionContext.extensionUri,
                vscode.Uri.file(path.join(process.env.HOME || '', ''))
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'pushToGimp':
                    await this.pushToGimp(message.path);
                    break;
                case 'pushToDavinci':
                    await this.pushToDavinci(message.path);
                    break;
                case 'openInFiles':
                    await this.openInFiles(message.path);
                    break;
                case 'copyPath':
                    await vscode.env.clipboard.writeText(message.path);
                    vscode.window.showInformationMessage('Path copied to clipboard');
                    break;
                case 'openInEditor':
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
                    break;
                case 'deleteImage':
                    await this.deleteImage(message.path);
                    break;
            }
        });

        // Show current output if any
        if (this._currentOutput) {
            this.showOutput(this._currentOutput);
        }
    }

    public setOutput(imagePath: string, template?: string, parameters?: Record<string, any>) {
        const output: OutputImage = {
            path: imagePath,
            timestamp: Date.now(),
            template,
            parameters
        };

        this._currentOutput = output;

        // Add to history
        this._outputHistory.unshift(output);
        this._outputHistory = this._outputHistory.slice(0, 50); // Keep last 50
        this._extensionContext.globalState.update('outputHistory', this._outputHistory);

        this.showOutput(output);
    }

    private showOutput(output: OutputImage) {
        if (!this._view) {
            return;
        }

        // Convert file path to webview URI
        const imageUri = this._view.webview.asWebviewUri(vscode.Uri.file(output.path));

        this._view.webview.postMessage({
            type: 'showOutput',
            image: {
                uri: imageUri.toString(),
                path: output.path,
                filename: path.basename(output.path),
                template: output.template,
                timestamp: output.timestamp
            }
        });
    }

    private async pushToGimp(imagePath: string) {
        if (!fs.existsSync(imagePath)) {
            vscode.window.showErrorMessage(`File not found: ${imagePath}`);
            return;
        }

        try {
            // Try different GIMP commands
            const gimpCommands = ['gimp', 'gimp-2.10', 'flatpak run org.gimp.GIMP'];

            for (const cmd of gimpCommands) {
                try {
                    const [command, ...args] = cmd.split(' ');
                    const fullArgs = [...args, imagePath];

                    const process = spawn(command, fullArgs, {
                        detached: true,
                        stdio: 'ignore'
                    });

                    process.unref();
                    vscode.window.showInformationMessage(`Opened in GIMP: ${path.basename(imagePath)}`);
                    return;
                } catch (e) {
                    continue;
                }
            }

            // If all fail, try xdg-open as fallback
            spawn('xdg-open', [imagePath], { detached: true, stdio: 'ignore' }).unref();
            vscode.window.showInformationMessage(`Opened with default app: ${path.basename(imagePath)}`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to open GIMP: ${error.message}`);
        }
    }

    private async pushToDavinci(imagePath: string) {
        if (!fs.existsSync(imagePath)) {
            vscode.window.showErrorMessage(`File not found: ${imagePath}`);
            return;
        }

        const config = vscode.workspace.getConfiguration('rawdiffusion');
        let davinciMediaPath = config.get<string>('davinciMediaPath');

        // If no path configured, ask user
        if (!davinciMediaPath) {
            const result = await vscode.window.showInputBox({
                prompt: 'Enter your DaVinci Resolve Media Pool folder path',
                placeHolder: '/home/user/Videos/DaVinci Media',
                ignoreFocusOut: true
            });

            if (!result) {
                return;
            }

            davinciMediaPath = result;
            await config.update('davinciMediaPath', davinciMediaPath, vscode.ConfigurationTarget.Global);
        }

        try {
            // Ensure directory exists
            if (!fs.existsSync(davinciMediaPath)) {
                fs.mkdirSync(davinciMediaPath, { recursive: true });
            }

            // Copy file to DaVinci media folder
            const destPath = path.join(davinciMediaPath, path.basename(imagePath));
            fs.copyFileSync(imagePath, destPath);

            vscode.window.showInformationMessage(
                `Copied to DaVinci Media: ${path.basename(imagePath)}`,
                'Open Folder'
            ).then(selection => {
                if (selection === 'Open Folder') {
                    spawn('xdg-open', [davinciMediaPath!], { detached: true, stdio: 'ignore' }).unref();
                }
            });

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to copy to DaVinci: ${error.message}`);
        }
    }

    private async openInFiles(imagePath: string) {
        const dir = path.dirname(imagePath);
        spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
    }

    private async deleteImage(imagePath: string) {
        const confirm = await vscode.window.showWarningMessage(
            `Delete ${path.basename(imagePath)}?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            try {
                fs.unlinkSync(imagePath);
                this._outputHistory = this._outputHistory.filter(o => o.path !== imagePath);
                this._extensionContext.globalState.update('outputHistory', this._outputHistory);

                if (this._currentOutput?.path === imagePath) {
                    this._currentOutput = undefined;
                    this._view?.webview.postMessage({ type: 'clearOutput' });
                }

                vscode.window.showInformationMessage('Image deleted');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to delete: ${error.message}`);
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Output</title>
    <style>
        :root {
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background);
            --text-primary: var(--vscode-editor-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --border: var(--vscode-panel-border);
            --accent: var(--vscode-button-background);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--text-primary);
            background: var(--bg-primary);
            padding: 8px;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        .output-container {
            display: none;
        }

        .output-container.active {
            display: block;
        }

        .image-preview {
            width: 100%;
            border-radius: 6px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: transform 0.15s;
        }

        .image-preview:hover {
            transform: scale(1.02);
        }

        .image-info {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            padding: 8px;
            background: var(--bg-secondary);
            border-radius: 4px;
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
        }

        .info-row:last-child {
            margin-bottom: 0;
        }

        .action-buttons {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .action-group {
            display: flex;
            gap: 6px;
        }

        .action-group-label {
            font-size: 10px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 4px;
            margin-top: 8px;
        }

        .btn {
            flex: 1;
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .btn-gimp {
            background: #5c5543;
            color: #f0e68c;
        }

        .btn-gimp:hover {
            background: #6d644f;
        }

        .btn-davinci {
            background: #2d4a5e;
            color: #ff6b35;
        }

        .btn-davinci:hover {
            background: #3a5d75;
        }

        .btn-secondary {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: var(--border);
        }

        .btn-danger {
            background: #5a2727;
            color: #ff6b6b;
        }

        .btn-danger:hover {
            background: #6d3333;
        }

        .btn-icon {
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div id="empty-state" class="empty-state">
        <div class="empty-icon">🖼️</div>
        <div>No output yet</div>
        <div style="font-size: 11px; margin-top: 8px;">Generate an image to see it here</div>
    </div>

    <div id="output-container" class="output-container">
        <img id="image-preview" class="image-preview" src="" alt="Generated output">

        <div class="image-info">
            <div class="info-row">
                <span>File:</span>
                <span id="filename">-</span>
            </div>
            <div class="info-row">
                <span>Template:</span>
                <span id="template">-</span>
            </div>
            <div class="info-row">
                <span>Generated:</span>
                <span id="timestamp">-</span>
            </div>
        </div>

        <div class="action-buttons">
            <div class="action-group-label">Push to App</div>
            <div class="action-group">
                <button class="btn btn-gimp" id="btn-gimp">
                    <span class="btn-icon">🖌️</span> GIMP
                </button>
                <button class="btn btn-davinci" id="btn-davinci">
                    <span class="btn-icon">🎬</span> DaVinci
                </button>
            </div>

            <div class="action-group-label">Actions</div>
            <div class="action-group">
                <button class="btn btn-secondary" id="btn-folder">
                    <span class="btn-icon">📁</span> Folder
                </button>
                <button class="btn btn-secondary" id="btn-copy">
                    <span class="btn-icon">📋</span> Copy Path
                </button>
            </div>

            <div class="action-group">
                <button class="btn btn-secondary" id="btn-editor">
                    <span class="btn-icon">👁️</span> View Full
                </button>
                <button class="btn btn-danger" id="btn-delete">
                    <span class="btn-icon">🗑️</span> Delete
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentPath = null;

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'showOutput':
                    showOutput(message.image);
                    break;
                case 'clearOutput':
                    clearOutput();
                    break;
            }
        });

        function showOutput(image) {
            currentPath = image.path;

            document.getElementById('empty-state').style.display = 'none';
            document.getElementById('output-container').classList.add('active');

            document.getElementById('image-preview').src = image.uri;
            document.getElementById('filename').textContent = image.filename;
            document.getElementById('template').textContent = image.template || 'Custom';
            document.getElementById('timestamp').textContent = new Date(image.timestamp).toLocaleTimeString();
        }

        function clearOutput() {
            currentPath = null;
            document.getElementById('empty-state').style.display = 'block';
            document.getElementById('output-container').classList.remove('active');
        }

        // Button handlers
        document.getElementById('btn-gimp').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'pushToGimp', path: currentPath });
            }
        });

        document.getElementById('btn-davinci').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'pushToDavinci', path: currentPath });
            }
        });

        document.getElementById('btn-folder').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'openInFiles', path: currentPath });
            }
        });

        document.getElementById('btn-copy').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'copyPath', path: currentPath });
            }
        });

        document.getElementById('btn-editor').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'openInEditor', path: currentPath });
            }
        });

        document.getElementById('btn-delete').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'deleteImage', path: currentPath });
            }
        });

        document.getElementById('image-preview').addEventListener('click', () => {
            if (currentPath) {
                vscode.postMessage({ command: 'openInEditor', path: currentPath });
            }
        });
    </script>
</body>
</html>`;
    }
}
