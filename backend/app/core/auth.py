"""Who is making this request?

The app signs people in with Supabase Auth and sends the resulting access
token on every request as `Authorization: Bearer <jwt>`. We verify that
token here and use its `sub` claim (the Supabase user id) as the owner of
every row the request reads or writes.

Verification checks the signature, expiry, issuer (your project) and
audience ("authenticated"). New Supabase projects sign tokens with an
asymmetric key (ES256/RS256) published at a JWKS URL; older projects use
a shared HS256 secret, supported via SUPABASE_JWT_SECRET.

For local development without Supabase, NOMI_DEV_AUTH=true skips all of
this and treats every request as DEV_USER_ID. Never enable that on a
server other people can reach.
"""

import logging
from uuid import UUID

import jwt
from fastapi import Header, HTTPException, status

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}


class SupabaseTokenVerifier:
    def __init__(self, supabase_url: str, jwt_secret: str | None = None, jwks_client=None) -> None:
        self.issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        self._secret = jwt_secret
        # PyJWKClient downloads the public keys once and caches them.
        self._jwks = jwks_client or jwt.PyJWKClient(
            f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=5
        )

    def verify(self, token: str) -> dict:
        """Returns the token's claims, or raises jwt.PyJWTError."""
        algorithm = jwt.get_unverified_header(token).get("alg")
        # Each branch allows exactly one kind of key, so a token can't pick
        # an algorithm that makes a public key act like a shared secret.
        if algorithm in ASYMMETRIC_ALGORITHMS:
            key = self._jwks.get_signing_key_from_jwt(token).key
        elif algorithm == "HS256" and self._secret:
            key = self._secret
        else:
            raise jwt.InvalidAlgorithmError(f"Unsupported token algorithm: {algorithm}")
        return jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=self.issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )


_verifier: SupabaseTokenVerifier | None = None


def get_verifier() -> SupabaseTokenVerifier:
    global _verifier
    if _verifier is None:
        settings = get_settings()
        _verifier = SupabaseTokenVerifier(settings.supabase_url or "", settings.supabase_jwt_secret)
    return _verifier


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, message, headers={"WWW-Authenticate": "Bearer"}
    )


def get_current_user_id(authorization: str | None = Header(default=None)) -> UUID:
    """FastAPI dependency: the signed-in user's id, or a 401."""
    settings = get_settings()
    if settings.dev_auth:
        return UUID(settings.dev_user_id)
    if not settings.supabase_url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Sign-in is not configured (SUPABASE_URL)."
        )

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("Please sign in.")

    try:
        claims = get_verifier().verify(token.strip())
    except jwt.PyJWKClientConnectionError as exc:
        logger.warning("Could not fetch Supabase signing keys")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Can't verify sign-in right now."
        ) from exc
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Your session expired. Please sign in again.") from exc
    except jwt.PyJWTError as exc:
        logger.info("Rejected token: %s", type(exc).__name__)
        raise _unauthorized("Please sign in again.") from exc

    try:
        return UUID(claims["sub"])
    except (KeyError, ValueError) as exc:
        raise _unauthorized("Please sign in again.") from exc
