import * as vscode from 'vscode';
import { GalleryViewProvider } from './views/GalleryViewProvider';
import { RecentTreeDataProvider } from './views/RecentTreeDataProvider';
import { ModelsTreeDataProvider } from './views/ModelsTreeDataProvider';
import { OutputViewProvider } from './views/OutputViewProvider';
import { TemplateManager } from './providers/TemplateManager';
import { CodeGenerator } from './providers/CodeGenerator';
import { WorkflowRunner } from './providers/WorkflowRunner';
import { DaVinciIntegration } from './providers/DaVinciIntegration';

let galleryProvider: GalleryViewProvider;
let recentProvider: RecentTreeDataProvider;
let modelsProvider: ModelsTreeDataProvider;
let outputProvider: OutputViewProvider;
let templateManager: TemplateManager;
let codeGenerator: CodeGenerator;
let workflowRunner: WorkflowRunner;
let davinciIntegration: DaVinciIntegration;

export function activate(context: vscode.ExtensionContext) {
    console.log('RawDiffusion is now active');

    // Initialize providers
    templateManager = new TemplateManager(context);
    codeGenerator = new CodeGenerator(context);
    workflowRunner = new WorkflowRunner(context);
    davinciIntegration = new DaVinciIntegration(context);

    // Initialize views
    galleryProvider = new GalleryViewProvider(context, templateManager);
    recentProvider = new RecentTreeDataProvider(context);
    modelsProvider = new ModelsTreeDataProvider(context);
    outputProvider = new OutputViewProvider(context);

    // Connect workflow runner to output provider
    workflowRunner.onOutput((imagePath, template) => {
        outputProvider.setOutput(imagePath, template);
        recentProvider.refresh();
    });

    // Register gallery webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'rawdiffusion.gallery',
            galleryProvider
        )
    );

    // Register output webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'rawdiffusion.output',
            outputProvider
        )
    );

    // Register tree views
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
            'rawdiffusion.recent',
            recentProvider
        )
    );

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
            'rawdiffusion.models',
            modelsProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.openGallery', () => {
            vscode.commands.executeCommand('rawdiffusion.gallery.focus');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.generateCode', async (template?: any) => {
            await generateCodeFromTemplate(template);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.runWorkflow', async () => {
            await runCurrentWorkflow();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.importComfyUI', async () => {
            await importComfyUIWorkflow();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.configureModels', async () => {
            await configureModels();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.refreshGallery', () => {
            galleryProvider.refresh();
            modelsProvider.refresh();
        })
    );

    // Source image insertion (works with or without DaVinci)
    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.insertSourceImage', async () => {
            await davinciIntegration.insertSourcePath();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.davinciTimelineInfo', async () => {
            const info = await davinciIntegration.getTimelineInfo();
            if (info) {
                vscode.window.showInformationMessage(
                    `Timeline: ${info.name} | ${info.width}x${info.height} @ ${info.fps}fps`
                );
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('rawdiffusion.exportDavinciFrame', async () => {
            const framePath = await davinciIntegration.exportCurrentFrame();
            if (framePath) {
                vscode.window.showInformationMessage(`Exported frame to: ${framePath}`);
            }
        })
    );

    // Listen for messages from webview
    galleryProvider.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'selectTemplate':
                await generateCodeFromTemplate(message.template);
                break;
            case 'updateParameter':
                galleryProvider.updateParameter(message.param, message.value);
                break;
            case 'generate':
                await generateAndRun(message.template, message.parameters);
                break;
        }
    });
}

async function generateCodeFromTemplate(template?: any) {
    if (!template) {
        // Show quick pick to select template
        const templates = await templateManager.getTemplates();
        const items = templates.map(t => ({
            label: t.name,
            description: t.description,
            detail: `${t.category} | ${t.difficulty}`,
            template: t
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a template'
        });

        if (!selected) {
            return;
        }
        template = selected.template;
    }

    try {
        const code = await codeGenerator.generate(template);

        // Create new document with generated code
        const doc = await vscode.workspace.openTextDocument({
            content: code,
            language: 'python'
        });

        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Generated code from template: ${template.name}`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to generate code: ${error.message}`);
    }
}

async function generateAndRun(template: any, parameters: any) {
    try {
        const code = await codeGenerator.generate(template, parameters);

        // Create temp file
        const doc = await vscode.workspace.openTextDocument({
            content: code,
            language: 'python'
        });

        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

        // Run the workflow
        await workflowRunner.run(code);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed: ${error.message}`);
    }
}

async function runCurrentWorkflow() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    if (editor.document.languageId !== 'python') {
        vscode.window.showErrorMessage('Current file is not a Python file');
        return;
    }

    const code = editor.document.getText();
    await workflowRunner.run(code);
}

async function importComfyUIWorkflow() {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: 'Import',
        filters: {
            'ComfyUI Workflow': ['json'],
            'Image with Workflow': ['png', 'webp'],
            'All Files': ['*']
        }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (!fileUri || fileUri.length === 0) {
        return;
    }

    try {
        const code = await codeGenerator.importFromComfyUI(fileUri[0].fsPath);

        const doc = await vscode.workspace.openTextDocument({
            content: code,
            language: 'python'
        });

        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('ComfyUI workflow imported successfully');
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to import: ${error.message}`);
    }
}

async function configureModels() {
    const config = vscode.workspace.getConfiguration('rawdiffusion');
    const currentPaths = config.get<string[]>('modelPaths') || [];

    const options: vscode.OpenDialogOptions = {
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: true,
        openLabel: 'Add Model Directory'
    };

    const folderUris = await vscode.window.showOpenDialog(options);
    if (!folderUris || folderUris.length === 0) {
        return;
    }

    const newPaths = folderUris.map(uri => uri.fsPath);
    const allPaths = [...new Set([...currentPaths, ...newPaths])];

    await config.update('modelPaths', allPaths, vscode.ConfigurationTarget.Global);
    modelsProvider.refresh();

    vscode.window.showInformationMessage(`Added ${newPaths.length} model path(s)`);
}

export function deactivate() {
    console.log('RawDiffusion deactivated');
}
