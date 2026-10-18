"""The website waitlist.

    POST /waitlist/join          join (name, school, email, optional ref code)
    GET  /waitlist/stats         how many people have joined (for the page)
    GET  /waitlist/spot/{code}   your spot and how many friends joined with your link

The page itself is the website's /waitlist.

Public, so it is rate limited per visitor. Joining twice with the same email
returns your existing spot instead of an error, so nobody loses their link.
A welcome email goes out when Resend is configured (RESEND_API_KEY); it is
sent before the response, so it can't be lost when the host stops work.
"""

import html
import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
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


def _welcome_html(first: str, position: int, url: str, friend_code: str) -> str:
    """The welcome email, in the website's look: warm black, one orange accent."""
    e = html.escape
    perks = "".join(
        f"<tr><td style='padding:6px 0;font-size:15px;color:#e8ddd3'>"
        f"<span style='color:#ff8a3d;font-weight:700'>&#10022;</span>&nbsp;&nbsp;{p}</td></tr>"
        for p in ("Early access before launch", "A founding member badge", "Nomi Premium, free",
                  "A friend code that gives your friends a discount")
    )
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#080605">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080605;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#15100d;border:1px solid #3a2a20;border-radius:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<tr><td style="padding:32px 32px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:22px;height:22px;border-radius:11px;background:#ff6b1a"></td>
    <td style="padding-left:10px;font-size:20px;font-weight:700;color:#fff6ee">Nomi</td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 32px 0">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d;font-weight:700">Founding member</p>
  <h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;color:#fff6ee">You're on the list, {e(first)}!</h1>
  <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#c9bdb2">You're <b style="color:#fff6ee">#{position}</b> on the Nomi waitlist. Nomi remembers everyone you meet, and as a founding member you get in first.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{perks}</table>
</td></tr>
<tr><td style="padding:24px 32px 0">
  <p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#c9bdb2">Share your invite link. The founding members who bring the most friends get in first.</p>
  <a href="{e(url)}" style="display:inline-block;background:#ff6b1a;color:#1a0802;font-weight:700;font-size:16px;text-decoration:none;padding:14px 26px;border-radius:999px">Share your invite link</a>
  <p style="margin:12px 0 0;font-size:13px;color:#8e8178;word-break:break-all">{e(url)}</p>
</td></tr>
<tr><td style="padding:24px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #5a4030;border-radius:16px">
  <tr><td style="padding:16px 18px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ff8a3d;font-weight:700">Your friend code</p>
    <p style="margin:0 0 6px;font-size:24px;font-weight:800;letter-spacing:2px;color:#fff6ee">{e(friend_code)}</p>
    <p style="margin:0;font-size:14px;line-height:1.5;color:#c9bdb2">When Premium opens, friends who join with your code get a founding-friend discount.</p>
  </td></tr></table>
</td></tr>
<tr><td style="padding:24px 32px 32px">
  <p style="margin:0;font-size:15px;line-height:1.55;color:#c9bdb2">We'll email you the moment your spot opens.<br>&mdash; Eisha &amp; Stephanie, the Nomi team</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#6e625a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">You're getting this because you joined the waitlist at nomi-connect.vercel.app.</p>
</td></tr></table></body></html>"""


def _welcome(settings: Settings, to: str, name: str, position: int, url: str, friend_code: str) -> bool:
    first = name.split()[0]
    text = (
        f"Hi {first},\n\n"
        f"You're #{position} on the Nomi waitlist as a founding member. That means early access before anyone else, "
        "a founding badge in the app, and Nomi Premium free when it launches.\n\n"
        f"Share your invite link; the founding members who bring the most friends get in first: {url}\n\n"
        f"Your friend code is {friend_code}. When Premium opens, friends who join with it get a founding-friend discount.\n\n"
        "We'll email you the moment your spot opens.\n\n"
        "— Eisha & Stephanie, the Nomi team"
    )
    return mail.send(settings, to, "You're on the Nomi waitlist", text,
                     html_body=_welcome_html(first, position, url, friend_code))


@router.post("/waitlist/join", response_model=Spot, status_code=status.HTTP_201_CREATED)
def join(body: JoinRequest, request: Request, conn: Connection = Depends(get_db),
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
    # Sent before responding: serverless hosts (Vercel) can stop work that
    # runs after the response, so a background send could silently vanish.
    if mail.can_send(settings) and _welcome(settings, row["email"], row["name"], spot.position, spot.referral_url, row["friend_code"]):
        repo.mark_welcomed(conn, row["id"])
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
