"""
RawDiffusion Server
Executes SD workflows and serves results to the browser UI
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Optional
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from providers import get_provider

app = FastAPI(title="RawDiffusion Server")

# CORS for browser UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active WebSocket connections
connections: list[WebSocket] = []

# Output directory
OUTPUT_DIR = Path(__file__).parent / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# Templates directory
TEMPLATES_DIR = Path(__file__).parent.parent / "templates"


class WorkflowRequest(BaseModel):
    code: str
    provider: str = "local"
    provider_config: dict = {}


class TemplateInfo(BaseModel):
    id: str
    name: str
    description: str
    model: str
    category: str
    thumbnail: Optional[str]
    code: str


@app.get("/")
async def root():
    return {"status": "running", "name": "RawDiffusion Server"}


@app.get("/templates")
async def list_templates():
    """List all available templates"""
    templates = []

    # Directories to scan for templates
    template_dirs = [
        TEMPLATES_DIR / "by-model",
        TEMPLATES_DIR / "by-task",
        TEMPLATES_DIR / "sdxl",
        TEMPLATES_DIR / "sd15",
        TEMPLATES_DIR / "flux",
    ]

    previews_dir = TEMPLATES_DIR / "previews"

    for base_dir in template_dirs:
        if not base_dir.exists():
            continue

        # Recursively find all JSON template files
        for template_file in base_dir.rglob("*.json"):
            if "schema" in str(template_file):
                continue

            try:
                meta = json.loads(template_file.read_text())

                # Skip if missing required fields
                if not meta.get("id") or not meta.get("name"):
                    continue

                # Get preview thumbnail URL
                thumbnail = None
                preview_file = meta.get("preview", "")
                if preview_file:
                    preview_path = previews_dir / preview_file
                    if preview_path.exists():
                        thumbnail = f"/previews/{preview_file}"

                # Get model architecture from requirements
                model = meta.get("requirements", {}).get("base_model", {}).get("architecture", "unknown")
                if model == "sdxl":
                    model = "SDXL"
                elif model == "sd15":
                    model = "SD 1.5"
                elif model == "flux":
                    model = "Flux"

                # Generate placeholder code (full code gen happens in VS Code extension)
                code = f'''# {meta.get("name")}
# {meta.get("description", "")}
#
# Template ID: {meta.get("id")}
# Model: {model}
#
# Open in VS Code for full code generation
'''

                templates.append({
                    "id": meta.get("id"),
                    "name": meta.get("name"),
                    "description": meta.get("description", ""),
                    "model": model,
                    "category": meta.get("category", "general"),
                    "thumbnail": thumbnail,
                    "code": code,
                    "difficulty": meta.get("difficulty", "beginner"),
                    "tags": meta.get("tags", [])
                })
            except Exception as e:
                print(f"Error loading template {template_file}: {e}")
                continue

    return templates


@app.get("/templates/{model}/{template_id}")
async def get_template(model: str, template_id: str):
    """Get a specific template"""
    template_path = TEMPLATES_DIR / model / f"{template_id}.sdflow"

    if not template_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")

    meta_path = template_path.with_suffix(".json")
    meta = {}
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())

    return {
        "id": f"{model}/{template_id}",
        "name": meta.get("name", template_id),
        "description": meta.get("description", ""),
        "model": model,
        "category": meta.get("category", "general"),
        "thumbnail": meta.get("thumbnail"),
        "code": template_path.read_text()
    }


@app.post("/run")
async def run_workflow(request: WorkflowRequest):
    """Execute a workflow and return the result"""
    try:
        provider = get_provider(request.provider, request.provider_config)
        result = await provider.execute(request.code)

        # Broadcast to all connected clients
        for ws in connections:
            try:
                await ws.send_json({
                    "type": "result",
                    "data": result
                })
            except:
                pass

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for live updates"""
    await websocket.accept()
    connections.append(websocket)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "run":
                # Execute workflow
                provider = get_provider(
                    data.get("provider", "local"),
                    data.get("provider_config", {})
                )

                # Stream progress updates
                async for update in provider.execute_stream(data.get("code", "")):
                    await websocket.send_json({
                        "type": "progress",
                        "data": update
                    })

    except WebSocketDisconnect:
        connections.remove(websocket)


@app.get("/outputs/{filename}")
async def get_output(filename: str):
    """Serve generated images"""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)


@app.get("/previews/{filename}")
async def get_preview(filename: str):
    """Serve template preview images"""
    file_path = TEMPLATES_DIR / "previews" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    return FileResponse(file_path)


@app.get("/history")
async def get_history():
    """Get generation history"""
    history = []
    for f in sorted(OUTPUT_DIR.glob("*.png"), key=os.path.getmtime, reverse=True)[:50]:
        meta_file = f.with_suffix(".json")
        meta = {}
        if meta_file.exists():
            meta = json.loads(meta_file.read_text())

        history.append({
            "filename": f.name,
            "url": f"/outputs/{f.name}",
            "timestamp": os.path.getmtime(f),
            "prompt": meta.get("prompt", ""),
            "model": meta.get("model", "")
        })

    return history


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8420)
