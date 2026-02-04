import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, execSync } from 'child_process';

interface TimelineInfo {
    name: string;
    currentFrame: number;
    currentTimecode: string;
    fps: number;
    width: number;
    height: number;
}

interface ClipInfo {
    name: string;
    filePath: string;
    startFrame: number;
    endFrame: number;
    duration: number;
}

export class DaVinciIntegration {
    private _resolveScriptPath: string;
    private _tempDir: string;

    constructor(private context: vscode.ExtensionContext) {
        this._tempDir = path.join(context.globalStorageUri.fsPath, 'davinci-frames');
        this._resolveScriptPath = path.join(context.extensionPath, 'scripts', 'davinci_bridge.py');

        // Ensure temp directory exists
        if (!fs.existsSync(this._tempDir)) {
            fs.mkdirSync(this._tempDir, { recursive: true });
        }

        // Create the bridge script
        this._createBridgeScript();
    }

    private _createBridgeScript() {
        const scriptsDir = path.join(this.context.extensionPath, 'scripts');
        if (!fs.existsSync(scriptsDir)) {
            fs.mkdirSync(scriptsDir, { recursive: true });
        }

        const script = `#!/usr/bin/env python3
"""
DaVinci Resolve Bridge Script
Communicates with Resolve via its scripting API
"""

import sys
import json
import os

def get_resolve():
    """Get the Resolve object"""
    try:
        # Try the standard import path
        import DaVinciResolveScript as dvr
        return dvr.scriptapp("Resolve")
    except ImportError:
        pass

    # Try adding the Resolve script path
    resolve_paths = [
        "/opt/resolve/Developer/Scripting/Modules",
        os.path.expanduser("~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"),
        "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules"
    ]

    for p in resolve_paths:
        if os.path.exists(p) and p not in sys.path:
            sys.path.append(p)

    try:
        import DaVinciResolveScript as dvr
        return dvr.scriptapp("Resolve")
    except:
        return None

def get_timeline_info():
    """Get current timeline information"""
    resolve = get_resolve()
    if not resolve:
        return {"error": "Could not connect to DaVinci Resolve. Is it running?"}

    pm = resolve.GetProjectManager()
    if not pm:
        return {"error": "Could not get Project Manager"}

    project = pm.GetCurrentProject()
    if not project:
        return {"error": "No project open"}

    timeline = project.GetCurrentTimeline()
    if not timeline:
        return {"error": "No timeline selected"}

    fps = float(timeline.GetSetting("timelineFrameRate"))
    current_tc = timeline.GetCurrentTimecode()

    return {
        "name": timeline.GetName(),
        "currentTimecode": current_tc,
        "fps": fps,
        "width": int(timeline.GetSetting("timelineResolutionWidth")),
        "height": int(timeline.GetSetting("timelineResolutionHeight")),
        "trackCount": timeline.GetTrackCount("video")
    }

def get_current_clip():
    """Get the clip at the current playhead position"""
    resolve = get_resolve()
    if not resolve:
        return {"error": "Could not connect to DaVinci Resolve"}

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    timeline = project.GetCurrentTimeline()

    if not timeline:
        return {"error": "No timeline selected"}

    current_frame = timeline.GetCurrentVideoItem()
    if not current_frame:
        # Try to get from track
        for track_idx in range(1, timeline.GetTrackCount("video") + 1):
            clips = timeline.GetItemListInTrack("video", track_idx)
            if clips:
                # Get playhead position and find clip
                # This is simplified - real implementation would check timecode
                for clip in clips:
                    media = clip.GetMediaPoolItem()
                    if media:
                        props = media.GetClipProperty()
                        return {
                            "name": clip.GetName(),
                            "filePath": props.get("File Path", ""),
                            "startFrame": clip.GetStart(),
                            "endFrame": clip.GetEnd(),
                            "duration": clip.GetDuration()
                        }

    return {"error": "No clip at playhead"}

def export_current_frame(output_path):
    """Export the current frame to a file"""
    resolve = get_resolve()
    if not resolve:
        return {"error": "Could not connect to DaVinci Resolve"}

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    timeline = project.GetCurrentTimeline()

    if not timeline:
        return {"error": "No timeline selected"}

    # Use the render job approach for frame export
    project.SetCurrentRenderFormatAndCodec("png", "png")

    # Set render settings for single frame
    render_settings = {
        "MarkIn": timeline.GetCurrentTimecode(),
        "MarkOut": timeline.GetCurrentTimecode(),
        "TargetDir": os.path.dirname(output_path),
        "CustomName": os.path.splitext(os.path.basename(output_path))[0]
    }

    project.SetRenderSettings(render_settings)
    project.AddRenderJob()

    # Start render
    project.StartRendering()

    # Wait for completion (with timeout)
    import time
    timeout = 30
    start = time.time()
    while project.IsRenderingInProgress():
        if time.time() - start > timeout:
            return {"error": "Render timeout"}
        time.sleep(0.5)

    return {"success": True, "path": output_path}

def get_selected_clips():
    """Get currently selected clips in the timeline"""
    resolve = get_resolve()
    if not resolve:
        return {"error": "Could not connect to DaVinci Resolve"}

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    timeline = project.GetCurrentTimeline()

    if not timeline:
        return {"error": "No timeline selected"}

    # Get all clips and check selection status
    clips = []
    for track_idx in range(1, timeline.GetTrackCount("video") + 1):
        track_clips = timeline.GetItemListInTrack("video", track_idx)
        if track_clips:
            for clip in track_clips:
                media = clip.GetMediaPoolItem()
                if media:
                    props = media.GetClipProperty()
                    clips.append({
                        "name": clip.GetName(),
                        "filePath": props.get("File Path", ""),
                        "track": track_idx,
                        "startFrame": clip.GetStart(),
                        "endFrame": clip.GetEnd()
                    })

    return {"clips": clips}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified"}))
        sys.exit(1)

    command = sys.argv[1]

    if command == "timeline-info":
        result = get_timeline_info()
    elif command == "current-clip":
        result = get_current_clip()
    elif command == "export-frame":
        if len(sys.argv) < 3:
            result = {"error": "No output path specified"}
        else:
            result = export_current_frame(sys.argv[2])
    elif command == "selected-clips":
        result = get_selected_clips()
    else:
        result = {"error": f"Unknown command: {command}"}

    print(json.dumps(result))
`;

        fs.writeFileSync(this._resolveScriptPath, script);
    }

