"""Real events happening in the world, from free and open sources.

1. Tech conferences: the open-source tech-conferences/conference-data repo
   on GitHub (the data behind confs.tech). Community-maintained JSON, one
   file per topic per year, no key, no cost.
2. Any public iCal feed someone adds: a Luma calendar, a Meetup group, an
   Eventbrite organizer, a university or club calendar. Almost every event
   site offers one ("Subscribe" / "Add to calendar" / ".ics").
3. Their own Google Calendar, when it's connected (events they're already
   going to, like "Chemistry mixer").

Every event comes out in one shape:
    {id, title, start, end, all_day, city, country, online, url,
     source, source_label, topics, description}
"""

import ipaddress
import logging
import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from hashlib import sha1
from urllib.parse import urljoin, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

logger = logging.getLogger(__name__)

# ---------- 1. Open conference data (GitHub) ----------

CONFERENCE_REPO = "https://github.com/tech-conferences/conference-data"
CONFERENCE_RAW = "https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/{year}/{topic}.json"

# Each topic file, and the words someone's notes would use if they're into it.
# ("networking" here is computer networks, so it doesn't list "networking".)
TOPICS: dict[str, list[str]] = {
    "accessibility": ["accessibility", "a11y", "inclusive design", "disability"],
    "android": ["android", "mobile apps", "mobile developer", "kotlin"],
    "api": ["api", "apis", "backend", "platform engineering"],
    "cpp": ["c++", "systems programming", "embedded", "game engine"],
    "css": ["css", "frontend", "web design"],
    "data": ["data", "data science", "machine learning", "ml", "ai", "analytics", "databases"],
    "devops": ["devops", "cloud", "infrastructure", "kubernetes"],
    "dotnet": [".net", "c#"],
    "general": ["software", "software engineering", "developer", "coding", "tech"],
    "graphql": ["graphql"],
    "ios": ["ios", "swift", "iphone apps", "mobile apps"],
    "iot": ["iot", "hardware", "embedded", "robotics", "sensors"],
    "java": ["java", "jvm", "spring"],
    "javascript": ["javascript", "react", "node", "frontend", "web development"],
    "kotlin": ["kotlin"],
    "leadership": ["leadership", "founder", "startup", "cto", "engineering manager", "entrepreneur"],
    "networking": ["network engineering", "telecom", "5g"],
    "opensource": ["open source", "oss"],
    "performance": ["web performance", "performance"],
    "php": ["php", "laravel", "wordpress"],
    "product": ["product", "product management", "product manager", "startup", "founder"],
    "python": ["python", "django", "data science"],
    "rust": ["rust"],
    "security": ["security", "cybersecurity", "privacy", "infosec"],
    "sre": ["sre", "reliability", "infrastructure"],
    "tech-comm": ["technical writing", "documentation"],
    "testing": ["testing", "qa", "test automation"],
    "typescript": ["typescript", "javascript", "frontend"],
    "ux": ["ux", "design", "user research", "product design", "ui"],
}
TOPIC_LABELS = {"cpp": "C++", "dotnet": ".NET", "ios": "iOS", "iot": "IoT", "ux": "UX", "sre": "SRE",
                "api": "APIs", "css": "CSS", "php": "PHP", "opensource": "Open source", "tech-comm": "Tech writing"}

CACHE_SECONDS = 6 * 3600
_conference_cache: dict[int, tuple[float, list[dict]]] = {}
_lock = threading.Lock()


def topic_label(topic: str) -> str:
    return TOPIC_LABELS.get(topic, topic.replace("-", " ").title())


def _event_id(*parts: str) -> str:
    return sha1("|".join(parts).encode()).hexdigest()[:12]


def conferences_from_json(rows: list[dict], topic: str) -> list[dict]:
    events = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("name") or not row.get("startDate"):
            continue
        events.append({
            "id": "c" + _event_id(row.get("url") or row["name"], row["startDate"]),
            "title": row["name"],
            "start": row["startDate"],
            "end": row.get("endDate") or row["startDate"],
            "all_day": True,
            "city": row.get("city") or None,
            "country": row.get("country") or None,
            "online": bool(row.get("online")),
            "url": row.get("url") or None,
            "source": "conferences",
            "source_label": "Tech conferences · open data",
            "topics": [topic],
            "description": "",
        })
    return events


