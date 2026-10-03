"""Go together: real events, and who from your notes to bring.

"Go to the chemistry mixer this weekend with Annie: you're both into chemistry."

Events come from real_events (open conference data, iCal feeds, your Google
Calendar). Each event's words and topics are matched against everyone's
notes; the best candidates go to the model once, which writes the plans.
If the model can't answer, the keyword matches become the plans.
"""

import logging
import re
from dataclasses import dataclass
from datetime import date

from pydantic import BaseModel, ValidationError

from app.services.event_providers import CATEGORIES, distance_km
from app.services.llm import LLMClient, LLMUnavailable
from app.services.real_events import TOPICS, event_day, topic_label
from app.services.search import profile_text, resolve_person

logger = logging.getLogger(__name__)

MAX_CANDIDATES = 24
MAX_PEOPLE_FOR_MODEL = 40
MAX_PLANS = 6
PEOPLE_PER_EVENT = 3

# Words in event titles that say nothing about what the event is about.
STOPWORDS = set("""
the and with for from your this that what when where into about our their them they you
conf conference conferences summit days day meetup meetups mixer event events night social
party week weekly monthly annual edition workshop workshops session sessions talk talks club
happy hour open free join community networking network meet welcome hosted host presents
fall spring summer winter edition series virtual online live intro introduction first second
global international world europe america north south east west new city
""".split())


# ---------- Matching ----------

# What someone's notes say when they're into a category.
CATEGORY_WORDS: dict[str, list[str]] = {
    "music": ["music", "concerts", "live music"],
    "arts": ["art", "arts", "theater", "museums", "comedy"],
    "food": ["food", "cooking", "foodie", "restaurants"],
    "sports": ["sports", "fitness", "running", "basketball", "soccer", "climbing", "yoga"],
    "outdoors": ["outdoors", "hiking", "nature", "camping"],
    "learning": ["workshops", "classes", "learning", "pottery", "ceramics"],
    "networking": ["networking", "startups", "startup", "founder", "career"],
    "tech": ["tech", "software", "engineering", "coding"],
    "community": ["volunteering", "community", "nonprofit"],
    "social": ["nightlife", "parties", "social"],
    "students": ["student", "campus"],
}


def event_terms(event: dict) -> list[str]:
    """The words someone's notes would contain if this event is their thing."""
    terms: list[str] = []
    for topic in event.get("topics", []):
        # Open-data topic keys map to the words people use; providers' genres
        # ("Rock", "Basketball") are words already.
        terms += TOPICS.get(topic, [topic.lower()] if topic.lower() not in STOPWORDS else [])

    words = re.findall(r"[a-z][a-z+#.\-]{2,}", f"{event['title']} {event.get('description', '')[:200]}".lower())
    for word in words:
        word = word.strip(".-")
        if len(word) >= 4 and word not in STOPWORDS:
            terms.append(word)
    return list(dict.fromkeys(terms))[:30]


def category_terms(event: dict) -> list[str]:
    """Broad words for the event's category: a weaker match than its own words."""
    category = event.get("category")
    return CATEGORY_WORDS.get(category, []) if category and category != "other" else []


def _pattern(term: str) -> re.Pattern:
    return re.compile(r"(?<![a-z0-9])" + re.escape(term) + r"(?:s|es)?(?![a-z0-9])")


class Matcher:
    """Each person's notes, lowered once, so hundreds of events stay fast."""

    def __init__(self, people: list[dict]) -> None:
        self.people = people
        self.texts = [profile_text(p, limit=None).lower() for p in people]
        self._by_id = {p["id"]: text for p, text in zip(people, self.texts)}

    def shared_interest(self, person: dict, interests: list[str]) -> str | None:
        """One of my interests that this person's notes also mention."""
        text = self._by_id.get(person["id"], "")
        for interest in interests:
            needle = interest.lower().strip()
            stem = needle[:-1] if needle.endswith("s") and len(needle) > 4 else needle
            if stem and _pattern(stem).search(text):
                return needle
        return None

    def match(self, terms: list[str]) -> list[tuple[dict, str]]:
        patterns = [(t, _pattern(t)) for t in terms]
        scored = []
        for order, (person, text) in enumerate(zip(self.people, self.texts)):
            hits = [t for t, pattern in patterns if pattern.search(text)]
            if hits:
                scored.append((-len(hits), order, person, hits[0]))
        scored.sort(key=lambda row: (row[0], row[1]))
        return [(person, hit) for _, _, person, hit in scored]


