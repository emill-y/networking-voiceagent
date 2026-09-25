import time
import uuid
from dataclasses import replace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.core import auth
from app.core.config import get_settings
from app.main import app
from tests.conftest import make_wav

PROJECT = "https://example-project.supabase.co"
USER = uuid.uuid4()
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())


class FakeJWKS:
    """Stands in for Supabase's published signing keys."""

    def __init__(self, key=PRIVATE_KEY.public_key(), error=None):
        self.key, self.error = key, error

    def get_signing_key_from_jwt(self, token):
        if self.error:
            raise self.error

        class SigningKey:
            pass

        signing_key = SigningKey()
        signing_key.key = self.key
        return signing_key


def token(key=PRIVATE_KEY, algorithm="ES256", **overrides):
    claims = {
        "sub": str(USER),
        "aud": "authenticated",
        "iss": f"{PROJECT}/auth/v1",
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
        **overrides,
    }
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=algorithm)


@pytest.fixture
def api(monkeypatch):
    settings = replace(get_settings(), supabase_url=PROJECT, supabase_jwt_secret="legacy-secret-at-least-32-bytes-long", dev_auth=False)
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "_verifier", auth.SupabaseTokenVerifier(PROJECT, settings.supabase_jwt_secret, FakeJWKS()))
    return TestClient(app)


def extract(api, bearer=None, header=None):
    headers = {"Authorization": header or f"Bearer {bearer}"} if (bearer or header) else {}
    return api.post("/extract", json={"transcript": ""}, headers=headers)


def test_health_needs_no_sign_in(api):
    assert api.get("/health").status_code == 200


def test_missing_token_is_401(api):
    response = extract(api)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_valid_token_passes_auth(api):
    # 422 = past authentication, failing only on the empty transcript.
    assert extract(api, token()).status_code == 422


@pytest.mark.parametrize(
    "bad",
    [
        token(key=OTHER_KEY),  # signed by someone else
        token(exp=int(time.time()) - 10),  # expired
        token(aud="anon"),  # wrong audience
        token(iss="https://evil.supabase.co/auth/v1"),  # another project
        token(sub=None),  # no user
        token(sub="not-a-uuid"),
        token(key="wrong-secret-at-least-32-bytes-long", algorithm="HS256"),
        "not.a.jwt",
    ],
)
def test_bad_tokens_are_401(api, bad):
    assert extract(api, bad).status_code == 401


def test_unsigned_token_is_rejected(api):
    unsigned = jwt.encode({"sub": str(USER), "aud": "authenticated"}, None, algorithm="none")
    assert extract(api, unsigned).status_code == 401


def test_legacy_hs256_secret(api):
    legacy = token(key="legacy-secret-at-least-32-bytes-long", algorithm="HS256")
    assert extract(api, legacy).status_code == 422


def test_non_bearer_scheme_is_401(api):
    assert extract(api, header=f"Basic {token()}").status_code == 401


def test_key_server_down_is_503(api, monkeypatch):
    monkeypatch.setattr(
        auth, "_verifier",
        auth.SupabaseTokenVerifier(PROJECT, None, FakeJWKS(error=jwt.PyJWKClientConnectionError("down"))),
    )
    assert extract(api, token()).status_code == 503


def test_uploads_need_sign_in(api):
    response = api.post("/transcribe", files={"audio": ("n.wav", make_wav(), "audio/wav")})
    assert response.status_code == 401


def test_dev_auth_skips_tokens(monkeypatch):
    settings = replace(get_settings(), dev_auth=True, supabase_url=None)
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    assert auth.get_current_user_id(None) == uuid.UUID(settings.dev_user_id)


def test_unconfigured_auth_is_503(monkeypatch):
    settings = replace(get_settings(), dev_auth=False, supabase_url=None)
    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    assert extract(TestClient(app), token()).status_code == 503
