"""Google Calendar: connect, disconnect, settings and upcoming events.

    GET    /calendar            status (is it set up, are you connected)
    POST   /calendar/connect    start Google sign-in; returns the URL to open
    GET    /calendar/callback   Google sends the browser back here
    PATCH  /calendar            turn "add follow-ups to my calendar" on or off
    DELETE /calendar            disconnect (and revoke Nomi's access)
    GET    /calendar/upcoming   next events with people worth talking to
"""

import logging
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from psycopg import Connection

from app.core import crypto
from app.core.auth import get_current_user_id
from app.core.config import get_settings
from app.core.db import get_db
from app.core.rate_limit import limit_ai_requests
from app.repositories import calendar as cal_repo
from app.schemas.calendar import (
    CalendarConnectRequest,
    CalendarConnectResponse,
    CalendarSettings,
    CalendarStatus,
    UpcomingResponse,
)
from app.services import calendar_sync
from app.services.google_calendar import CalendarError, CalendarScopeMissing, GoogleCalendar
from app.services.llm import LLMClient, get_llm_client

logger = logging.getLogger(__name__)
router = APIRouter()


def _origin(url: str) -> str | None:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme in ("http", "https") and parts.netloc else None


def _safe_return(return_to: str, request: Request, settings) -> str:
    """Only send people back into Nomi itself (web app or the phone app).

    A full web address is allowed when it's the site the request came from, so
    someone who started on another of this deployment's domains (e.g. the
    *.vercel.app one) lands back where they're signed in, not on PUBLIC_URL.
    """
    if return_to.startswith("/app") or return_to.startswith(("nomi://", "exp://")):
        return return_to
    origin = _origin(return_to)
    if origin and urlsplit(return_to).path.startswith("/app"):
        allowed = {calendar_sync.request_base(request), *settings.cors_origins}
        if request.headers.get("origin") == origin and origin in allowed:
            return return_to
    return "/app/follow-ups"


def _with_status(return_to: str, base: str, value: str) -> str:
    target = f"{base}{return_to}" if return_to.startswith("/") else return_to
    return f"{target}{'&' if '?' in target else '?'}{urlencode({'calendar': value})}"


def _client(client: GoogleCalendar | None) -> GoogleCalendar:
    if client is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google Calendar isn’t set up on this server yet.")
    return client


@router.get("/calendar", response_model=CalendarStatus)
def calendar_status(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
) -> CalendarStatus:
    connection = cal_repo.get_connection(conn, user_id)
    return CalendarStatus(
        available=client is not None,
        state=calendar_sync.connection_state(connection),
        connected=connection is not None and not connection["needs_reauth"],
        email=connection["google_email"] if connection else None,
        push_follow_ups=connection["push_follow_ups"] if connection else True,
    )


@router.post("/calendar/connect", response_model=CalendarConnectResponse)
def calendar_connect(
    body: CalendarConnectRequest,
    request: Request,
    user_id: UUID = Depends(get_current_user_id),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
) -> CalendarConnectResponse:
    google = _client(client)
    settings = get_settings()
    state = crypto.sign_state(settings, user_id, _safe_return(body.return_to, request, settings))
    return CalendarConnectResponse(url=google.auth_url(f"{calendar_sync.public_base(request, settings)}/calendar/callback", state))


@router.get("/calendar/callback", include_in_schema=False)
def calendar_callback(
    request: Request,
    state: str = Query(""),
    code: str | None = Query(None),
    error: str | None = Query(None),
    conn: Connection = Depends(get_db),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
) -> RedirectResponse:
    google = _client(client)
    settings = get_settings()
    base = calendar_sync.public_base(request, settings)
    try:
        user_id, return_to = crypto.verify_state(settings, state)
    except crypto.CryptoError:
        return RedirectResponse(_with_status("/app/follow-ups", base, "expired"))
    if error or not code:
        return RedirectResponse(_with_status(return_to, base, "denied"))
    try:
        refresh, _access, email = google.exchange(code, f"{base}/calendar/callback")
    except CalendarScopeMissing:
        return RedirectResponse(_with_status(return_to, base, "scope"))
    except CalendarError:
        return RedirectResponse(_with_status(return_to, base, "failed"))
    cal_repo.save_connection(conn, user_id, email, crypto.encrypt(settings, refresh))
    return RedirectResponse(_with_status(return_to, base, "connected"))


@router.patch("/calendar", response_model=CalendarStatus)
def calendar_settings(
    body: CalendarSettings,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
) -> CalendarStatus:
    if cal_repo.get_connection(conn, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Google Calendar isn’t connected.")
    cal_repo.set_push(conn, user_id, body.push_follow_ups)
    return calendar_status(conn, user_id, client)


@router.delete("/calendar", status_code=status.HTTP_204_NO_CONTENT)
def calendar_disconnect(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
) -> None:
    connection = cal_repo.get_connection(conn, user_id)
    if connection and client is not None:
        try:
            client.revoke(crypto.decrypt(get_settings(), connection["refresh_token_encrypted"]))
        except crypto.CryptoError:
            pass
    cal_repo.delete_connection(conn, user_id)


@router.get("/calendar/upcoming", response_model=UpcomingResponse)
def calendar_upcoming(
    days: int = Query(7, ge=1, le=31),
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(limit_ai_requests),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
    llm: LLMClient = Depends(get_llm_client),
) -> UpcomingResponse:
    if client is None:
        return UpcomingResponse(connected=False, state="unavailable", events=[])
    try:
        events = calendar_sync.upcoming(conn, user_id, client, get_settings(), llm, datetime.now(timezone.utc), days)
    except CalendarScopeMissing:
        cal_repo.mark_needs_reauth(conn, user_id)
        events = None
    except CalendarError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn’t read your Google Calendar right now.") from exc
    state = calendar_sync.connection_state(cal_repo.get_connection(conn, user_id))
    return UpcomingResponse(connected=events is not None, state=state, events=events or [])