def interest_hits(terms: list[str], interests: list[str]) -> list[str]:
    """Which of my interests this event is about ("startups" matches "startup")."""
    hits = []
    for interest in interests:
        needle = interest.lower().strip()
        if not needle:
            continue
        stem = needle[:-1] if needle.endswith("s") and len(needle) > 4 else needle
        if any(stem in term or term in needle for term in terms if len(term) >= 3):
            hits.append(interest)
    return hits


# ---------- Where ----------


def _place(text: str | None) -> tuple[str, str]:
    """("san francisco", "ca") from "San Francisco, CA"."""
    parts = [p.strip().lower() for p in (text or "").split(",") if p.strip()]
    if not parts:
        return "", ""
    return parts[0], parts[-1] if len(parts) > 1 else ""


@dataclass
class Near:
    """Where you are, when the app knows your location (for distances)."""

    lat: float
    lon: float
    radius_km: float = 40.0


def where(event: dict, city: str, near: Near | None = None) -> str:
    """local, nearby, online, travel, or anywhere (when we don't know your city)."""
    if event["source"] in ("calendar", "feed"):
        return "online" if event.get("online") else "local"
    if near and event.get("lat") is not None and event.get("lon") is not None:
        km = distance_km(near.lat, near.lon, event["lat"], event["lon"])
        return "local" if km <= near.radius_km * 0.5 else "nearby" if km <= near.radius_km else "travel"
    mine, my_region = _place(city)
    theirs, their_region = _place(event.get("city"))
    if mine and (mine == theirs or mine in (event.get("city") or "").lower()):
        return "local"
    if my_region and my_region == their_region:
        return "nearby"
    if event.get("online"):
        return "online"
    return "travel" if mine else "anywhere"


WHERE_SCORE = {"local": 6, "nearby": 3, "online": 2, "anywhere": 1, "travel": 0}


# ---------- Planning ----------

PLAN_PROMPT = """You plan real-world outings for someone, with people they already know.
Today is {today}. They live in: {city}. They're into: {interests}.

You get EVENTS (real, upcoming) and PEOPLE (from their private notes). Suggest up to {limit}
plans: one event plus 1 or 2 people who would genuinely enjoy going with them, because of a
specific shared interest. Prefer events near them, sooner events, and strong overlaps (a
startup founder to a founders' event; a chemistry major to a chemistry mixer). Skip weak or
made-up connections; fewer, better plans are fine. Use only the ids given (e1.., p1..).
- shared: the common interest, 1-4 words, lowercase (e.g. "startups", "chemistry")
- why: one short sentence to them, e.g. "You're both into startups, and Eisha is raising a seed round."
Return JSON only: {{"plans": [{{"event": "e1", "people": ["p2"], "shared": "...", "why": "..."}}]}}"""

PLAN_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "plans": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "event": {"type": "string"},
                    "people": {"type": "array", "items": {"type": "string"}},
                    "shared": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["event", "people", "shared", "why"],
            },
        }
    },
    "required": ["plans"],
}


class _Plan(BaseModel):
    event: str
    people: list[str]
    shared: str = ""
    why: str = ""


class _Plans(BaseModel):
    plans: list[_Plan]


def _first(name: str) -> str:
    return name.split()[0] if name.split() else name


def _when_text(event: dict) -> str:
    day = event_day(event)
    return f"{day:%a %b} {day.day}" if day else "soon"


def candidates(events: list[dict], matcher: Matcher, city: str, interests: list[str],
               near: Near | None = None, limit: int = MAX_CANDIDATES) -> list[dict]:
    """Every event scored for you; returns the best, each with its keyword matches."""
    scored = []
    for order, event in enumerate(events):
        terms = event_terms(event)
        place = where(event, city, near)
        category = event.get("category") or "other"
        # "music" as an interest matches every music event, not only ones that say so.
        mine = interest_hits(terms + category_terms(event) + [category, CATEGORIES.get(category, "").lower()], interests)
        # The event's own words first ("chemistry"); its category ("student
        # events") only when nobody matches those.
        hits = matcher.match(terms) or matcher.match(category_terms(event))
        matched = [(person, matcher.shared_interest(person, mine) or term) for person, term in hits[:PEOPLE_PER_EVENT]]
        # Far-away conferences only count when they're really about you.
        if place == "travel" and not (mine and matched):
            continue
        score = WHERE_SCORE[place] + 3 * len(mine) + 2 * min(len(matched), 2)
        score += 2 if event["source"] == "calendar" else 0
        score -= order / 200  # sooner first, as a tie-break (events are sorted by date)
        scored.append((score, order, {**event, "where": place, "mine": mine, "matched": matched}))
    scored.sort(key=lambda row: (-row[0], row[1]))
    return [event for _, _, event in scored[:limit]]


