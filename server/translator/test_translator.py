"""Test the ComfyUI translator"""

import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from translator import ComfyTranslator

# Basic ComfyUI workflow (from their docs)
BASIC_WORKFLOW = """
{
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "cfg": 8,
            "denoise": 1,
            "latent_image": ["5", 0],
            "model": ["4", 0],
            "negative": ["7", 0],
            "positive": ["6", 0],
            "sampler_name": "euler",
            "scheduler": "normal",
            "seed": 8566257,
            "steps": 20
        }
    },
    "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
            "ckpt_name": "v1-5-pruned-emaonly.safetensors"
        }
    },
    "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
            "batch_size": 1,
            "height": 512,
            "width": 512
        }
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["4", 1],
            "text": "masterpiece, best quality, a beautiful sunset over mountains"
        }
    },
    "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "clip": ["4", 1],
            "text": "bad quality, blurry, ugly"
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["3", 0],
            "vae": ["4", 2]
        }
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {
            "filename_prefix": "ComfyUI",
            "images": ["8", 0]
        }
    }
}
"""

# Workflow with LoRA
LORA_WORKFLOW = """
{
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}
    },
    "2": {
        "class_type": "LoraLoader",
        "inputs": {
            "lora_name": "anime_style.safetensors",
            "strength_model": 0.8,
            "strength_clip": 0.8,
            "model": ["1", 0],
            "clip": ["1", 1]
        }
    },
    "3": {
        "class_type": "CLIPTextEncode",
        "inputs": {"clip": ["2", 1], "text": "anime girl, colorful"}
    },
    "4": {
        "class_type": "CLIPTextEncode",
        "inputs": {"clip": ["2", 1], "text": "bad quality"}
    },
    "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
    },
    "6": {
        "class_type": "KSampler",
        "inputs": {
            "model": ["2", 0],
            "positive": ["3", 0],
            "negative": ["4", 0],
            "latent_image": ["5", 0],
            "seed": 12345,
            "steps": 30,
            "cfg": 7,
            "sampler_name": "dpmpp_2m",
            "scheduler": "karras",
            "denoise": 1
        }
    },
    "7": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["6", 0], "vae": ["1", 2]}
    },
    "8": {
        "class_type": "SaveImage",
        "inputs": {"images": ["7", 0], "filename_prefix": "anime"}
    }
}
"""

# ControlNet workflow
CONTROLNET_WORKFLOW = """
{
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}
    },
    "2": {
        "class_type": "ControlNetLoader",
        "inputs": {"control_net_name": "control_v11p_sd15_canny.safetensors"}
    },
    "3": {
        "class_type": "LoadImage",
        "inputs": {"image": "pose.png"}
    },
    "4": {
        "class_type": "CannyEdgePreprocessor",
        "inputs": {"image": ["3", 0], "low_threshold": 100, "high_threshold": 200}
    },
    "5": {
        "class_type": "CLIPTextEncode",
        "inputs": {"clip": ["1", 1], "text": "a person standing"}
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {"clip": ["1", 1], "text": "blurry"}
    },
    "7": {
        "class_type": "ControlNetApply",
        "inputs": {
            "conditioning": ["5", 0],
            "control_net": ["2", 0],
            "image": ["4", 0],
            "strength": 0.8
        }
    },
    "8": {
        "class_type": "EmptyLatentImage",
        "inputs": {"width": 512, "height": 768, "batch_size": 1}
    },
    "9": {
        "class_type": "KSampler",
        "inputs": {
            "model": ["1", 0],
            "positive": ["7", 0],
            "negative": ["6", 0],
            "latent_image": ["8", 0],
            "seed": 42,
            "steps": 25,
            "cfg": 7.5,
            "sampler_name": "euler_ancestral",
            "scheduler": "normal",
            "denoise": 1
        }
    },
    "10": {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["9", 0], "vae": ["1", 2]}
    },
    "11": {
        "class_type": "SaveImage",
        "inputs": {"images": ["10", 0], "filename_prefix": "controlnet"}
    }
}
"""


def test_basic():
    print("=" * 60)
    print("TEST: Basic txt2img workflow")
    print("=" * 60)

    translator = ComfyTranslator()

    # Analyze first
    analysis = translator.analyze(BASIC_WORKFLOW)
    print(f"\nAnalysis:")
    print(f"  Nodes: {analysis['node_count']}")
    print(f"  Execution order: {analysis['execution_order']}")
    print(f"\n{analysis['summary']}")

    # Generate code
    print("\n" + "-" * 40)
    print("Generated Python code:")
    print("-" * 40)
    code = translator.translate(BASIC_WORKFLOW)
    print(code)


def test_lora():
    print("\n" + "=" * 60)
    print("TEST: SDXL with LoRA workflow")
    print("=" * 60)

    translator = ComfyTranslator()

    analysis = translator.analyze(LORA_WORKFLOW)
    print(f"\nAnalysis:")
    print(f"  Nodes: {analysis['node_count']}")
    print(f"\n{analysis['summary']}")

    print("\n" + "-" * 40)
    print("Generated Python code:")
    print("-" * 40)
    code = translator.translate(LORA_WORKFLOW)
    print(code)


def test_controlnet():
    print("\n" + "=" * 60)
    print("TEST: ControlNet workflow")
    print("=" * 60)

    translator = ComfyTranslator()

    analysis = translator.analyze(CONTROLNET_WORKFLOW)
    print(f"\nAnalysis:")
    print(f"  Nodes: {analysis['node_count']}")
    print(f"\n{analysis['summary']}")

    print("\n" + "-" * 40)
    print("Generated Python code:")
    print("-" * 40)
    code = translator.translate(CONTROLNET_WORKFLOW)
    print(code)


if __name__ == "__main__":
    test_basic()
    test_lora()
    test_controlnet()
