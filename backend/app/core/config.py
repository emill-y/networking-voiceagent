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
    # Speech-to-text (faster-whisper)
    whisper_model: str = "small.en"
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"
    max_upload_bytes: int = 10 * 1024 * 1024

    # LLM (Ollama)
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:4b"
    ollama_timeout_seconds: float = 120.0

    # Database (Supabase Postgres connection string)
    database_url: str | None = None

    # Until Supabase Auth is wired in, every request acts as this user.
    dev_user_id: str = "00000000-0000-0000-0000-000000000001"

    cors_origins: list[str] = field(default_factory=list)


@lru_cache
def get_settings() -> Settings:
    _load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    env = os.environ
    return Settings(
        whisper_model=env.get("WHISPER_MODEL", "small.en"),
        whisper_device=env.get("WHISPER_DEVICE", "auto"),
        whisper_compute_type=env.get("WHISPER_COMPUTE_TYPE", "int8"),
        max_upload_bytes=int(env.get("MAX_UPLOAD_MB", "10")) * 1024 * 1024,
        ollama_url=env.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
        ollama_model=env.get("OLLAMA_MODEL", "qwen3:4b"),
        ollama_timeout_seconds=float(env.get("OLLAMA_TIMEOUT_SECONDS", "120")),
        database_url=env.get("DATABASE_URL") or None,
        dev_user_id=env.get("DEV_USER_ID", "00000000-0000-0000-0000-000000000001"),
        cors_origins=_csv(
            env.get("CORS_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081")
        ),
    )
