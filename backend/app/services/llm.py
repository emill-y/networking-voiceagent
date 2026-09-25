"""LLM access behind a tiny interface so the model/provider can change.

- `OllamaClient`: Qwen3 on your own machine. Free and private; used in
  development. Too slow (and laptop-bound) for real users.
- `OpenAICompatibleClient`: any hosted API that speaks OpenAI's chat
  completions format: Groq (default, has a free tier), OpenAI, Together,
  OpenRouter, ... Typically answers in 1-3 seconds.

Anything that takes a system prompt, a user message and a JSON Schema, and
returns JSON text, can implement `LLMClient`.
"""

import json

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


class OpenAICompatibleClient:
    def __init__(self, base_url: str, api_key: str | None, model: str, timeout_seconds: float) -> None:
        self._url = f"{base_url}/chat/completions"
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds

    def chat_json(self, system: str, user: str, schema: dict) -> str:
        if not self._api_key:
            raise LLMUnavailable("LLM_API_KEY is not set for the hosted language model.")
        payload = {
            "model": self._model,
            "messages": [
                {
                    "role": "system",
                    # JSON mode guarantees valid JSON; the schema in the prompt
                    # guides its shape, and Pydantic validates it afterwards.
                    "content": f"{system}\n\nReply with a JSON object matching this JSON Schema:\n"
                    + json.dumps(schema),
                },
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
        started = time.perf_counter()
        try:
            response = httpx.post(
                self._url,
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            logger.warning("Hosted LLM call failed (%s, status %s)", type(exc).__name__, status)
            raise LLMUnavailable(f"The language model ({self._model}) is unavailable.") from exc
        logger.info("LLM %s responded in %dms", self._model, (time.perf_counter() - started) * 1000)
        return content


_client: LLMClient | None = None


def build_llm_client(settings) -> LLMClient:
    if settings.llm_provider == "openai_compatible":
        return OpenAICompatibleClient(
            settings.llm_base_url, settings.llm_api_key, settings.llm_model, settings.llm_timeout_seconds
        )
    if settings.llm_provider != "ollama":
        raise ValueError(
            f"Unknown LLM_PROVIDER '{settings.llm_provider}' (use 'ollama' or 'openai_compatible')."
        )
    return OllamaClient(settings.ollama_url, settings.ollama_model, settings.ollama_timeout_seconds)


def get_llm_client() -> LLMClient:
    """FastAPI dependency. Tests override this with a fake."""
    global _client
    if _client is None:
        _client = build_llm_client(get_settings())
    return _client