def _why(person: dict, term: str, mine: list[str]) -> tuple[str, str]:
    """(shared, why) for a keyword match."""
    shared = next((m for m in mine if m.lower() in term or term in m.lower()), None)
    if shared:
        return shared.lower(), f"You’re both into {shared.lower()}."
    return term, f"{_first(person['name'])}’s notes mention “{term}”."


def keyword_plans(events: list[dict]) -> list[dict]:
    plans = []
    for event in events:
        if not event["matched"]:
            continue
        person, term = event["matched"][0]
        shared, why = _why(person, term, event["mine"])
        plans.append({"event": event, "people": [person], "shared": shared, "why": why})
        if len(plans) == MAX_PLANS:
            break
    return plans


def model_plans(events: list[dict], people: list[dict], city: str, interests: list[str],
                llm: LLMClient, today: date) -> list[dict] | None:
    """One model call for every plan. None if the model couldn't answer."""
    if not events or not people:
        return []
    # People the keywords found first, then everyone else by recency.
    picked: dict = {}
    for event in events:
        for person, _ in event["matched"]:
            picked.setdefault(person["id"], person)
    for person in people:
        if len(picked) >= MAX_PEOPLE_FOR_MODEL:
            break
        picked.setdefault(person["id"], person)
    refs = {f"p{n}": person for n, person in enumerate(picked.values(), start=1)}
    event_refs = {f"e{n}": event for n, event in enumerate(events, start=1)}

    def describe(event: dict) -> str:
        bits = [event["title"], _when_text(event)]
        if event.get("city"):
            bits.append(event["city"])
        bits.append(event["where"])
        if event.get("category") and event["category"] != "other":
            bits.append(CATEGORIES[event["category"]])
        if event.get("topics"):
            bits.append("topics: " + ", ".join(topic_label(t) for t in event["topics"]))
        if event["source"] == "calendar":
            bits.append("already on their calendar")
        if event.get("description"):
            bits.append(" ".join(event["description"].split())[:160])
        return " | ".join(bits)

    listing = "\n".join(f"{ref}: {describe(e)}" for ref, e in event_refs.items())
    roster = "\n".join(f"{ref}: {profile_text(p, limit=260)}" for ref, p in refs.items())
    system = PLAN_PROMPT.format(
        today=today.isoformat(), city=city or "unknown", limit=MAX_PLANS,
        interests=", ".join(interests) if interests else "not given (use what fits their people)",
    )
    try:
        raw = llm.chat_json(system, f"EVENTS:\n{listing}\n\nPEOPLE:\n{roster}", PLAN_JSON_SCHEMA)
        answer = _Plans.model_validate_json(raw)
    except (LLMUnavailable, ValidationError) as exc:
        logger.warning("Planning failed (%s); using keyword matches", type(exc).__name__)
        return None

    plans: list[dict] = []
    used_events: set[str] = set()
    for item in answer.plans:
        event = event_refs.get(item.event.strip().lower())
        if event is None or event["id"] in used_events:
            continue
        chosen = []
        for label in item.people[:2]:
            person = resolve_person(label, refs)
            if person and all(person["id"] != p["id"] for p in chosen):
                chosen.append(person)
        if not chosen:
            continue
        used_events.add(event["id"])
        plans.append({
            "event": event,
            "people": chosen,
            "shared": " ".join(item.shared.split())[:40].lower() or "",
            "why": " ".join(item.why.split())[:200],
        })
        if len(plans) == MAX_PLANS:
            break
    return plans


def plan(events: list[dict], people: list[dict], city: str, interests: list[str],
         llm: LLMClient, today: date, near: Near | None = None) -> tuple[list[dict], list[dict]]:
    """(plans, events worth showing). Each shown event carries its keyword matches."""
    matcher = Matcher(people)
    shortlist = candidates(events, matcher, city, interests, near, limit=60)
    plans = model_plans(shortlist[:MAX_CANDIDATES], people, city, interests, llm, today)
    if not plans:
        plans = keyword_plans(shortlist)
    return plans, shortlist
