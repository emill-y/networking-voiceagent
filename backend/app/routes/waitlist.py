"""The website waitlist.

    POST /waitlist/join          join (name, school, email, optional ref code)
    GET  /waitlist/stats         how many people have joined (for the page)
    GET  /waitlist/spot/{code}   your spot and how many friends joined with your link

The page itself is the website's /waitlist.

Public, so it is rate limited per visitor. Joining twice with the same email
returns your existing spot instead of an error, so nobody loses their link.
A welcome email goes out when Resend is configured (RESEND_API_KEY).
"""

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from psycopg import Connection
from pydantic import StringConstraints

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.rate_limit import RateLimiter
from app.repositories import waitlist as repo
from app.routes.demo import visitor
from app.schemas.base import ApiModel
from app.services import email as mail

logger = logging.getLogger(__name__)
router = APIRouter()

per_hour = RateLimiter(max_requests=10, per_seconds=3600)
# No look-alike characters (0/O, 1/I/L), so codes are easy to read and type.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z0-9]{4,12}$")]


class JoinRequest(ApiModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    school: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    email: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    ref: str | None = None


class Spot(ApiModel):
    name: str
    position: int
    total: int
    referral_code: str
    referral_url: str
    friend_code: str
    referrals: int
    already_joined: bool = False


class Stats(ApiModel):
    total: int


def _code(n: int) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def _base_url(request: Request, settings: Settings) -> str:
    return settings.public_url or str(request.base_url).rstrip("/")


def _spot(conn: Connection, row: dict, base: str, already: bool = False) -> Spot:
    return Spot(
        name=row["name"],
        position=repo.position(conn, row),
        total=repo.total(conn),
        referral_code=row["referral_code"],
        referral_url=f"{base}/waitlist?ref={row['referral_code']}",
        friend_code=row["friend_code"],
        referrals=repo.referrals(conn, row["referral_code"]),
        already_joined=already,
    )


def _welcome(settings: Settings, to: str, name: str, url: str, friend_code: str) -> bool:
    first = name.split()[0]
    text = (
        f"Hi {first},\n\n"
        "You're on the Nomi waitlist as a founding member. That means early access before anyone else, "
        "a founding badge in the app, and founding-member pricing when Premium launches.\n\n"
        f"Move up the list by sharing your link with friends: {url}\n\n"
        f"Your friend code is {friend_code}. When Premium opens, friends who join with it get a founding-friend discount.\n\n"
        "We'll email you the moment your spot opens.\n\n"
        "— The Nomi team"
    )
    return mail.send(settings, to, "You're on the Nomi waitlist", text, button=("Share your link", url))


def _send_welcome(row_id, to: str, name: str, url: str, friend_code: str) -> None:
    settings = get_settings()
    if not _welcome(settings, to, name, url, friend_code):
        return
    # A fresh connection: the request's transaction is already committed.
    try:
        for conn in get_db():
            repo.mark_welcomed(conn, row_id)
    except Exception:  # noqa: BLE001 - the email went out; the timestamp is a nicety
        logger.warning("Welcome email sent but not recorded for a waitlist signup")


@router.post("/waitlist/join", response_model=Spot, status_code=status.HTTP_201_CREATED)
def join(body: JoinRequest, request: Request, background: BackgroundTasks, conn: Connection = Depends(get_db),
         settings: Settings = Depends(get_settings)) -> Spot:
    per_hour.check(visitor(request))  # type: ignore[arg-type]
    base = _base_url(request, settings)
    existing = repo.by_email(conn, body.email)
    if existing:
        return _spot(conn, existing, base, already=True)

    ref = (body.ref or "").strip().upper() or None
    if ref and not repo.code_exists(conn, ref):
        ref = None  # a mistyped or made-up code just doesn't count
    for _ in range(5):
        code = _code(6)
        if not repo.code_exists(conn, code):
            break
    row = repo.add(conn, body.name, body.school, body.email, code, ref, f"NOMI-{_code(5)}")
    if row is None:  # the same email joined a moment ago
        existing = repo.by_email(conn, body.email)
        if not existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "Please try again.")
        return _spot(conn, existing, base, already=True)

    spot = _spot(conn, row, base)
    if mail.can_send(settings):
        background.add_task(_send_welcome, row["id"], row["email"], row["name"], spot.referral_url, row["friend_code"])
    return spot


@router.get("/waitlist/stats", response_model=Stats)
def stats(conn: Connection = Depends(get_db)) -> Stats:
    return Stats(total=repo.total(conn))


@router.get("/waitlist/spot/{code}", response_model=Spot)
def spot(code: CODE, request: Request, conn: Connection = Depends(get_db), settings: Settings = Depends(get_settings)) -> Spot:
    row = repo.by_code(conn, code)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That referral code isn't on the list.")
    return _spot(conn, row, _base_url(request, settings))
