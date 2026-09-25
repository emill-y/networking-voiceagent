"""Check the backend's setup, one piece at a time.

    python -m scripts.doctor

Prints OK or a specific problem for: settings, Supabase sign-in keys,
the database and its tables, Ollama, and speech-to-text. Never prints
secrets.
"""

import json
import re
import ssl
import urllib.request

import httpx
import psycopg

from app.core.config import get_settings

results: list[bool] = []


def report(name: str, ok: bool, detail: str) -> None:
    results.append(ok)
    print(f"{'OK  ' if ok else 'FAIL'}  {name}: {detail}")


def check_settings(settings) -> None:
    report("SUPABASE_URL", bool(settings.supabase_url), settings.supabase_url or "not set in backend/.env")
    url = settings.database_url or ""
    masked = re.sub(r":[^:@/]+@", ":****@", url) if url else "not set in backend/.env"
    # postgresql://user:password@host — an empty password looks like "user:@host".
    has_password = bool(re.search(r"://[^:/@]+:[^@]+@", url))
    ok = bool(url) and "[YOUR-PASSWORD]" not in url and has_password
    if not url or ok:
        report("DATABASE_URL", ok, masked)
    else:
        report("DATABASE_URL", False, f"{masked} (the database password is missing)")
    report("NOMI_DEV_AUTH", not settings.dev_auth, "off" if not settings.dev_auth else "ON (every request is the dev user)")


def check_jwks(settings) -> None:
    if not settings.supabase_url:
        return
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    try:
        # Same HTTP stack PyJWT uses to fetch keys (urllib).
        with urllib.request.urlopen(url, timeout=10) as response:
            keys = json.load(response).get("keys", [])
    except ssl.SSLError as exc:
        report("Supabase signing keys", False,
               f"SSL error ({exc}). On a python.org install, run "
               "'/Applications/Python 3.12/Install Certificates.command'.")
        return
    except Exception as exc:
        report("Supabase signing keys", False, f"can't fetch {url}: {exc}")
        return
    if keys:
        report("Supabase signing keys", True, f"{len(keys)} key(s), {', '.join(k.get('alg', '?') for k in keys)}")
    else:
        report("Supabase signing keys", bool(settings.supabase_jwt_secret),
               "no public keys: this project uses the legacy JWT secret; "
               + ("SUPABASE_JWT_SECRET is set" if settings.supabase_jwt_secret
                  else "set SUPABASE_JWT_SECRET (Project Settings -> JWT Keys -> Legacy JWT secret)"))


def check_database(settings) -> None:
    if not settings.database_url:
        return
    try:
        with psycopg.connect(settings.database_url, connect_timeout=10) as conn:
            tables = {row[0] for row in conn.execute(
                "select table_name from information_schema.tables where table_schema = 'public'")}
    except Exception as exc:
        report("Database connection", False, str(exc).strip().splitlines()[0])
        return
    report("Database connection", True, "connected")
    missing = {"contacts", "interactions", "follow_ups"} - tables
    report("Database tables", not missing,
           "present" if not missing else f"missing {', '.join(sorted(missing))}: run python -m scripts.migrate")


def check_llm(settings) -> None:
    if settings.llm_provider == "openai_compatible":
        if not settings.llm_api_key:
            report("Language model", False, "LLM_PROVIDER=openai_compatible but LLM_API_KEY is not set")
            return
        try:
            response = httpx.get(f"{settings.llm_base_url}/models", timeout=10,
                                 headers={"Authorization": f"Bearer {settings.llm_api_key}"})
        except Exception as exc:
            report("Language model", False, f"can't reach {settings.llm_base_url}: {exc}")
            return
        if response.status_code == 401:
            report("Language model", False, "LLM_API_KEY was rejected (401)")
            return
        ids = sorted(m.get("id") for m in response.json().get("data", [])) if response.is_success else []
        found = settings.llm_model in ids
        report("Language model", response.is_success and found,
               f"{settings.llm_model} at {settings.llm_base_url}" if found
               else f"{settings.llm_model} not offered at {settings.llm_base_url} (status {response.status_code})")
        if ids and not found:
            skip = ("whisper", "tts", "guard", "embed", "audio", "orpheus")
            chat = [i for i in ids if not any(word in i.lower() for word in skip)]
            print("      Models your key can use (set one as LLM_MODEL in backend/.env):")
            for model_id in chat:
                print(f"        {model_id}")
        return
    check_ollama(settings)


def check_ollama(settings) -> None:
    try:
        tags = httpx.get(f"{settings.ollama_url}/api/tags", timeout=5).json()
    except Exception:
        report("Ollama", False, f"not reachable at {settings.ollama_url}: run 'open -a Ollama'")
        return
    names = [m.get("name", "") for m in tags.get("models", [])]
    has = any(n == settings.ollama_model or n.startswith(settings.ollama_model + ":") for n in names)
    report("Ollama", has, f"{settings.ollama_model} installed" if has
           else f"{settings.ollama_model} missing: run 'ollama pull {settings.ollama_model}'")


def check_transcription(settings) -> None:
    if settings.transcription_provider == "openai_compatible":
        ok = bool(settings.llm_api_key)
        report("Speech-to-text", ok, f"hosted {settings.stt_model} at {settings.llm_base_url}"
               if ok else "TRANSCRIPTION_PROVIDER=openai_compatible needs LLM_API_KEY")
        return
    if settings.transcription_provider == "huggingface":
        report("Speech-to-text", bool(settings.hf_token),
               "Hugging Face" + ("" if settings.hf_token else ": set HF_TOKEN"))
        return
    try:
        import faster_whisper  # noqa: F401
    except Exception as exc:
        report("Speech-to-text", False,
               f"local Whisper not installed ({exc}): pip install -r requirements-local.txt, "
               "or rely on on-device transcription in the app")
        return
    report("Speech-to-text", True, f"local {settings.whisper_model} (downloads on first use)")


def main() -> int:
    settings = get_settings()
    check_settings(settings)
    check_jwks(settings)
    check_database(settings)
    check_llm(settings)
    check_transcription(settings)
    print("\nAll good." if all(results) else "\nFix the FAIL lines above, then restart the backend.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
