"""Plan Events: real upcoming events near you, and who from your notes to bring.

    GET    /plans               plans + events near you (city or location, dates, categories, interests)
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
from app.core.db import get_db
from app.core.rate_limit import limit_ai_requests
from app.repositories import event_feeds as feeds_repo
from app.repositories import search as search_repo
from app.schemas.plans import EventFeed, EventFeedAdded, EventFeedRequest, PlansResponse
from app.services import plans as planner
from app.services.event_providers import CATEGORIES, EventQuery, dedupe
from app.services.llm import LLMClient, get_llm_client
from app.services.real_events import EventSources, FeedError, get_event_sources, in_window, normalize_feed_url

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FEEDS = 10
CACHE_SECONDS = 600
_cache: dict[UUID, tuple[float, tuple, PlansResponse]] = {}


def _person(person: dict, why: str | None = None) -> dict:
    return {"contact_id": person["id"], "name": person["name"], "why": why}


def _event_out(event: dict) -> dict:
    return {
        **{k: event.get(k) for k in ("id", "title", "start", "end", "all_day", "city", "country", "online",
                                     "url", "venue", "image_url", "source", "source_label", "topics")},
        "category": event.get("category") or "other",
        "where": event["where"],
        "people": [_person(p, f"Notes mention “{term}”") for p, term in event["matched"]],
    }


@router.get("/plans", response_model=PlansResponse)
def get_plans(
    city: str = Query("", max_length=80),
    interests: str = Query("", max_length=300),
    days: int = Query(30, ge=1, le=120),
    categories: str = Query("", max_length=200),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    radius_km: float = Query(40, ge=2, le=300),
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(limit_ai_requests),
    llm: LLMClient = Depends(get_llm_client),
    sources: EventSources = Depends(get_event_sources),
) -> PlansResponse:
    now = datetime.now(timezone.utc)
    today = now.date()
    wanted = [i.strip() for i in interests.split(",") if i.strip()][:12]
    picked = [c for c in (x.strip() for x in categories.split(",")) if c in CATEGORIES]
    near = planner.Near(lat, lon, radius_km) if lat is not None and lon is not None else None
    people = search_repo.people_profiles(conn, user_id)
    feeds = feeds_repo.list_feeds(conn, user_id)

    key = (city.strip().lower(), tuple(wanted), days, tuple(picked), lat and round(lat, 2), lon and round(lon, 2),
           radius_km, len(people), max((str(p["last_interaction_at"]) for p in people), default=""),
           tuple(f["id"] for f in feeds))
    cached = _cache.get(user_id)
    if cached and cached[1] == key and time.time() - cached[0] < CACHE_SECONDS:
        return cached[2]

    query = EventQuery(start=today, end=today + timedelta(days=days), city=city.strip(), lat=lat, lon=lon,
                       radius_km=radius_km)
    # Every source at once; one being down never hides the others.
    with ThreadPoolExecutor(max_workers=6) as pool:
        discover_job = pool.submit(sources.discover, query)
        feed_jobs = [(f, pool.submit(sources.feed, f["url"], f["label"], str(f["id"]))) for f in feeds]
        try:
            found, _failed = discover_job.result()
        except Exception:  # noqa: BLE001 - providers being down shouldn't break the page
            logger.exception("Event discovery failed")
            found = []
        feed_events: list[tuple[dict, list[dict]]] = []
        for feed, job in feed_jobs:
            try:
                feed_events.append((feed, job.result()[1]))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Couldn't read an event feed: %s", exc)
                feed_events.append((feed, []))

    events = dedupe(in_window(found, today, days) + [e for _, es in feed_events for e in in_window(es, today, days)])
    events.sort(key=lambda e: e["start"])

    # Everything worth showing (for category counts), then only the picked categories.
    matcher = planner.Matcher(people)
    relevant = planner.candidates(events, matcher, city.strip(), wanted, near, limit=10_000)
    counts: dict[str, int] = {}
    for event in relevant:
        counts[event["category"]] = counts.get(event["category"], 0) + 1
    in_view = [e for e in events if not picked or (e.get("category") or "other") in picked]
    plans, shortlist = planner.plan(in_view, people, city.strip(), wanted, llm, today, near)

    response = PlansResponse.model_validate({
        "plans": [
            {"event": _event_out(p["event"]), "people": [_person(person) for person in p["people"]],
             "shared": p["shared"], "why": p["why"]}
            for p in plans
        ],
        "events": [_event_out(e) for e in shortlist],
        "categories": [{"key": k, "label": CATEGORIES[k], "count": counts[k]}
                       for k in CATEGORIES if counts.get(k)],
        "sources": [{"label": f["label"], "kind": "feed", "url": f["url"], "events": len(in_window(es, today, days))}
                    for f, es in feed_events],
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
