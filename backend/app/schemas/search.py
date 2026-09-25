from datetime import date
from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.base import ApiModel
from app.schemas.contacts import ContactSummary

Term = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class SearchRequest(ApiModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class SearchFilters(ApiModel):
    """A structured, validated description of what to look for.

    The LLM fills this in from a question; the database layer turns it
    into fixed, parameterized SQL. The model never writes SQL itself.
    """

    keywords: Annotated[list[Term], Field(max_length=8)] = Field(default_factory=list)
    company: Term | None = None
    role: Term | None = None
    school: Term | None = None
    event: Term | None = None
    location: Term | None = None
    met_after: date | None = None
    met_before: date | None = None
    has_open_follow_up: bool | None = None


class SearchResult(ApiModel):
    contact: ContactSummary
    reasons: list[str]


class SearchResponse(ApiModel):
    filters: SearchFilters
    interpreted: bool  # False when we fell back to plain keyword search
    results: list[SearchResult]


SEARCH_FILTERS_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "keywords": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Topic words to match anywhere (projects, needs, notes). Not names of fields.",
        },
        "company": {"type": ["string", "null"]},
        "role": {"type": ["string", "null"]},
        "school": {"type": ["string", "null"]},
        "event": {"type": ["string", "null"], "description": "Where they met, e.g. 'Cal Hacks'."},
        "location": {"type": ["string", "null"]},
        "metAfter": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "metBefore": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
        "hasOpenFollowUp": {"type": ["boolean", "null"]},
    },
    "required": [
        "keywords", "company", "role", "school", "event", "location",
        "metAfter", "metBefore", "hasOpenFollowUp",
    ],
}
