"""Go together: real upcoming events, and who from your notes to bring.

    GET    /plans               plans + events near you (city, interests, days)
    GET    /event-feeds         your added calendar feeds
    POST   /event-feeds         add one (an iCal link); checked by reading it
    DELETE /event-feeds/{id}    remove one
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.config import get_settings
from app.core.db import get_db
from app.core.rate_limit import limit_ai_requests
from app.repositories import event_feeds as feeds_repo
from app.repositories import search as search_repo
from app.schemas.plans import EventFeed, EventFeedAdded, EventFeedRequest, PlansResponse
from app.services import calendar_sync, plans as planner
from app.services.google_calendar import CalendarError, GoogleCalendar
from app.services.llm import LLMClient, get_llm_client
from app.services.real_events import (
    CONFERENCE_REPO,
    EventSources,
    FeedError,
    from_google,
    get_event_sources,
    in_window,
    normalize_feed_url,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FEEDS = 10
CACHE_SECONDS = 600
_cache: dict[UUID, tuple[float, tuple, PlansResponse]] = {}


def _calendar_events(conn: Connection, user_id: UUID, client: GoogleCalendar | None, now: datetime, days: int) -> list[dict] | None:
    """Your Google Calendar's events (not the ones Nomi put there), or None if not connected."""
    if client is None:
        return None
    token = calendar_sync.access_token(conn, user_id, client, get_settings())
    if not token:
        return None
    try:
        raw = client.list_events(token, now, now + timedelta(days=days), limit=50)
    except CalendarError:
        return []
    return [
        from_google(e) for e in raw
        if e.get("summary") and e.get("status") != "cancelled"
        and e.get("extendedProperties", {}).get("private", {}).get("nomi") != "follow-up"
    ]


def _person(person: dict, why: str | None = None) -> dict:
    return {"contact_id": person["id"], "name": person["name"], "why": why}


def _event_out(event: dict) -> dict:
    return {
        **{k: event.get(k) for k in ("id", "title", "start", "end", "all_day", "city", "country",
                                     "online", "url", "source", "source_label", "topics")},
        "where": event["where"],
        "people": [_person(p, f"Notes mention “{term}”") for p, term in event["matched"]],
    }


@router.get("/plans", response_model=PlansResponse)
def get_plans(
    city: str = Query("", max_length=80),
    interests: str = Query("", max_length=300),
    days: int = Query(60, ge=7, le=120),
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(limit_ai_requests),
    llm: LLMClient = Depends(get_llm_client),
    sources: EventSources = Depends(get_event_sources),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
) -> PlansResponse:
    now = datetime.now(timezone.utc)
    today = now.date()
    wanted = [i.strip() for i in interests.split(",") if i.strip()][:12]
    people = search_repo.people_profiles(conn, user_id)
    feeds = feeds_repo.list_feeds(conn, user_id)

    key = (city.strip().lower(), tuple(wanted), days, len(people),
           max((str(p["last_interaction_at"]) for p in people), default=""), tuple(f["id"] for f in feeds))
    cached = _cache.get(user_id)
    if cached and cached[1] == key and time.time() - cached[0] < CACHE_SECONDS:
        return cached[2]

    # Every source at once; one being down never hides the others.
    with ThreadPoolExecutor(max_workers=6) as pool:
        conference_job = pool.submit(sources.conferences, today, days)
        feed_jobs = [(f, pool.submit(sources.feed, f["url"], f["label"], str(f["id"]))) for f in feeds]
        calendar = _calendar_events(conn, user_id, client, now, min(days, 45))
        try:
            conferences = conference_job.result()
        except Exception:  # noqa: BLE001 - open data being down shouldn't break the page
            logger.exception("Couldn't load the open conference data")
            conferences = []
        feed_events: list[tuple[dict, list[dict]]] = []
        for feed, job in feed_jobs:
            try:
                feed_events.append((feed, job.result()[1]))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Couldn't read an event feed: %s", exc)
                feed_events.append((feed, []))

    conferences = in_window(conferences, today, days)
    events = conferences + [e for _, es in feed_events for e in in_window(es, today, days)]
    if calendar:
        events += in_window(calendar, today, days)
    events.sort(key=lambda e: e["start"])

    plans, shortlist = planner.plan(events, people, city.strip(), wanted, llm, today)

    source_list = [{"label": "Tech conferences (open data)", "kind": "conferences", "url": CONFERENCE_REPO,
                    "events": len(conferences)}]
    source_list += [{"label": f["label"], "kind": "feed", "url": f["url"], "events": len(in_window(es, today, days))}
                    for f, es in feed_events]
    if calendar is not None:
        source_list.append({"label": "Your Google Calendar", "kind": "calendar", "url": None,
                            "events": len(in_window(calendar, today, days))})

    response = PlansResponse.model_validate({
        "plans": [
            {"event": _event_out(p["event"]), "people": [_person(person) for person in p["people"]],
             "shared": p["shared"], "why": p["why"]}
            for p in plans
        ],
        "events": [_event_out(e) for e in shortlist],
        "sources": source_list,
    })
    _cache[user_id] = (time.time(), key, response)
    return response


@router.get("/event-feeds", response_model=list[EventFeed])
def list_event_feeds(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
) -> list[dict]:
    return feeds_repo.list_feeds(conn, user_id)


@router.post("/event-feeds", response_model=EventFeedAdded, status_code=status.HTTP_201_CREATED)
def add_event_feed(
    body: EventFeedRequest,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(limit_ai_requests),
    sources: EventSources = Depends(get_event_sources),
) -> dict:
    try:
        url = normalize_feed_url(body.url)
    except FeedError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if len(feeds_repo.list_feeds(conn, user_id)) >= MAX_FEEDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can add up to {MAX_FEEDS} calendars.")
    host = urlsplit(url).hostname or "Calendar"
    try:
        name, events = sources.feed(url, host, url)
    except FeedError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    feed = feeds_repo.add_feed(conn, user_id, url, (name or host)[:80])
    if feed is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You’ve already added that calendar.")
    _cache.pop(user_id, None)
    today = datetime.now(timezone.utc).date()
    return {"feed": feed, "upcoming": len(in_window(events, today, 60))}


@router.delete("/event-feeds/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_event_feed(
    feed_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
) -> Response:
    if not feeds_repo.delete_feed(conn, user_id, feed_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That calendar isn’t in your list.")
    _cache.pop(user_id, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
