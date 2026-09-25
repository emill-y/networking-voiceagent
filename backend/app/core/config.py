"""Runtime settings read from environment variables.

Secrets and machine-specific values live in `backend/.env` (ignored by Git)
or the process environment, never in code. See `backend/.env.example`.
"""

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines, existing env vars win."""
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Speech-to-text. "local" = faster-whisper on this machine;
    # "huggingface" = Hugging Face Inference Providers (audio leaves the machine).
    transcription_provider: str = "local"
    hf_token: str | None = None
    hf_inference_provider: str = "fal-ai"
    hf_asr_model: str = "openai/whisper-large-v3"

    # faster-whisper (local)
    whisper_model: str = "small.en"
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"
    max_upload_bytes: int = 10 * 1024 * 1024

    # LLM. "ollama" = local Qwen via Ollama (development);
    # "openai_compatible" = a hosted API such as Groq or OpenAI (production).
    llm_provider: str = "ollama"
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str | None = None
    llm_model: str = "llama-3.3-70b-versatile"
    llm_timeout_seconds: float = 30.0

    # Ollama
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:4b"
    ollama_timeout_seconds: float = 120.0

    # Database (Supabase Postgres connection string)
    database_url: str | None = None

    # Supabase Auth. Tokens are verified against this project.
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None  # only for legacy HS256 projects

    # Local development without Supabase: every request acts as dev_user_id.
    dev_auth: bool = False
    dev_user_id: str = "00000000-0000-0000-0000-000000000001"

    cors_origins: list[str] = field(default_factory=list)


@lru_cache
def get_settings() -> Settings:
    _load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    env = os.environ
    return Settings(
        transcription_provider=env.get("TRANSCRIPTION_PROVIDER", "local").strip().lower(),
        hf_token=env.get("HF_TOKEN") or None,
        hf_inference_provider=env.get("HF_INFERENCE_PROVIDER", "fal-ai"),
        hf_asr_model=env.get("HF_ASR_MODEL", "openai/whisper-large-v3"),
        whisper_model=env.get("WHISPER_MODEL", "small.en"),
        whisper_device=env.get("WHISPER_DEVICE", "auto"),
        whisper_compute_type=env.get("WHISPER_COMPUTE_TYPE", "int8"),
        max_upload_bytes=int(env.get("MAX_UPLOAD_MB", "10")) * 1024 * 1024,
        llm_provider=env.get("LLM_PROVIDER", "ollama").strip().lower(),
        llm_base_url=env.get("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/"),
        llm_api_key=env.get("LLM_API_KEY") or None,
        llm_model=env.get("LLM_MODEL", "llama-3.3-70b-versatile"),
        llm_timeout_seconds=float(env.get("LLM_TIMEOUT_SECONDS", "30")),
        ollama_url=env.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
        ollama_model=env.get("OLLAMA_MODEL", "qwen3:4b"),
        ollama_timeout_seconds=float(env.get("OLLAMA_TIMEOUT_SECONDS", "120")),
        database_url=env.get("DATABASE_URL") or None,
        supabase_url=(env.get("SUPABASE_URL") or "").rstrip("/") or None,
        supabase_jwt_secret=env.get("SUPABASE_JWT_SECRET") or None,
        dev_auth=env.get("NOMI_DEV_AUTH", "").strip().lower() in {"1", "true", "yes"},
        dev_user_id=env.get("DEV_USER_ID", "00000000-0000-0000-0000-000000000001"),
        cors_origins=_csv(
            env.get("CORS_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081")
        ),
    )
