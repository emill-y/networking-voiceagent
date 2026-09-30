"""Keep Google Calendar and Nomi in step.

Nomi → Calendar: a follow-up with a date becomes an all-day event on that
day. Ticking it done marks the event done; dismissing it or removing the
date deletes the event.

Calendar → Nomi: for each upcoming event, the people worth talking to:
on the invite, named in the event, or related by meaning to what it's about
("Chemistry 1A" → the person whose notes mention chemical engineering).
"""

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import UUID

from collections.abc import Callable

from fastapi import Depends, Request
from psycopg import Connection

from app.core import crypto
from app.core.config import Settings, get_settings
from app.repositories import calendar as cal_repo
from app.repositories import search as search_repo
from app.services.google_calendar import CalendarError, CalendarRevoked, GoogleCalendar
from app.services.llm import LLMClient
from app.services.search import expand_query, match_terms

logger = logging.getLogger(__name__)

# Marks events Nomi created, so they're not suggested back to you.
NOMI_MARK = {"private": {"nomi": "follow-up"}}
MAX_EVENTS = 8
PEOPLE_PER_EVENT = 3
CACHE_SECONDS = 600
_cache: dict[UUID, tuple[float, tuple, list[dict]]] = {}


def get_calendar_client() -> GoogleCalendar | None:
    """FastAPI dependency: None when Google Calendar isn't configured."""
    settings = get_settings()
    if not (settings.google_client_id and settings.google_client_secret):
        return None
    return GoogleCalendar(settings.google_client_id, settings.google_client_secret)


def public_base(request: Request, settings: Settings) -> str:
    """This deployment's public address (behind Vercel, from forwarded headers)."""
    if settings.public_url:
        return settings.public_url
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host.split(',')[0].strip()}"


PushFollowUp = Callable[[Connection, UUID, UUID], None]


def get_calendar_push(
    request: Request, client: GoogleCalendar | None = Depends(get_calendar_client)
) -> PushFollowUp:
    """FastAPI dependency: a function that syncs one follow-up to the user's calendar."""
    settings = get_settings()
    app_url = public_base(request, settings)
    return lambda conn, user_id, follow_up_id: sync_follow_up(conn, user_id, follow_up_id, client, settings, app_url)


def access_token(conn: Connection, user_id: UUID, client: GoogleCalendar, settings: Settings) -> str | None:
    """A fresh access token, or None if the user isn't connected (anymore)."""
    connection = cal_repo.get_connection(conn, user_id)
    if not connection:
        return None
    try:
        return client.access_token(crypto.decrypt(settings, connection["refresh_token_encrypted"]))
    except (CalendarRevoked, crypto.CryptoError):
        # They removed access in Google, or the key changed: forget the connection.
        cal_repo.delete_connection(conn, user_id)
        return None


# ---------- Nomi → Calendar ----------


def event_body(follow_up: dict, app_url: str | None) -> dict:
    day = follow_up["due_at"].date()
    done = follow_up["status"] == "done"
    link = f"\n\nOpen in Nomi: {app_url}/app/people/{follow_up['contact_id']}" if app_url else ""
    return {
        "summary": f"{'✓ ' if done else ''}{follow_up['action']} · {follow_up['contact_name']}",
        "description": f"Follow-up from Nomi with {follow_up['contact_name']}.{link}",
        "start": {"date": day.isoformat()},
        "end": {"date": (day + timedelta(days=1)).isoformat()},
        "transparency": "transparent",  # doesn't block the day as busy
        "extendedProperties": NOMI_MARK,
    }


def sync_follow_up(
    conn: Connection,
    user_id: UUID,
    follow_up_id: UUID,
    client: GoogleCalendar | None,
    settings: Settings,
    app_url: str | None,
) -> None:
    """Create, update or remove the calendar event for one follow-up. Never raises."""
    if client is None:
        return
    connection = cal_repo.get_connection(conn, user_id)
    if not connection or not connection["push_follow_ups"]:
        return
    follow_up = cal_repo.follow_up_for_calendar(conn, user_id, follow_up_id)
    if not follow_up:
        return
    wanted = follow_up["status"] != "dismissed" and follow_up["due_at"] is not None
    event_id = follow_up["calendar_event_id"]
    if not wanted and not event_id:
        return
    token = access_token(conn, user_id, client, settings)
    if not token:
        return
    try:
        if not wanted:
            client.delete_event(token, event_id)
            cal_repo.set_event_id(conn, user_id, follow_up_id, None)
        elif event_id:
            client.patch_event(token, event_id, event_body(follow_up, app_url))
        else:
            new_id = client.insert_event(token, event_body(follow_up, app_url))
            cal_repo.set_event_id(conn, user_id, follow_up_id, new_id)
    except CalendarError as exc:
        # The follow-up is saved either way; the calendar catches up next change.
        logger.warning("Calendar sync failed for a follow-up: %s", exc)


