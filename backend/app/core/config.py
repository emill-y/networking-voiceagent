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
    # Speech-to-text on the server (the app transcribes on the phone when it can).
    # "local" = faster-whisper on this machine; "openai_compatible" = hosted
    # Whisper at LLM_BASE_URL (e.g. Groq); "huggingface" = HF Inference Providers.
    transcription_provider: str = "local"
    stt_model: str = "whisper-large-v3-turbo"
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
    llm_model: str = "openai/gpt-oss-120b"
    # For reasoning models (e.g. gpt-oss): "low" | "medium" | "high". Empty = don't send.
    llm_reasoning_effort: str | None = None
    # Tried when the main model is rate-limited (limits are per model).
    llm_fallback_model: str | None = "openai/gpt-oss-20b"
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
    dev_user_email: str | None = None

    cors_origins: list[str] = field(default_factory=list)

    # Google Calendar sync (optional). The OAuth client from Google Cloud;
    # the key encrypts stored calendar tokens (derived from the secret if unset).
    google_client_id: str | None = None
    google_client_secret: str | None = None
    calendar_key: str | None = None
    # The public address, e.g. https://nomi.vercel.app (else taken from the request).
    public_url: str | None = None

    # Email for contact shares and invites (optional): a Resend API key and
    # the verified sender, e.g. "Nomi <hello@yourdomain.com>". Without it,
    # shares still work through a link the sender copies.
    resend_api_key: str | None = None
    email_from: str = "Nomi <onboarding@resend.dev>"
    # Free alternative to Resend: send through a Gmail account with an app
    # password (Google Account -> Security -> App passwords). No domain needed.
    gmail_address: str | None = None
    gmail_app_password: str | None = None

    # The spot number the first waitlist signup sees (WAITLIST_START, default 1).
    # Only the displayed spot moves; counts and the database stay real.
    waitlist_start: int = 1

    # Event providers for Plan Events (optional, free keys).
    ticketmaster_api_key: str | None = None
    seatgeek_client_id: str | None = None


@lru_cache
def _waitlist_start(value: str | None) -> int:
    try:
        return max(1, int((value or "1").strip()))
    except ValueError:
        return 1


def get_settings() -> Settings:
    _load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    env = os.environ
    return Settings(
        transcription_provider=env.get("TRANSCRIPTION_PROVIDER", "local").strip().lower(),
        stt_model=env.get("STT_MODEL", "whisper-large-v3-turbo"),
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
        llm_model=env.get("LLM_MODEL", "openai/gpt-oss-120b"),
        llm_reasoning_effort=env.get("LLM_REASONING_EFFORT") or None,
        llm_fallback_model=env.get("LLM_FALLBACK_MODEL", "openai/gpt-oss-20b") or None,
        llm_timeout_seconds=float(env.get("LLM_TIMEOUT_SECONDS", "30")),
        ollama_url=env.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
        ollama_model=env.get("OLLAMA_MODEL", "qwen3:4b"),
        ollama_timeout_seconds=float(env.get("OLLAMA_TIMEOUT_SECONDS", "120")),
        database_url=env.get("DATABASE_URL") or None,
        supabase_url=(env.get("SUPABASE_URL") or "").rstrip("/") or None,
        supabase_jwt_secret=env.get("SUPABASE_JWT_SECRET") or None,
        dev_auth=env.get("NOMI_DEV_AUTH", "").strip().lower() in {"1", "true", "yes"},
        dev_user_id=env.get("DEV_USER_ID", "00000000-0000-0000-0000-000000000001"),
        dev_user_email=env.get("DEV_USER_EMAIL") or None,
        google_client_id=env.get("GOOGLE_CLIENT_ID") or None,
        google_client_secret=env.get("GOOGLE_CLIENT_SECRET") or None,
        calendar_key=env.get("CALENDAR_ENCRYPTION_KEY") or None,
        public_url=(env.get("PUBLIC_URL") or "").rstrip("/") or None,
        resend_api_key=env.get("RESEND_API_KEY") or None,
        email_from=env.get("EMAIL_FROM") or "Nomi <onboarding@resend.dev>",
        gmail_address=(env.get("GMAIL_ADDRESS") or "").strip() or None,
        # Google shows app passwords in groups of four; spaces don't matter.
        gmail_app_password=(env.get("GMAIL_APP_PASSWORD") or "").replace(" ", "") or None,
        waitlist_start=_waitlist_start(env.get("WAITLIST_START")),
        ticketmaster_api_key=env.get("TICKETMASTER_API_KEY") or None,
        seatgeek_client_id=env.get("SEATGEEK_CLIENT_ID") or None,
        cors_origins=_csv(
            env.get("CORS_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081")
        ),
    )
