"""
RawDiffusion Providers
BYOK - Bring Your Own Key/Model

Supports:
- Local models (diffusers)
- Stability AI API
- Replicate
- FAL.ai
- RunPod
- Any OpenAI-compatible endpoint
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Any
import os


class BaseProvider(ABC):
    """Base class for all providers"""

    def __init__(self, config: dict = None):
        self.config = config or {}

    @abstractmethod
    async def execute(self, code: str) -> dict:
        """Execute workflow and return result"""
        pass

    async def execute_stream(self, code: str) -> AsyncIterator[dict]:
        """Execute with streaming progress updates"""
        # Default: just yield final result
        result = await self.execute(code)
        yield {"status": "complete", "result": result}


def get_provider(name: str, config: dict = None) -> BaseProvider:
    """Factory function to get provider by name"""
    providers = {
        "local": "providers.local:LocalProvider",
        "stability": "providers.stability:StabilityProvider",
        "replicate": "providers.replicate:ReplicateProvider",
        "fal": "providers.fal:FalProvider",
        "runpod": "providers.runpod:RunPodProvider",
    }

    if name not in providers:
        raise ValueError(f"Unknown provider: {name}. Available: {list(providers.keys())}")

    module_path, class_name = providers[name].split(":")

    # Dynamic import
    import importlib
    module = importlib.import_module(module_path)
    provider_class = getattr(module, class_name)

    return provider_class(config)
