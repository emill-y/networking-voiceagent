"""Conversational search.

Questions are answered by meaning first:

    "Who should I start a company with for chemistry?"
        -> the model reads a compact profile of each person (only the user's own notes)
        -> picks who fits, with a one-line reason grounded in those notes
        -> ids are checked against the user's own people before anything is returned

If the model is unavailable or answers with junk, we fall back to structured
filters (LLM -> SearchFilters -> fixed SQL), then to plain keywords, so search
always works. Exact matches (names, companies) are always listed first.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError
from psycopg import Connection

from app.repositories import contacts as contacts_repo
from app.repositories import search as search_repo
from app.schemas.contacts import ContactSummary
from app.schemas.search import SEARCH_FILTERS_JSON_SCHEMA, SearchFilters, SearchResponse, SearchResult
from app.services.llm import LLMClient, LLMUnavailable
from app.services.memory import sentence_for_list

logger = logging.getLogger(__name__)

STOPWORDS = {
    "a", "an", "and", "at", "did", "do", "does", "for", "from", "i", "in", "is", "know",
    "me", "met", "my", "of", "on", "someone", "that", "the", "to", "was", "who", "whom",
    "with", "working", "works", "people", "person", "anyone", "somebody", "what", "which",
}

SYSTEM_PROMPT = """You turn a question about the user's own network into search filters.
Today is {today}. Return JSON only.

- company/role/school/location: only if the question names one ("at Google" -> company "Google").
- event: where they met, if named ("at Cal Hacks" -> "Cal Hacks").
- metAfter/metBefore: dates (YYYY-MM-DD) for time phrases ("last two weeks" -> metAfter {two_weeks_ago}).
- hasOpenFollowUp: true for questions about follow-ups, promises or reaching out.
- keywords: topic words to match anywhere, e.g. "robotics", "investor", "designer".
  Use singular, lowercase words. Never include filler like "who", "met", "people".
- Leave anything not mentioned as null (or [] for keywords)."""


def keyword_filters(query: str) -> SearchFilters:
    words = [w for w in re.findall(r"[a-z0-9][a-z0-9+#.-]*", query.lower()) if w not in STOPWORDS]
    return SearchFilters(keywords=list(dict.fromkeys(words))[:8])


def _is_simple(query: str) -> bool:
    """One or two plain words ("Jason", "robotics") don't need the LLM."""
    return len(query.split()) <= 2 and "?" not in query


def interpret(query: str, llm: LLMClient, today: date) -> tuple[SearchFilters, bool]:
    if _is_simple(query):
        return keyword_filters(query), False
    system = SYSTEM_PROMPT.format(today=today.isoformat(), two_weeks_ago=(today - timedelta(days=14)).isoformat())
    try:
        raw = llm.chat_json(system, query, SEARCH_FILTERS_JSON_SCHEMA)
        filters = SearchFilters.model_validate_json(raw)
    except (LLMUnavailable, ValidationError) as exc:
        logger.warning("Search interpretation failed (%s); using keywords", type(exc).__name__)
        return keyword_filters(query), False
    if filters == SearchFilters():
        return keyword_filters(query), False
    return filters, True


def _contains(haystack: str | None, needle: str) -> bool:
    return bool(haystack) and needle.lower() in haystack.lower()