    async getTimelineInfo(): Promise<TimelineInfo | null> {
        try {
            const result = await this._runBridgeCommand('timeline-info');
            if (result.error) {
                return null;
            }
            return result as TimelineInfo;
        } catch {
            return null;
        }
    }

    async getCurrentClip(): Promise<ClipInfo | null> {
        try {
            const result = await this._runBridgeCommand('current-clip');
            if (result.error) {
                return null;
            }
            return result as ClipInfo;
        } catch {
            return null;
        }
    }

    async exportCurrentFrame(): Promise<string | null> {
        const outputPath = path.join(this._tempDir, `frame_${Date.now()}.png`);

        try {
            const result = await this._runBridgeCommand('export-frame', outputPath);
            if (result.error) {
                vscode.window.showWarningMessage('DaVinci Resolve not running. Use file browser instead.');
                return null;
            }
            return outputPath;
        } catch {
            vscode.window.showWarningMessage('DaVinci Resolve not running. Use file browser instead.');
            return null;
        }
    }

    async getSourcePathAtPlayhead(): Promise<string | null> {
        const clip = await this.getCurrentClip();
        if (clip && clip.filePath) {
            return clip.filePath;
        }
        return null;
    }

    async insertSourcePath(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        // Try to get clip from DaVinci silently (no errors if not running)
        let clip: ClipInfo | null = null;
        try {
            clip = await this.getCurrentClip();
        } catch {
            // DaVinci not running - that's fine, we'll use file picker
        }

        if (clip && clip.filePath && fs.existsSync(clip.filePath)) {
            // Got path from DaVinci - insert it
            await this._insertPathAtCursor(editor, clip.filePath, 'source clip');
            return;
        }

        // DaVinci not available or no clip - just open file picker
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select Source Image',
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'exr', 'bmp'],
                'Video Frames': ['dpx', 'tga', 'cin'],
                'All Files': ['*']
            }
        });

        if (fileUri && fileUri[0]) {
            await this._insertPathAtCursor(editor, fileUri[0].fsPath, 'image');
        }
    }

    private async _insertPathAtCursor(editor: vscode.TextEditor, filePath: string, description: string) {
        const position = editor.selection.active;

        // Check if we're inside a string
        const lineText = editor.document.lineAt(position.line).text;
        const beforeCursor = lineText.substring(0, position.character);

        // Escape backslashes for Windows paths
        const escapedPath = filePath.replace(/\\/g, '\\\\');

        await editor.edit(editBuilder => {
            editBuilder.insert(position, escapedPath);
        });

        vscode.window.showInformationMessage(`Inserted ${description} path: ${path.basename(filePath)}`);
    }

    private async _runBridgeCommand(command: string, ...args: string[]): Promise<any> {
        const config = vscode.workspace.getConfiguration('rawdiffusion');
        const pythonPath = config.get<string>('pythonPath') || 'python3';

        return new Promise((resolve, reject) => {
            const proc = spawn(pythonPath, [this._resolveScriptPath, command, ...args]);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(stderr || `Process exited with code ${code}`));
                    return;
                }

                try {
                    resolve(JSON.parse(stdout));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${stdout}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });
    }
}
