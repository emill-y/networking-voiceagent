"""Small crypto helpers for calendar sync.

- Stored Google refresh tokens are encrypted (Fernet: AES + HMAC).
- The OAuth "state" parameter is signed, so a callback can only complete a
  connection that this server started, for the user who started it.
"""

import base64
import hashlib
import hmac
import json
import time
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings

STATE_TTL_SECONDS = 600


class CryptoError(Exception):
    pass


def _key_material(settings: Settings, purpose: str) -> bytes:
    secret = settings.calendar_key or settings.google_client_secret
    if not secret:
        raise CryptoError("Calendar sync isn't configured (GOOGLE_CLIENT_SECRET).")
    return hashlib.sha256(f"nomi:{purpose}:{secret}".encode()).digest()


def _fernet(settings: Settings) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_key_material(settings, "calendar-token")))


def encrypt(settings: Settings, value: str) -> str:
    return _fernet(settings).encrypt(value.encode()).decode()


def decrypt(settings: Settings, value: str) -> str:
    try:
        return _fernet(settings).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise CryptoError("Stored calendar token can't be read.") from exc


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_state(settings: Settings, user_id: UUID, return_to: str, now: float | None = None) -> str:
    payload = _b64(json.dumps({"u": str(user_id), "r": return_to, "t": int(now or time.time())}).encode())
    mac = hmac.new(_key_material(settings, "oauth-state"), payload.encode(), hashlib.sha256).digest()
    return f"{payload}.{_b64(mac)}"


def verify_state(settings: Settings, state: str, now: float | None = None) -> tuple[UUID, str]:
    try:
        payload, mac = state.split(".", 1)
        expected = hmac.new(_key_material(settings, "oauth-state"), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_unb64(mac), expected):
            raise CryptoError("Bad signature")
        data = json.loads(_unb64(payload))
        if (now or time.time()) - data["t"] > STATE_TTL_SECONDS:
            raise CryptoError("Expired")
        return UUID(data["u"]), data["r"]
    except (ValueError, KeyError, TypeError) as exc:
        raise CryptoError("Invalid state") from exc