def explain(conn: Connection, user_id: UUID, contact_id: UUID, filters: SearchFilters) -> list[str]:
    """Plain-language reasons this person matched, from stored evidence."""
    contact = contacts_repo.get_contact(conn, user_id, contact_id) or {}
    moments = contacts_repo.list_interactions(conn, user_id, contact_id)
    follow_ups = contacts_repo.list_follow_ups(conn, user_id, status="open", contact_id=contact_id)
    reasons: list[str] = []

    def add(reason: str) -> None:
        if reason not in reasons:
            reasons.append(reason)

    if filters.company and contact.get("company"):
        add(f"Works at {contact['company']}")
    if filters.role and contact.get("role"):
        add(contact["role"])
    if filters.school and contact.get("school"):
        add(f"At {contact['school']}")
    if filters.location and contact.get("location"):
        add(f"Based in {contact['location']}")
    if filters.event or filters.met_after or filters.met_before:
        for moment in moments:
            if filters.event and not _contains(moment["event"], filters.event):
                continue
            moment_date = moment["interaction_date"]
            when = f"{moment_date:%b} {moment_date.day}"
            add(f"Met at {moment['event']} · {when}" if moment["event"] else f"Talked {when}")
            break
    if filters.has_open_follow_up and follow_ups:
        add(f"You planned to: {follow_ups[0]['action']}")

    for keyword in filters.keywords:
        stem = keyword.lower().rstrip("s") or keyword.lower()
        if _contains(contact.get("name"), stem):
            continue  # a name match needs no explanation
        found = False
        for field, label in (("company", "Works at"), ("role", ""), ("school", "At")):
            if _contains(contact.get(field), stem):
                add(f"{label} {contact[field]}".strip())
                found = True
        for moment in moments:
            for field in ("projects", "needs", "topics_discussed", "interests", "notes"):
                matching = [item for item in moment[field] if _contains(item, stem)]
                if matching:
                    add(sentence_for_list(field, matching))
                    found = True
            if found:
                break
        if not found:
            for follow_up in follow_ups:
                if _contains(follow_up["action"], stem):
                    add(f"You planned to: {follow_up['action']}")
    return reasons[:3]


def run_search(conn: Connection, user_id: UUID, filters: SearchFilters) -> list[SearchResult]:
    if filters == SearchFilters():
        return []  # nothing to search for; don't return everyone
    rows = search_repo.search_contacts(conn, user_id, filters)
    return [
        SearchResult(
            contact=ContactSummary.model_validate(row),
            reasons=explain(conn, user_id, row["id"], filters),
        )
        for row in rows
    ]


# ---------------------------------------------------------------- by meaning

# How many people the model reads per question. Keeps each request small
# enough for free-tier token limits; the closest word matches go first.
RANK_CANDIDATES = 60
RANK_RESULTS = 8
PROFILE_CHARS = 700

RANK_PROMPT = """You are the search engine for someone's own private notes about people they've met.
Every profile is written by the user; "your note" is their own words. Today is {today}.
You match the search against what the notes say. You are not judging anyone yourself.

Return the people whose notes are relevant to the search, most relevant first (at most {limit}).
- Match by meaning, never by exact words. Paraphrases, synonyms, opposites that are
  negated, and implications all count:
  - "bad guy" matches "not a good guy", "rude", "shady", "didn't trust him"
  - "startup" matches a founder or someone building a company
  - "chemistry" matches chemical engineering, materials or biotech
  - "STEM" matches science, engineering, math or computing
- The user's own impressions and opinions of people (good or bad) are part of their
  notes. Matching on them is expected; don't skip someone because the question is
  about character or a judgment.
- For "who should I ..." questions, pick people whose projects, skills, needs or
  interests make them a good fit.
- Respect dates and places in the question (e.g. "last month", "at Cal Hacks").
- Only include people the notes support. If nobody fits, return an empty list.
- "why": one short sentence using only facts from their profile. Never invent facts.
- "person" is the label before the colon, e.g. "p3".
Return JSON only, like {{"matches": [{{"person": "p3", "why": "Building a robotics startup."}}]}}."""

RANK_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "person": {"type": "string", "description": "The person's label exactly as given, e.g. \"p3\"."},
                    "why": {"type": "string"},
                },
                "required": ["person", "why"],
            },
        }
    },
    "required": ["matches"],
}


class _Match(BaseModel):
    person: str
    why: str = Field(min_length=1)


class _Ranking(BaseModel):
    matches: list[_Match]  # required: an answer without it is junk, not "nobody"


def _words(text: str) -> set[str]:
    return {
        w.rstrip("s") for w in re.findall(r"[a-z0-9][a-z0-9+#-]*", text.lower())
        if w not in STOPWORDS and len(w) > 2
    }


