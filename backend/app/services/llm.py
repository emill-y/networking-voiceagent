"""LLM access behind a tiny interface so the model/provider can change.

Today: Qwen3 served locally by Ollama. Anything that can take a system
prompt, a user message and a JSON Schema, and return JSON text, can
implement `LLMClient`.
"""

import logging
import time
from typing import Protocol

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """The model server can't be reached or returned an error."""


class LLMClient(Protocol):
    def chat_json(self, system: str, user: str, schema: dict) -> str: ...


class OllamaClient:
    def __init__(self, base_url: str, model: str, timeout_seconds: float) -> None:
        self._url = f"{base_url}/api/chat"
        self._model = model
        self._timeout = timeout_seconds

    def chat_json(self, system: str, user: str, schema: dict) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            # Structured outputs: Ollama constrains generation to this schema.
            "format": schema,
            # Qwen3 "thinking" adds latency and isn't needed for extraction.
            "think": False,
            "stream": False,
            "options": {"temperature": 0},
        }
        started = time.perf_counter()
        try:
            response = httpx.post(self._url, json=payload, timeout=self._timeout)
            response.raise_for_status()
            content = response.json()["message"]["content"]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise LLMUnavailable(f"The language model ({self._model}) is unavailable.") from exc
        logger.info("LLM %s responded in %dms", self._model, (time.perf_counter() - started) * 1000)
        return content


_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """FastAPI dependency. Tests override this with a fake."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = OllamaClient(
            settings.ollama_url, settings.ollama_model, settings.ollama_timeout_seconds
        )
    return _client
