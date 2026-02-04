"""
ComfyUI → Python Translator

Main entry point for converting ComfyUI workflows to Python code.
"""

import json
from pathlib import Path
from typing import Union

try:
    from .parser import WorkflowParser, WorkflowGraph
    from .patterns import PatternRecognizer, PatternMatch
    from .codegen import CodeGenerator
except ImportError:
    from parser import WorkflowParser, WorkflowGraph
    from patterns import PatternRecognizer, PatternMatch
    from codegen import CodeGenerator


class ComfyTranslator:
    """
    Translates ComfyUI workflow JSON to clean Python code.

    Usage:
        translator = ComfyTranslator()

        # From JSON string
        code = translator.translate(workflow_json_string)

        # From file
        code = translator.translate_file("workflow.json")

        # From dict
        code = translator.translate_dict(workflow_dict)
    """

    def __init__(self):
        self.parser = WorkflowParser()
        self.recognizer = PatternRecognizer()
        self.codegen = CodeGenerator()

    def translate(self, workflow_json: str) -> str:
        """Translate workflow JSON string to Python code"""
        try:
            workflow_dict = json.loads(workflow_json)
            return self.translate_dict(workflow_dict)
        except json.JSONDecodeError as e:
            return f"# Error: Invalid JSON - {e}"

    def translate_file(self, filepath: Union[str, Path]) -> str:
        """Translate workflow from a JSON file"""
        path = Path(filepath)
        if not path.exists():
            return f"# Error: File not found - {filepath}"

        content = path.read_text()

        # Handle image files with embedded workflow
        if path.suffix.lower() in ('.png', '.webp'):
            workflow = self._extract_from_image(path)
            if workflow:
                return self.translate_dict(workflow)
            return "# Error: No workflow found in image metadata"

        return self.translate(content)

    def translate_dict(self, workflow: dict) -> str:
        """Translate workflow dictionary to Python code"""
        # Parse workflow into graph
        graph = self.parser.parse(workflow)

        # Recognize patterns
        patterns = self.recognizer.analyze(graph)

        # Generate code
        code = self.codegen.generate(graph, patterns)

        return code

    def analyze(self, workflow_json: str) -> dict:
        """
        Analyze workflow and return structured information.
        Useful for understanding a workflow before translation.
        """
        try:
            workflow_dict = json.loads(workflow_json)
        except json.JSONDecodeError as e:
            return {"error": f"Invalid JSON: {e}"}

        graph = self.parser.parse(workflow_dict)
        patterns = self.recognizer.analyze(graph)

        return {
            "node_count": len(graph.nodes),
            "execution_order": graph.execution_order,
            "root_nodes": graph.root_nodes,
            "terminal_nodes": graph.terminal_nodes,
            "patterns": [
                {
                    "type": p.pattern_type,
                    "config": p.config,
                    "nodes": p.nodes,
                }
                for p in patterns
            ],
            "summary": self.recognizer.summarize(patterns),
        }

    def _extract_from_image(self, image_path: Path) -> dict | None:
        """Extract workflow from PNG/WebP metadata"""
        try:
            from PIL import Image
            from PIL.PngImagePlugin import PngInfo

            img = Image.open(image_path)

            # ComfyUI stores workflow in 'prompt' or 'workflow' metadata
            if hasattr(img, 'info'):
                if 'prompt' in img.info:
                    return json.loads(img.info['prompt'])
                if 'workflow' in img.info:
                    return json.loads(img.info['workflow'])

            # Try PNG text chunks
            if hasattr(img, 'text'):
                if 'prompt' in img.text:
                    return json.loads(img.text['prompt'])
                if 'workflow' in img.text:
                    return json.loads(img.text['workflow'])

            return None
        except Exception:
            return None


# CLI interface
def main():
    """Command-line interface for the translator"""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m translator <workflow.json>")
        print("       python -m translator <image_with_workflow.png>")
        sys.exit(1)

    filepath = sys.argv[1]
    translator = ComfyTranslator()

    # Check for --analyze flag
    if '--analyze' in sys.argv:
        with open(filepath) as f:
            result = translator.analyze(f.read())
        print(json.dumps(result, indent=2))
    else:
        code = translator.translate_file(filepath)
        print(code)


if __name__ == "__main__":
    main()