def profile_text(person: dict, limit: int | None = PROFILE_CHARS) -> str:
    """One compact line per person, e.g. `Jason Chen | Founder | UC Berkeley | building: ...`."""
    parts = [person["name"]]
    for field in ("role", "company", "school", "major", "location", "summary"):
        if person.get(field):
            parts.append(person[field])
    labels = (("projects", "building"), ("needs", "looking for"), ("topics", "talked about"),
              ("interests", "into"), ("notes", "notes"))
    for label_field, label in labels:
        items = [item for m in person["moments"] for item in (m.get(label_field) or [])]
        if items:
            parts.append(f"{label}: " + "; ".join(dict.fromkeys(items)))
    met = [f"{m['event'] or 'talked'} {m['date']}" for m in person["moments"][:3]]
    if met:
        parts.append("met: " + ", ".join(met))
    if person["open_follow_ups"]:
        parts.append("you planned: " + "; ".join(person["open_follow_ups"]))
    # The user's own words from their notes: search works on what was said,
    # even when a detail didn't make it into a field.
    said = [m["said"] for m in person["moments"][:2] if m.get("said")]
    if said:
        parts.append("your note: " + " / ".join(" ".join(s.split()) for s in said))
    line = " | ".join(parts)
    return line if limit is None or len(line) <= limit else line[: limit - 1] + "…"


def _candidates(people: list[dict], query: str) -> list[tuple[dict, str]]:
    """The people most worth showing the model: word overlap first, then recency."""
    wanted = _words(query)
    scored = []
    for order, person in enumerate(people):
        text = profile_text(person)
        overlap = len(wanted & _words(text))
        scored.append((-overlap, order, person, text))
    scored.sort(key=lambda row: (row[0], row[1]))
    return [(person, text) for _, _, person, text in scored[:RANK_CANDIDATES]]


def resolve_person(label: str, refs: dict[str, dict]) -> dict | None:
    """The person a pick refers to. Models answer "p3", "P3", "p3: Jason Chen",
    "3" or just "Jason Chen"; accept all of them."""
    text = label.strip()
    found = re.match(r"^\s*p?\s*(\d+)\b", text, re.IGNORECASE)
    if found and f"p{found.group(1)}" in refs:
        return refs[f"p{found.group(1)}"]
    name = re.sub(r"^\s*p\d+\s*[:.)-]\s*", "", text, flags=re.IGNORECASE).split("|")[0].strip().lower()
    by_name = [p for p in refs.values() if p["name"].strip().lower() == name]
    return by_name[0] if len(by_name) == 1 else None


def rank_profiles(people: list[dict], query: str, llm: LLMClient, today: date) -> list[tuple[dict, str]] | None:
    """Ask the model who fits. Returns (person, why) pairs, or None if it couldn't answer."""
    candidates = _candidates(people, query)
    refs = {f"p{n}": person for n, (person, _) in enumerate(candidates, start=1)}
    listing = "\n".join(f"p{n}: {text}" for n, (_, text) in enumerate(candidates, start=1))
    system = RANK_PROMPT.format(today=today.isoformat(), limit=RANK_RESULTS)
    try:
        raw = llm.chat_json(system, f"People:\n{listing}\n\nQuestion: {query}", RANK_JSON_SCHEMA)
        ranking = _Ranking.model_validate_json(raw)
    except (LLMUnavailable, ValidationError) as exc:
        logger.warning("Search ranking failed (%s); using filters", type(exc).__name__)
        return None

    chosen: list[tuple[dict, str]] = []
    unknown = 0
    for match in ranking.matches:
        person = resolve_person(match.person, refs)
        if person is None:
            unknown += 1
        elif all(person["id"] != p["id"] for p, _ in chosen):
            chosen.append((person, " ".join(match.why.split())[:160]))
    if unknown:
        logger.warning("Search: %d of %d picks didn't name a known person", unknown, len(ranking.matches))
    logger.info("Search ranked %d of %d people", len(chosen), len(candidates))
    return chosen[:RANK_RESULTS]


EXPAND_PROMPT = """You expand a search over someone's private notes about people they've met.
Return JSON {"terms": [...]}: up to 15 short, lowercase words or phrases that a person's
notes would likely contain if they match the search. Include the search's own key words,
synonyms, paraphrases, negated opposites, and related roles, fields or places.
Examples:
- "bad guy" -> ["bad guy", "not a good guy", "not nice", "rude", "mean", "jerk", "shady",
  "dishonest", "didn't trust", "arrogant", "toxic", "sketchy"]
- "chemistry" -> ["chemistry", "chemical", "chemist", "materials", "biotech", "battery", "lab"]
- "could fund my startup" -> ["investor", "vc", "venture", "angel", "fund", "seed", "raise"]
Return JSON only."""

