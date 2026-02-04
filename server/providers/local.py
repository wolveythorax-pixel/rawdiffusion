"""
Local Provider - Run models on your own hardware using diffusers
"""

import asyncio
import os
import sys
import uuid
import json
import tempfile
import traceback
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from . import BaseProvider


class LocalProvider(BaseProvider):
    """Execute workflows locally using diffusers"""

    def __init__(self, config: dict = None):
        super().__init__(config)
        self.models_path = config.get("models_path") if config else None
        self.output_dir = Path(__file__).parent.parent / "outputs"
        self.output_dir.mkdir(exist_ok=True)

    async def execute(self, code: str) -> dict:
        """Execute Python code and return result"""
        # Generate unique ID for this run
        run_id = str(uuid.uuid4())[:8]
        output_path = self.output_dir / f"{run_id}.png"
        meta_path = self.output_dir / f"{run_id}.json"

        # Inject output path into code context
        exec_globals = {
            "__output_path__": str(output_path),
            "__run_id__": run_id,
            "__models_path__": self.models_path,
        }

        # Create wrapper code that saves the output
        wrapped_code = f'''
import sys
import os

# Make output path available
OUTPUT_PATH = "{output_path}"
RUN_ID = "{run_id}"
MODELS_PATH = "{self.models_path or ''}"

# User code starts here
{code}

# Auto-save if 'image' variable exists
if 'image' in dir() and image is not None:
    if hasattr(image, 'save'):
        image.save(OUTPUT_PATH)
    elif isinstance(image, list) and len(image) > 0:
        image[0].save(OUTPUT_PATH)
'''

        try:
            # Execute in subprocess to avoid blocking and for isolation
            result = await self._run_in_subprocess(wrapped_code)

            if output_path.exists():
                # Extract metadata from code (basic parsing)
                meta = self._extract_metadata(code)
                meta["run_id"] = run_id
                meta["timestamp"] = datetime.now().isoformat()
                meta_path.write_text(json.dumps(meta, indent=2))

                return {
                    "success": True,
                    "run_id": run_id,
                    "output_url": f"/outputs/{run_id}.png",
                    "metadata": meta
                }
            else:
                return {
                    "success": False,
                    "run_id": run_id,
                    "error": "No image output generated",
                    "stdout": result.get("stdout", ""),
                    "stderr": result.get("stderr", "")
                }

        except Exception as e:
            return {
                "success": False,
                "run_id": run_id,
                "error": str(e),
                "traceback": traceback.format_exc()
            }

    async def _run_in_subprocess(self, code: str) -> dict:
        """Run code in isolated subprocess"""
        # Write code to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(code)
            temp_path = f.name

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, temp_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await proc.communicate()

            return {
                "returncode": proc.returncode,
                "stdout": stdout.decode() if stdout else "",
                "stderr": stderr.decode() if stderr else ""
            }
        finally:
            os.unlink(temp_path)

    async def execute_stream(self, code: str) -> AsyncIterator[dict]:
        """Execute with streaming progress"""
        yield {"status": "starting", "message": "Initializing..."}

        # For now, just wrap execute() - real streaming would need IPC
        yield {"status": "running", "message": "Executing workflow..."}

        result = await self.execute(code)

        if result.get("success"):
            yield {"status": "complete", "result": result}
        else:
            yield {"status": "error", "error": result.get("error")}

    def _extract_metadata(self, code: str) -> dict:
        """Extract metadata from code comments and variables"""
        meta = {}

        lines = code.split('\n')
        for line in lines:
            line = line.strip()

            # Parse header comments like: # provider: local
            if line.startswith('#') and ':' in line:
                key, _, value = line[1:].partition(':')
                key = key.strip().lower()
                value = value.strip()
                if key in ['provider', 'model', 'name', 'description', 'category']:
                    meta[key] = value

            # Look for prompt variable
            if 'prompt' in line and '=' in line:
                # Basic extraction - could be improved
                if '"' in line:
                    start = line.index('"') + 1
                    end = line.rindex('"')
                    meta['prompt'] = line[start:end]
                elif "'" in line:
                    start = line.index("'") + 1
                    end = line.rindex("'")
                    meta['prompt'] = line[start:end]

        return meta