def fetch_conferences(http: httpx.Client, years: list[int]) -> list[dict]:
    """Every listed conference for these years, topics merged. Cached for hours."""
    events: dict[str, dict] = {}
    for year in years:
        with _lock:
            cached = _conference_cache.get(year)
        if cached and time.time() - cached[0] < CACHE_SECONDS:
            rows = cached[1]
        else:
            rows = _fetch_year(http, year)
            if rows:
                with _lock:
                    _conference_cache[year] = (time.time(), rows)
        for event in rows:
            known = events.get(event["id"])
            if known:
                known["topics"] = sorted(set(known["topics"]) | set(event["topics"]))
            else:
                events[event["id"]] = {**event, "topics": list(event["topics"])}
    return list(events.values())


def _fetch_year(http: httpx.Client, year: int) -> list[dict]:
    def one(topic: str) -> list[dict]:
        try:
            response = http.get(CONFERENCE_RAW.format(year=year, topic=topic), timeout=8)
        except httpx.HTTPError:
            return []
        if response.status_code != 200:
            return []  # not every topic has a file every year
        try:
            return conferences_from_json(response.json(), topic)
        except ValueError:
            return []

    with ThreadPoolExecutor(max_workers=8) as pool:
        return [event for rows in pool.map(one, TOPICS) for event in rows]


# ---------- 2. iCal feeds ----------

MAX_FEED_BYTES = 2_000_000
MAX_REDIRECTS = 3


class FeedError(Exception):
    """The link isn't a calendar we can read."""


def normalize_feed_url(url: str) -> str:
    url = url.strip()
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise FeedError("Use the calendar’s https:// or webcal:// link.")
    return urlunsplit(parts)