EXPAND_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {"terms": {"type": "array", "items": {"type": "string"}}},
    "required": ["terms"],
}


class _Terms(BaseModel):
    terms: list[str]


def expand_query(query: str, llm: LLMClient) -> list[str] | None:
    try:
        raw = llm.chat_json(EXPAND_PROMPT, f"Search: {query}", EXPAND_JSON_SCHEMA)
        terms = _Terms.model_validate_json(raw).terms
    except (LLMUnavailable, ValidationError) as exc:
        logger.warning("Search expansion failed (%s)", type(exc).__name__)
        return None
    cleaned = [" ".join(t.lower().split()) for t in terms]
    return [t for t in dict.fromkeys(cleaned) if len(t) >= 3][:20]


def match_terms(people: list[dict], terms: list[str]) -> list[tuple[dict, str]]:
    """People whose notes contain any of the terms (whole words), most hits first."""
    # Whole words, plurals included ("startup" finds "startups").
    patterns = [(t, re.compile(r"(?<![a-z0-9])" + re.escape(t) + r"(?:s|es)?(?![a-z0-9])")) for t in terms]
    scored = []
    for order, person in enumerate(people):
        text = profile_text(person, limit=None).lower()
        hits = [t for t, pattern in patterns if pattern.search(text)]
        if hits:
            scored.append((-len(hits), order, person, hits))
    scored.sort(key=lambda row: (row[0], row[1]))
    return [(person, f"Your notes mention “{hits[0]}”") for _, _, person, hits in scored]


def search_by_meaning(people: list[dict], query: str, llm: LLMClient, today: date) -> list[tuple[dict, str]] | None:
    """The model's ranking plus notes that contain the search's paraphrases.

    Both ask the model, in parallel. None only if neither could answer.
    """
    with ThreadPoolExecutor(max_workers=2) as pool:
        ranked_future = pool.submit(rank_profiles, people, query, llm, today)
        terms_future = pool.submit(expand_query, query, llm)
        ranked, terms = ranked_future.result(), terms_future.result()
    if ranked is None and terms is None:
        return None
    combined: list[tuple[dict, str]] = []
    for person, why in (ranked or []) + (match_terms(people, terms) if terms else []):
        if all(person["id"] != p["id"] for p, _ in combined):
            combined.append((person, why))
    return combined[:RANK_RESULTS + 4]


def rank_by_meaning(
    conn: Connection, user_id: UUID, query: str, llm: LLMClient, today: date
) -> list[SearchResult] | None:
    """People who fit the question by meaning, or None if the model couldn't answer."""
    people = search_repo.people_profiles(conn, user_id)
    if not people:
        return []
    chosen = search_by_meaning(people, query, llm, today)
    if chosen is None:
        return None
    summaries = search_repo.contact_summaries(conn, user_id, [p["id"] for p, _ in chosen])
    return [
        SearchResult(contact=ContactSummary.model_validate(summaries[p["id"]]), reasons=[why])
        for p, why in chosen
        if p["id"] in summaries
    ]


def answer(conn: Connection, user_id: UUID, query: str, llm: LLMClient, today: date) -> SearchResponse:
    """Exact matches (a name, a company) first, then everyone who fits by meaning."""
    exact = run_search(conn, user_id, keyword_filters(query))
    ranked = rank_by_meaning(conn, user_id, query, llm, today)
    if ranked is not None:
        merged: list[SearchResult] = []
        seen: set[UUID] = set()
        for result in exact + ranked:
            if result.contact.id not in seen:
                seen.add(result.contact.id)
                merged.append(result)
        return SearchResponse(filters=SearchFilters(), interpreted=True, results=merged[:12])
    # The model is unavailable: structured filters if it can, else plain keywords.
    filters, interpreted = interpret(query, llm, today)
    return SearchResponse(filters=filters, interpreted=interpreted, results=run_search(conn, user_id, filters))
