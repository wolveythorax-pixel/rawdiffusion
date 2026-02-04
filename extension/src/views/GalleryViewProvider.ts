import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateManager, Template } from '../providers/TemplateManager';

export class GalleryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rawdiffusion.gallery';

    private _view?: vscode.WebviewView;
    private _messageHandlers: ((message: any) => void)[] = [];
    private _selectedTemplate?: Template;
    private _currentParameters: Record<string, any> = {};

    constructor(
        private readonly _extensionContext: vscode.ExtensionContext,
        private readonly _templateManager: TemplateManager
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionContext.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            this._messageHandlers.forEach(handler => handler(message));
        });

        // Load templates on view ready
        this._loadTemplates();
    }

    public onDidReceiveMessage(handler: (message: any) => void) {
        this._messageHandlers.push(handler);
    }

    public refresh() {
        this._loadTemplates();
    }

    public updateParameter(param: string, value: any) {
        this._currentParameters[param] = value;
    }

    private async _loadTemplates() {
        if (!this._view) {
            return;
        }

        const templates = await this._templateManager.getTemplates();

        // Load SVG previews for templates
        const previewsPath = path.join(this._extensionContext.extensionPath, '..', 'templates', 'previews');
        const templatesWithPreviews = templates.map(template => {
            const result = { ...template, previewSvg: '' };

            // Try to load preview SVG based on template category or explicit preview field
            const previewFile = template.preview || this._getPreviewForCategory(template.category);
            if (previewFile) {
                const svgPath = path.join(previewsPath, previewFile);
                if (fs.existsSync(svgPath)) {
                    try {
                        result.previewSvg = fs.readFileSync(svgPath, 'utf-8');
                    } catch (e) {
                        console.error(`Error loading preview ${svgPath}:`, e);
                    }
                }
            }
            return result;
        });

        this._view.webview.postMessage({
            type: 'loadTemplates',
            templates: templatesWithPreviews
        });
    }

    private _getPreviewForCategory(category: string): string | null {
        const categoryPreviews: Record<string, string> = {
            'txt2img': 'portrait.svg',
            'img2img': 'style-transfer.svg',
            'inpaint': 'inpaint.svg',
            'outpaint': 'inpaint.svg',
            'upscale': 'upscale.svg',
            'controlnet': 'controlnet.svg',
            'style-transfer': 'style-transfer.svg',
            'character': 'anime.svg',
            'animation': 'video.svg',
            'video': 'video.svg',
            'portrait': 'portrait.svg',
            'cinematic': 'cinematic.svg',
            'fantasy': 'fantasy.svg',
            'anime': 'anime.svg',
            'lightning': 'lightning.svg',
            'ipadapter': 'ipadapter.svg'
        };
        return categoryPreviews[category] || null;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RawDiffusion Gallery</title>
    <style>
        :root {
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background);
            --text-primary: var(--vscode-editor-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --border: var(--vscode-panel-border);
            --accent: var(--vscode-button-background);
            --accent-hover: var(--vscode-button-hoverBackground);
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

        .search-container {
            margin-bottom: 12px;
        }

        .search-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--border);
            background: var(--bg-secondary);
            color: var(--text-primary);
            border-radius: 4px;
            font-size: inherit;
        }

        .search-input:focus {
            outline: 1px solid var(--accent);
        }

        .filter-tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }

        .filter-tab {
            padding: 4px 8px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-secondary);
            border-radius: 12px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.15s;
        }

        .filter-tab:hover {
            background: var(--bg-secondary);
        }

        .filter-tab.active {
            background: var(--accent);
            color: white;
            border-color: var(--accent);
        }

        .templates-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 10px;
        }

        .template-card {
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.2s ease;
            background: var(--bg-secondary);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .template-card:hover {
            border-color: var(--accent);
            transform: translateY(-3px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.2);
        }

        .template-card:hover .template-preview svg {
            transform: scale(1.05);
        }

        .template-preview {
            width: 100%;
            aspect-ratio: 1;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            overflow: hidden;
        }

        .template-preview svg {
            width: 100%;
            height: 100%;
            transition: transform 0.2s ease;
        }

        .template-preview-fallback {
            font-size: 32px;
        }

        .template-info {
            padding: 8px;
        }

        .template-name {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .template-desc {
            font-size: 10px;
            color: var(--text-secondary);
            margin-bottom: 4px;
            line-height: 1.3;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            min-height: 26px;
        }

        .template-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .template-category {
            font-size: 10px;
            color: var(--text-secondary);
            background: var(--bg-primary);
            padding: 2px 6px;
            border-radius: 8px;
        }

        .template-difficulty {
            font-size: 9px;
            padding: 2px 6px;
            border-radius: 8px;
        }

        .difficulty-beginner { background: #2d5a27; color: #90EE90; }
        .difficulty-intermediate { background: #5a5227; color: #FFD700; }
        .difficulty-advanced { background: #5a2727; color: #FF6B6B; }

        /* Template Detail View */
        .template-detail {
            display: none;
        }

        .template-detail.active {
            display: block;
        }

        .detail-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        .back-btn {
            background: none;
            border: none;
            color: var(--text-primary);
            cursor: pointer;
            font-size: 18px;
            padding: 4px;
        }

        .detail-title {
            font-size: 16px;
            font-weight: 600;
        }

        .param-group {
            margin-bottom: 16px;
        }

        .param-group-title {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }

        .param-field {
            margin-bottom: 10px;
        }

        .param-label {
            display: block;
            font-size: 12px;
            margin-bottom: 4px;
        }

        .param-input, .param-select, .param-textarea {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--border);
            background: var(--bg-secondary);
            color: var(--text-primary);
            border-radius: 4px;
            font-size: 12px;
        }

        .param-textarea {
            min-height: 60px;
            resize: vertical;
        }

        .param-slider-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .param-slider {
            flex: 1;
        }

        .param-value {
            min-width: 40px;
            text-align: right;
            font-size: 11px;
            color: var(--text-secondary);
        }

        .action-buttons {
            display: flex;
            gap: 8px;
            margin-top: 16px;
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
        }

        .btn-primary {
            background: var(--accent);
            color: white;
        }

        .btn-primary:hover {
            background: var(--accent-hover);
        }

        .btn-secondary {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: var(--border);
        }

        .presets-container {
            margin-bottom: 16px;
        }

        .preset-btn {
            padding: 4px 10px;
            margin: 2px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-secondary);
            border-radius: 12px;
            cursor: pointer;
            font-size: 11px;
        }

        .preset-btn:hover {
            background: var(--bg-secondary);
            color: var(--text-primary);
        }

        .gallery-view.hidden {
            display: none;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <!-- Gallery View -->
    <div id="gallery-view" class="gallery-view">
        <div class="search-container">
            <input type="text" class="search-input" placeholder="Search templates..." id="search-input">
        </div>

        <div class="filter-tabs" id="filter-tabs">
            <button class="filter-tab active" data-filter="all">All</button>
            <button class="filter-tab" data-filter="txt2img">Text to Image</button>
            <button class="filter-tab" data-filter="img2img">Img2Img</button>
            <button class="filter-tab" data-filter="controlnet">ControlNet</button>
            <button class="filter-tab" data-filter="animation">Animation</button>
            <button class="filter-tab" data-filter="inpaint">Inpaint</button>
            <button class="filter-tab" data-filter="upscale">Upscale</button>
        </div>

        <div class="templates-grid" id="templates-grid">
            <div class="empty-state">
                <div class="empty-state-icon">🎨</div>
                <div>Loading templates...</div>
            </div>
        </div>
    </div>

    <!-- Template Detail View -->
    <div id="template-detail" class="template-detail">
        <div class="detail-header">
            <button class="back-btn" id="back-btn">←</button>
            <span class="detail-title" id="detail-title">Template Name</span>
        </div>

        <div class="presets-container" id="presets-container"></div>

        <div id="params-container"></div>

        <div class="action-buttons">
            <button class="btn btn-secondary" id="view-code-btn">View Code</button>
            <button class="btn btn-primary" id="generate-btn">Generate</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let templates = [];
        let selectedTemplate = null;
        let currentParams = {};

        // Category icons
        const categoryIcons = {
            'txt2img': '🖼️',
            'img2img': '🔄',
            'inpaint': '🖌️',
            'outpaint': '📐',
            'upscale': '🔍',
            'controlnet': '🎯',
            'style-transfer': '🎨',
            'character': '👤',
            'animation': '🎬',
            'video': '📹',
            'batch': '📦',
            'composite': '🧩'
        };

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'loadTemplates':
                    templates = message.templates;
                    renderTemplates();
                    break;
            }
        });

        // Search functionality
        document.getElementById('search-input').addEventListener('input', (e) => {
            renderTemplates(e.target.value);
        });

        // Filter tabs
        document.getElementById('filter-tabs').addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-tab')) {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                renderTemplates(document.getElementById('search-input').value);
            }
        });

        // Back button
        document.getElementById('back-btn').addEventListener('click', () => {
            showGallery();
        });

        // Generate button
        document.getElementById('generate-btn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'generate',
                template: selectedTemplate,
                parameters: currentParams
            });
        });

        // View code button
        document.getElementById('view-code-btn').addEventListener('click', () => {
            vscode.postMessage({
                command: 'selectTemplate',
                template: selectedTemplate
            });
        });

        function renderTemplates(search = '') {
            const grid = document.getElementById('templates-grid');
            const activeFilter = document.querySelector('.filter-tab.active').dataset.filter;

            let filtered = templates;

            // Apply category filter
            if (activeFilter !== 'all') {
                filtered = filtered.filter(t => t.category === activeFilter);
            }

            // Apply search filter
            if (search) {
                const searchLower = search.toLowerCase();
                filtered = filtered.filter(t =>
                    t.name.toLowerCase().includes(searchLower) ||
                    t.description.toLowerCase().includes(searchLower) ||
                    (t.tags && t.tags.some(tag => tag.toLowerCase().includes(searchLower)))
                );
            }

            if (filtered.length === 0) {
                grid.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <div>No templates found</div>
                    </div>
                \`;
                return;
            }

            grid.innerHTML = filtered.map(t => \`
                <div class="template-card" data-id="\${t.id}" title="\${t.description || ''}">
                    <div class="template-preview">
                        \${t.previewSvg ? t.previewSvg : \`<span class="template-preview-fallback">\${categoryIcons[t.category] || '🎨'}</span>\`}
                    </div>
                    <div class="template-info">
                        <div class="template-name">\${t.name}</div>
                        <div class="template-desc">\${(t.description || '').slice(0, 60)}\${(t.description || '').length > 60 ? '...' : ''}</div>
                        <div class="template-meta">
                            <span class="template-category">\${t.category}</span>
                            <span class="template-difficulty difficulty-\${t.difficulty}">\${t.difficulty}</span>
                        </div>
                    </div>
                </div>
            \`).join('');

            // Add click handlers
            grid.querySelectorAll('.template-card').forEach(card => {
                card.addEventListener('click', () => {
                    const template = templates.find(t => t.id === card.dataset.id);
                    if (template) {
                        showTemplateDetail(template);
                    }
                });
            });
        }

        function showTemplateDetail(template) {
            selectedTemplate = template;
            currentParams = {};

            // Set defaults
            if (template.parameters) {
                Object.entries(template.parameters).forEach(([key, param]) => {
                    currentParams[key] = param.default;
                });
            }

            document.getElementById('detail-title').textContent = template.name;
            document.getElementById('gallery-view').classList.add('hidden');
            document.getElementById('template-detail').classList.add('active');

            // Render presets
            const presetsContainer = document.getElementById('presets-container');
            if (template.presets && Object.keys(template.presets).length > 0) {
                presetsContainer.innerHTML = \`
                    <div class="param-group-title">Presets</div>
                    \${Object.entries(template.presets).map(([name, preset]) => \`
                        <button class="preset-btn" data-preset="\${name}" title="\${preset.description || ''}">\${name.replace(/_/g, ' ')}</button>
                    \`).join('')}
                \`;

                presetsContainer.querySelectorAll('.preset-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const preset = template.presets[btn.dataset.preset];
                        Object.entries(preset).forEach(([key, value]) => {
                            if (key !== 'description') {
                                currentParams[key] = value;
                                const input = document.querySelector(\`[data-param="\${key}"]\`);
                                if (input) {
                                    input.value = value;
                                    if (input.type === 'range') {
                                        input.nextElementSibling.textContent = value;
                                    }
                                }
                            }
                        });
                    });
                });
            } else {
                presetsContainer.innerHTML = '';
            }

            // Render parameters
            renderParams(template.parameters);
        }

        function renderParams(parameters) {
            const container = document.getElementById('params-container');
            if (!parameters) {
                container.innerHTML = '<div class="empty-state">No configurable parameters</div>';
                return;
            }

            // Group parameters
            const groups = { basic: [], style: [], advanced: [] };
            Object.entries(parameters).forEach(([key, param]) => {
                const group = param.group || 'basic';
                if (!groups[group]) groups[group] = [];
                groups[group].push({ key, ...param });
            });

            container.innerHTML = Object.entries(groups)
                .filter(([_, params]) => params.length > 0)
                .map(([groupName, params]) => \`
                    <div class="param-group">
                        <div class="param-group-title">\${groupName}</div>
                        \${params.map(p => renderParamField(p)).join('')}
                    </div>
                \`).join('');

            // Add event listeners
            container.querySelectorAll('[data-param]').forEach(input => {
                input.addEventListener('change', (e) => {
                    let value = e.target.value;
                    if (e.target.type === 'number' || e.target.type === 'range') {
                        value = parseFloat(value);
                    } else if (e.target.type === 'checkbox') {
                        value = e.target.checked;
                    }
                    currentParams[e.target.dataset.param] = value;

                    // Update slider value display
                    if (e.target.type === 'range') {
                        e.target.nextElementSibling.textContent = value;
                    }

                    vscode.postMessage({
                        command: 'updateParameter',
                        param: e.target.dataset.param,
                        value
                    });
                });
            });
        }

        function renderParamField(param) {
            const { key, type, label, description, options, min, max, step } = param;
            const displayLabel = label || key.replace(/_/g, ' ');
            const value = currentParams[key] ?? param.default;

            switch (type) {
                case 'string':
                    if (key.includes('prompt')) {
                        return \`
                            <div class="param-field">
                                <label class="param-label">\${displayLabel}</label>
                                <textarea class="param-textarea" data-param="\${key}" placeholder="\${description || ''}">\${value}</textarea>
                            </div>
                        \`;
                    }
                    return \`
                        <div class="param-field">
                            <label class="param-label">\${displayLabel}</label>
                            <input type="text" class="param-input" data-param="\${key}" value="\${value}" placeholder="\${description || ''}">
                        </div>
                    \`;

                case 'number':
                case 'integer':
                    if (min !== undefined && max !== undefined) {
                        return \`
                            <div class="param-field">
                                <label class="param-label">\${displayLabel}</label>
                                <div class="param-slider-container">
                                    <input type="range" class="param-slider" data-param="\${key}"
                                           min="\${min}" max="\${max}" step="\${step || (type === 'integer' ? 1 : 0.1)}" value="\${value}">
                                    <span class="param-value">\${value}</span>
                                </div>
                            </div>
                        \`;
                    }
                    return \`
                        <div class="param-field">
                            <label class="param-label">\${displayLabel}</label>
                            <input type="number" class="param-input" data-param="\${key}" value="\${value}"
                                   \${min !== undefined ? \`min="\${min}"\` : ''}
                                   \${max !== undefined ? \`max="\${max}"\` : ''}
                                   step="\${step || 1}">
                        </div>
                    \`;

                case 'select':
                    return \`
                        <div class="param-field">
                            <label class="param-label">\${displayLabel}</label>
                            <select class="param-select" data-param="\${key}">
                                \${options.map(opt => \`<option value="\${opt}" \${opt === value ? 'selected' : ''}>\${opt}</option>\`).join('')}
                            </select>
                        </div>
                    \`;

                case 'boolean':
                    return \`
                        <div class="param-field">
                            <label class="param-label">
                                <input type="checkbox" data-param="\${key}" \${value ? 'checked' : ''}> \${displayLabel}
                            </label>
                        </div>
                    \`;

                default:
                    return \`
                        <div class="param-field">
                            <label class="param-label">\${displayLabel}</label>
                            <input type="text" class="param-input" data-param="\${key}" value="\${value}">
                        </div>
                    \`;
            }
        }

        function showGallery() {
            document.getElementById('gallery-view').classList.remove('hidden');
            document.getElementById('template-detail').classList.remove('active');
            selectedTemplate = null;
        }
    </script>
</body>
</html>`;
    }
}