def _check_public_host(host: str) -> None:
    """Refuse addresses inside a private network (the server's own, or a cloud's metadata service)."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise FeedError("That calendar’s website couldn’t be found.") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise FeedError("That link points somewhere private.")


def fetch_feed_text(http: httpx.Client, url: str, check_host=_check_public_host) -> str:
    url = normalize_feed_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        check_host(urlsplit(url).hostname or "")
        try:
            with http.stream("GET", url, timeout=8, follow_redirects=False,
                             headers={"Accept": "text/calendar, */*"}) as response:
                if response.is_redirect:
                    url = normalize_feed_url(urljoin(url, response.headers.get("location", "")))
                    continue
                if response.status_code != 200:
                    raise FeedError(f"The calendar answered {response.status_code}.")
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_FEED_BYTES:
                        raise FeedError("That calendar is too big to read.")
                    chunks.append(chunk)
                text = b"".join(chunks).decode("utf-8", errors="replace")
        except httpx.HTTPError as exc:
            raise FeedError("Couldn’t reach that calendar.") from exc
        if "BEGIN:VCALENDAR" not in text[:2000]:
            raise FeedError("That link isn’t a calendar feed (.ics).")
        return text
    raise FeedError("That link redirects too many times.")


def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if line[:1] in (" ", "\t") and lines:
            lines[-1] += line[1:]
        elif line:
            lines.append(line)
    return lines


def _unescape(value: str) -> str:
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value)


def _parse_when(value: str, params: dict[str, str]) -> tuple[str, bool] | None:
    """ICS date or date-time → (ISO string, all_day)."""
    value = value.strip()
    try:
        if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
            return datetime.strptime(value[:8], "%Y%m%d").date().isoformat(), True
        if value.endswith("Z"):
            moment = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            return moment.isoformat(), False
        moment = datetime.strptime(value[:15], "%Y%m%dT%H%M%S")
        if "TZID" in params:
            try:
                moment = moment.replace(tzinfo=ZoneInfo(params["TZID"].strip('"')))
            except (ZoneInfoNotFoundError, ValueError):
                pass
        return moment.isoformat(), False
    except ValueError:
        return None


def parse_ics(text: str, feed_label: str, feed_id: str) -> tuple[str | None, list[dict]]:
    """(calendar name, events). Recurring events count once, at their first date."""
    name = None
    events: list[dict] = []
    current: dict | None = None
    for line in _unfold(text):
        key, _, value = line.partition(":")
        prop, *raw_params = key.split(";")
        prop = prop.upper()
        params = dict(p.split("=", 1) for p in raw_params if "=" in p)
        if prop == "BEGIN" and value.upper() == "VEVENT":
            current = {}
        elif prop == "END" and value.upper() == "VEVENT" and current is not None:
            if current.get("title") and current.get("start"):
                events.append(current)
            current = None
        elif current is None:
            if prop == "X-WR-CALNAME" and value.strip():
                name = _unescape(value.strip())
        elif prop == "SUMMARY":
            current["title"] = _unescape(value).strip()
        elif prop in ("DTSTART", "DTEND"):
            parsed = _parse_when(value, params)
            if parsed:
                current["start" if prop == "DTSTART" else "end"] = parsed[0]
                if prop == "DTSTART":
                    current["all_day"] = parsed[1]
        elif prop == "LOCATION":
            current["location"] = _unescape(value).strip()
        elif prop == "URL":
            current["url"] = value.strip()
        elif prop == "DESCRIPTION":
            current["description"] = _unescape(value)[:600]
        elif prop == "UID":
            current["uid"] = value.strip()
        elif prop == "STATUS" and value.strip().upper() == "CANCELLED":
            current["cancelled"] = True

    out = []
    for raw in events:
        if raw.get("cancelled"):
            continue
        description = raw.get("description", "")
        url = raw.get("url") or next(iter(re.findall(r"https://[^\s<>\"]+", description)), None)
        location = raw.get("location") or ""
        online = bool(re.search(r"\b(zoom|online|virtual|google meet|meet\.google)\b", location, re.I))
        out.append({
            "id": "f" + _event_id(feed_id, raw.get("uid") or raw["title"], raw["start"]),
            "title": raw["title"][:200],
            "start": raw["start"],
            "end": raw.get("end"),
            "all_day": raw.get("all_day", False),
            "city": location[:120] or None,
            "country": None,
            "online": online,
            "url": url,
            "source": "feed",
            "source_label": name or feed_label,
            "topics": [],
            "description": description,
        })
    return name, out


# ---------- 3. Google Calendar ----------


def from_google(event: dict) -> dict:
    start = event.get("start", {})
    end = event.get("end", {})
    return {
        "id": "g" + _event_id(event.get("id") or event.get("summary", "")),
        "title": event.get("summary", "")[:200],
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "all_day": "dateTime" not in start,
        "city": event.get("location") or None,
        "country": None,
        "online": False,
        "url": event.get("htmlLink"),
        "source": "calendar",
        "source_label": "On your calendar",
        "topics": [],
        "description": (event.get("description") or "")[:600],
    }


# ---------- Shared ----------


def event_day(event: dict) -> date | None:
    try:
        return date.fromisoformat((event.get("start") or "")[:10])
    except ValueError:
        return None


def in_window(events: list[dict], today: date, days: int) -> list[dict]:
    """Events from today (or still running) through `days` from now, soonest first."""
    last = today + timedelta(days=days)
    kept = []
    for event in events:
        start = event_day(event)
        if start is None:
            continue
        try:
            end = date.fromisoformat((event.get("end") or "")[:10])
        except ValueError:
            end = start
        if max(start, end) >= today and start <= last:
            kept.append(event)
    return sorted(kept, key=lambda e: e["start"])


FEED_CACHE_SECONDS = 1800
_feed_cache: dict[str, tuple[float, str | None, list[dict]]] = {}


class EventSources:
    """Where events come from. A FastAPI dependency, so tests can swap it."""

    def __init__(self, http: httpx.Client | None = None) -> None:
        self._http = http or httpx.Client(timeout=8, headers={"User-Agent": "Nomi/1.0 (+events)"})

    def conferences(self, today: date, days: int) -> list[dict]:
        years = sorted({today.year, (today + timedelta(days=days)).year})
        return fetch_conferences(self._http, years)

    def feed(self, url: str, label: str, feed_id: str) -> tuple[str | None, list[dict]]:
        """(calendar name, events). Raises FeedError."""
        cached = _feed_cache.get(url)
        if cached and time.time() - cached[0] < FEED_CACHE_SECONDS:
            return cached[1], [{**e, "source_label": cached[1] or label} for e in cached[2]]
        name, events = parse_ics(fetch_feed_text(self._http, url), label, feed_id)
        _feed_cache[url] = (time.time(), name, events)
        return name, events


def get_event_sources() -> EventSources:
    return EventSources()
