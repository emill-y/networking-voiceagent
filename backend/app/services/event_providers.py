"""Where Plan Events finds real events: several providers, one event shape.

Providers (each optional except the open data):
- Open conference data (tech-conferences/conference-data on GitHub): free, no key.
- Ticketmaster Discovery API (free key, TICKETMASTER_API_KEY): concerts,
  sports, arts & theatre, comedy, family events.
- SeatGeek Platform API (free client id, SEATGEEK_CLIENT_ID): concerts,
  sports, theater, comedy.
- Public iCal feeds a user follows (Luma, Meetup, a school or club calendar):
  workshops, mixers, student and community events. See real_events.parse_ics.

All use their official, documented APIs within their free tiers. Events
from every provider are classified into one small set of categories and
de-duplicated (the same concert listed twice shows once).

Event shape:
    {id, title, start, end, all_day, city, country, online, url, venue, lat,
     lon, image_url, category, source, source_label, topics, description}
"""

import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Protocol

import httpx

from app.services.real_events import _event_id, fetch_conferences

logger = logging.getLogger(__name__)

CATEGORIES: dict[str, str] = {
    "music": "Music",
    "arts": "Arts & culture",
    "food": "Food & drink",
    "sports": "Sports & fitness",
    "outdoors": "Outdoors",
    "learning": "Classes & workshops",
    "networking": "Networking & career",
    "tech": "Tech",
    "community": "Community & volunteering",
    "social": "Nightlife & social",
    "students": "Student events",
    "other": "Other",
}

# Words that place an event in a category, checked in this order (first wins).
KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("students", ("student", "campus", "undergrad", "freshman", "club fair", "career fair", "university", "college")),
    ("networking", ("networking", "mixer", "founder", "startup", "career", "recruiting", "professional", "meetup",
                    "pitch", "investor", "entrepreneur", "leadership", "tech week")),
    ("learning", ("workshop", "class", "course", "lesson", "seminar", "lecture", "bootcamp", "training", "pottery",
                  "ceramics", "painting class", "cooking class", "masterclass", "webinar")),
    ("tech", ("hackathon", "developer", "engineering", "ai ", " ai", "machine learning", "software", "devops",
              "javascript", "python", "data", "conference")),
    ("music", ("concert", "music", "band", "dj", "festival", "jazz", "orchestra", "symphony", "live music", "tour")),
    ("arts", ("art", "gallery", "museum", "theatre", "theater", "film", "comedy", "dance", "exhibit", "poetry", "opera")),
    ("food", ("food", "dinner", "brunch", "tasting", "wine", "beer", "coffee", "farmers market", "supper", "cook")),
    ("sports", ("game", "match", "run", "race", "marathon", "yoga", "fitness", "climbing", "basketball", "soccer",
                "football", "baseball", "tennis", "cycling", "5k")),
    ("outdoors", ("hike", "hiking", "outdoor", "park", "beach", "trail", "camping", "garden", "kayak")),
    ("community", ("volunteer", "community", "charity", "fundraiser", "cleanup", "nonprofit", "family", "library")),
    ("social", ("party", "night", "social", "happy hour", "drinks", "trivia", "karaoke", "club")),
]


def classify(title: str, description: str = "", hint: str | None = None) -> str:
    """One category for an event. A provider's own classification wins."""
    if hint in CATEGORIES:
        return hint  # type: ignore[return-value]
    text = f" {title} {description[:300]} ".lower()
    for category, words in KEYWORDS:
        if any(word in text for word in words):
            return category
    return "other"


@dataclass
class EventQuery:
    start: date
    end: date
    city: str = ""
    lat: float | None = None
    lon: float | None = None
    radius_km: float = 40.0
    categories: list[str] = field(default_factory=list)


class Provider(Protocol):
    name: str

    def fetch(self, query: EventQuery) -> list[dict]: ...


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _city_name(city: str) -> str:
    return city.split(",")[0].strip()


# ---------- Open conference data ----------

