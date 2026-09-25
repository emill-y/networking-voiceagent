"""Conversational search.

    "Who did I meet at Cal Hacks last month?"
        -> LLM -> SearchFilters(event="Cal Hacks", met_after=...)   (validated)
        -> fixed, parameterized SQL
        -> people + the reasons each one matched

If the model is unavailable or returns junk, we fall back to plain keyword
search so search always works.
"""

import logging
import re
from datetime import date, timedelta
from uuid import UUID

from pydantic import ValidationError
from psycopg import Connection

from app.repositories import contacts as contacts_repo
from app.repositories import search as search_repo
from app.schemas.contacts import ContactSummary
from app.schemas.search import SEARCH_FILTERS_JSON_SCHEMA, SearchFilters, SearchResult
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