RemoveEvents = Callable[[Connection, UUID, UUID | None], None]


def remove_events(
    conn: Connection, user_id: UUID, client: GoogleCalendar | None, settings: Settings, contact_id: UUID | None = None
) -> None:
    """Before deleting people (or everything), take their follow-ups off the calendar."""
    if client is None or cal_repo.get_connection(conn, user_id) is None:
        return
    ids = cal_repo.event_ids(conn, user_id, contact_id)
    if not ids:
        return
    token = access_token(conn, user_id, client, settings)
    if token:
        for event_id in ids:
            client.delete_event(token, event_id)


def get_remove_events(client: GoogleCalendar | None = Depends(get_calendar_client)) -> RemoveEvents:
    settings = get_settings()
    return lambda conn, user_id, contact_id=None: remove_events(conn, user_id, client, settings, contact_id)


# ---------- Calendar → Nomi ----------


def _when(event: dict) -> tuple[str | None, bool]:
    start = event.get("start", {})
    if "dateTime" in start:
        return start["dateTime"], False
    return start.get("date"), True


def people_for_event(event: dict, people: list[dict], llm: LLMClient) -> list[dict]:
    title = event.get("summary", "")
    text = " ".join([title, event.get("location") or "", (event.get("description") or "")[:300]])
    lowered = text.lower()
    picks: list[tuple[dict, str]] = []

    def add(person: dict, why: str) -> None:
        if all(person["id"] != p["id"] for p, _ in picks):
            picks.append((person, why))

    invited = {a.get("email", "").lower() for a in event.get("attendees", []) if a.get("email")}
    for person in people:
        if person.get("email") and person["email"].lower() in invited:
            add(person, "On the invite")
    for person in people:
        full = person["name"].lower()
        first = full.split()[0] if full.split() else ""
        if full in lowered or (len(first) > 2 and re.search(rf"(?<![a-z]){re.escape(first)}(?![a-z])", lowered)):
            add(person, "Named in the event")
    if len(picks) < PEOPLE_PER_EVENT and title.strip():
        terms = expand_query(f"{title} {event.get('location') or ''}".strip(), llm) or []
        for person, why in match_terms(people, terms):
            add(person, why)
    return [
        {"contact_id": p["id"], "name": p["name"], "why": why}
        for p, why in picks[:PEOPLE_PER_EVENT]
    ]


def upcoming(
    conn: Connection,
    user_id: UUID,
    client: GoogleCalendar,
    settings: Settings,
    llm: LLMClient,
    now: datetime,
    days: int = 7,
) -> list[dict] | None:
    """Upcoming events with suggested people, or None if not connected."""
    token = access_token(conn, user_id, client, settings)
    if not token:
        return None
    raw = client.list_events(token, now, now + timedelta(days=days))
    events = [
        e for e in raw
        if e.get("summary") and e.get("extendedProperties", {}).get("private", {}).get("nomi") != "follow-up"
        and e.get("status") != "cancelled"
    ][:MAX_EVENTS]
    people = search_repo.people_profiles(conn, user_id)

    key = (tuple(e.get("id") for e in events), len(people))
    cached = _cache.get(user_id)
    if cached and cached[1] == key and time.time() - cached[0] < CACHE_SECONDS:
        return cached[2]

    if people:
        with ThreadPoolExecutor(max_workers=4) as pool:
            suggestions = list(pool.map(lambda e: people_for_event(e, people, llm), events))
    else:
        suggestions = [[] for _ in events]

    result = []
    for event, suggested in zip(events, suggestions):
        start, all_day = _when(event)
        result.append({
            "id": event.get("id"),
            "title": event.get("summary"),
            "start": start,
            "all_day": all_day,
            "location": event.get("location"),
            "link": event.get("htmlLink"),
            "people": suggested,
        })
    _cache[user_id] = (time.time(), key, result)
    return result