LEADERSHIP_TOPICS = {"leadership", "product"}


class ConferenceProvider:
    name = "conferences"

    def __init__(self, http: httpx.Client) -> None:
        self._http = http

    def fetch(self, query: EventQuery) -> list[dict]:
        years = sorted({query.start.year, query.end.year})
        events = fetch_conferences(self._http, years)
        for event in events:
            event["category"] = "networking" if set(event["topics"]) & LEADERSHIP_TOPICS else "tech"
            event.setdefault("venue", None)
            event.setdefault("lat", None)
            event.setdefault("lon", None)
            event.setdefault("image_url", None)
            event["source_label"] = "Conference"
        return events


# ---------- Ticketmaster ----------

TICKETMASTER_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
TICKETMASTER_SEGMENTS = {"Music": "music", "Sports": "sports", "Arts & Theatre": "arts", "Film": "arts",
                         "Miscellaneous": None}
TICKETMASTER_GENRES = {"Comedy": "arts", "Family": "community", "Fairs & Festivals": "community"}


def _best_image(images: list[dict]) -> str | None:
    wide = [i for i in images or [] if i.get("ratio") == "16_9" and (i.get("width") or 0) >= 500]
    pick = min(wide, key=lambda i: i.get("width") or 0) if wide else (images or [None])[0]
    return pick.get("url") if pick else None


class TicketmasterProvider:
    name = "ticketmaster"

    def __init__(self, api_key: str, http: httpx.Client) -> None:
        self._key = api_key
        self._http = http

    def fetch(self, query: EventQuery) -> list[dict]:
        params = {
            "apikey": self._key,
            "size": "100",
            "sort": "date,asc",
            "startDateTime": datetime.combine(query.start, time.min, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "endDateTime": datetime.combine(query.end, time.max, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if query.lat is not None and query.lon is not None:
            params.update({"latlong": f"{query.lat:.4f},{query.lon:.4f}", "radius": str(round(query.radius_km)),
                           "unit": "km"})
        elif query.city:
            params["city"] = _city_name(query.city)
        else:
            return []  # nationwide listings aren't useful
        response = self._http.get(TICKETMASTER_URL, params=params, timeout=8)
        response.raise_for_status()
        return [e for e in (self._event(raw) for raw in response.json().get("_embedded", {}).get("events", [])) if e]

    @staticmethod
    def _event(raw: dict) -> dict | None:
        start = raw.get("dates", {}).get("start", {})
        day = start.get("localDate")
        if not raw.get("name") or not day:
            return None
        local_time = start.get("localTime")
        venue = (raw.get("_embedded", {}).get("venues") or [{}])[0]
        cls = (raw.get("classifications") or [{}])[0]
        segment = cls.get("segment", {}).get("name")
        genre = cls.get("genre", {}).get("name")
        hint = TICKETMASTER_GENRES.get(genre) or TICKETMASTER_SEGMENTS.get(segment)
        location = venue.get("location") or {}
        city = venue.get("city", {}).get("name")
        state = venue.get("state", {}).get("stateCode")
        return {
            "id": "t" + _event_id(raw.get("id") or raw["name"], day),
            "title": raw["name"][:200],
            "start": f"{day}T{local_time}" if local_time else day,
            "end": None,
            "all_day": not local_time,
            "city": ", ".join(p for p in (city, state) if p) or None,
            "country": venue.get("country", {}).get("countryCode"),
            "online": False,
            "url": raw.get("url"),
            "venue": venue.get("name"),
            "lat": _float(location.get("latitude")),
            "lon": _float(location.get("longitude")),
            "image_url": _best_image(raw.get("images", [])),
            "category": classify(raw["name"], genre or "", hint),
            "source": "ticketmaster",
            "source_label": "Tickets",
            "topics": [t for t in (genre, segment) if t and t != "Undefined"],
            "description": "",
        }


# ---------- SeatGeek ----------

SEATGEEK_URL = "https://api.seatgeek.com/2/events"
SEATGEEK_TYPES = {"concert": "music", "music_festival": "music", "theater": "arts", "comedy": "arts",
                  "broadway_tickets_national": "arts", "classical": "music", "family": "community"}


class SeatGeekProvider:
    name = "seatgeek"

    def __init__(self, client_id: str, http: httpx.Client) -> None:
        self._id = client_id
        self._http = http

    def fetch(self, query: EventQuery) -> list[dict]:
        params = {
            "client_id": self._id,
            "per_page": "100",
            "sort": "datetime_local.asc",
            "datetime_local.gte": query.start.isoformat(),
            "datetime_local.lte": (query.end + timedelta(days=1)).isoformat(),
        }
        if query.lat is not None and query.lon is not None:
            params.update({"lat": f"{query.lat:.4f}", "lon": f"{query.lon:.4f}",
                           "range": f"{max(1, round(query.radius_km / 1.609))}mi"})
        elif query.city:
            params["venue.city"] = _city_name(query.city)
        else:
            return []
        response = self._http.get(SEATGEEK_URL, params=params, timeout=8)
        response.raise_for_status()
        return [e for e in (self._event(raw) for raw in response.json().get("events", [])) if e]

    @staticmethod
    def _event(raw: dict) -> dict | None:
        when = raw.get("datetime_local")
        if not raw.get("title") or not when:
            return None
        venue = raw.get("venue") or {}
        location = venue.get("location") or {}
        kind = raw.get("type") or ""
        hint = SEATGEEK_TYPES.get(kind) or ("sports" if kind.startswith(("mlb", "nba", "nfl", "nhl", "mls", "ncaa", "sports")) else None)
        performer = (raw.get("performers") or [{}])[0]
        return {
            "id": "s" + _event_id(str(raw.get("id") or raw["title"]), when[:10]),
            "title": raw["title"][:200],
            "start": when[:19],
            "end": None,
            "all_day": bool(raw.get("date_tbd") or raw.get("time_tbd")),
            "city": ", ".join(p for p in (venue.get("city"), venue.get("state")) if p) or None,
            "country": venue.get("country"),
            "online": False,
            "url": raw.get("url"),
            "venue": venue.get("name"),
            "lat": _float(location.get("lat")),
            "lon": _float(location.get("lon")),
            "image_url": performer.get("image"),
            "category": classify(raw["title"], kind, hint),
            "source": "seatgeek",
            "source_label": "Tickets",
            "topics": [kind.replace("_", " ")] if kind else [],
            "description": "",
        }


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------- Together ----------


def _norm_title(title: str) -> str:
    title = re.sub(r"\(.*?\)|[^a-z0-9 ]", " ", title.lower())
    return " ".join(w for w in title.split() if w not in {"the", "a", "an", "live", "tickets"})[:60]


def dedupe(events: list[dict]) -> list[dict]:
    """The same event from two providers shows once (the one with more detail wins)."""
    best: dict[tuple, dict] = {}
    for event in events:
        key = (_norm_title(event["title"]), (event.get("start") or "")[:10], _norm_title(event.get("venue") or event.get("city") or ""))
        known = best.get(key)
        score = sum(1 for k in ("url", "venue", "lat", "image_url") if event.get(k))
        if known is None or score > sum(1 for k in ("url", "venue", "lat", "image_url") if known.get(k)):
            best[key] = event
    return list(best.values())


def discover(providers: list[Provider], query: EventQuery) -> tuple[list[dict], list[str]]:
    """(events from every provider that answered, names of providers that failed)."""
    failed: list[str] = []

    def run(provider: Provider) -> list[dict]:
        try:
            return provider.fetch(query)
        except Exception as exc:  # noqa: BLE001 - one provider down never hides the others
            logger.warning("Event provider %s failed: %s", provider.name, exc)
            failed.append(provider.name)
            return []

    with ThreadPoolExecutor(max_workers=max(1, len(providers))) as pool:
        events = [e for batch in pool.map(run, providers) for e in batch]
    return dedupe(events), failed
