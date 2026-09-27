"""Turn a transcript into structured people using the LLM.

Pipeline: transcript -> LLM (schema-constrained JSON) -> Pydantic
validation -> cleanup rules -> result for the user to review.
Nothing here writes to the database; the user confirms first.
"""

import logging
from datetime import date

from pydantic import ValidationError

from app.schemas.extraction import (
    EXTRACTION_JSON_SCHEMA,
    ContactExtractionResult,
    ExtractedPerson,
    SpeakerContext,
)
from app.services.dates import resolve_due_date
from app.services.llm import LLMClient

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 2
MAX_LIST_ITEMS = 12
MAX_TEXT_CHARS = 400

SYSTEM_PROMPT = """You extract memory notes about people from a voice note.
The speaker is the user describing people they met. Return JSON only.

Rules:
- Create one entry per person the user met or talked with. Never include the user.
- Only record facts that are stated. Never guess or add outside knowledge.
- If a fact is hedged ("I think", "maybe", "probably", "not sure"), do NOT put it in
  a structured field. Leave that field null and add a note starting with "Unsure:",
  for example "Unsure: may work at Google".
- If the speaker corrects themselves, keep only the corrected fact.
- company is only a named organization ("Figma", "Google"). A description without a
  name ("a small bakery", "a startup") is not a company: put it in role or projects,
  e.g. role "Bakery owner".
- projects are what they work on or build: "works on robotics" -> projects ["robotics"].
- metAt is the event or place where they met (e.g. "Berkeley founders mixer").
- followUp is what the user plans to do with this person, as a short action that
  keeps any timing, e.g. "Reach out next week". Use null if none was mentioned.
- Keep list items short (a few words), without duplicates.
- Use null for unknown text fields and [] for empty lists.
- Do not record sensitive traits (health, religion, sexuality, politics, ethnicity)."""


class ExtractionFailed(Exception):
    """The model kept returning output that doesn't match the schema."""


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = " ".join(value.split())
    if not text or text.lower() in {"null", "none", "n/a", "unknown"}:
        return None
    return text[:MAX_TEXT_CHARS]


def _clean_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        text = _clean_text(value)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            cleaned.append(text)
    return cleaned[:MAX_LIST_ITEMS]


def clean_person(person: ExtractedPerson) -> ExtractedPerson | None:
    """Normalize whitespace, drop placeholders and duplicates.

    Returns None for entries with no information at all.
    """
    data = {}
    for field_name, value in person:
        if isinstance(value, list):
            data[field_name] = _clean_list(value)
        elif isinstance(value, str) or value is None:
            data[field_name] = _clean_text(value)
        else:
            data[field_name] = value
    cleaned = ExtractedPerson(**data)
    if not any(v for _, v in cleaned):
        return None
    return cleaned


def describe_speaker(context: SpeakerContext | None) -> str:
    """A short note about the speaker for the model, or '' if we know nothing."""
    if not context or not (context.persona or context.school):
        return ""
    if context.persona == "student" and context.school:
        studying = f" studying {context.major}" if context.major else ""
        return (
            f"About the speaker: a student at {context.school}{studying}. If they say someone is a "
            f"classmate, in their class, a TA, a professor, or from their school or campus, set that "
            f"person's school to {context.school}."
        )
    return f"About the speaker: {context.persona}."


def extract_people(
    transcript: str,
    llm: LLMClient,
    today: date | None = None,
    context: SpeakerContext | None = None,
) -> ContactExtractionResult:
    today = today or date.today()
    about = describe_speaker(context)
    user_message = (f"{about}\n\n" if about else "") + (
        f"Voice note transcript:\n\"\"\"\n{transcript.strip()}\n\"\"\""
    )
    last_error: Exception | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        raw = llm.chat_json(SYSTEM_PROMPT, user_message, EXTRACTION_JSON_SCHEMA)
        try:
            parsed = ContactExtractionResult.model_validate_json(raw)
        except ValidationError as exc:
            # Log the shape of the problem, not the content (personal data).
            logger.warning("Invalid extraction output (attempt %d): %d errors", attempt, exc.error_count())
            last_error = exc
            continue
        people = [p for p in (clean_person(person) for person in parsed.people) if p]
        for person in people:
            person.follow_up_due = resolve_due_date(person.follow_up, today)
        return ContactExtractionResult(people=people)

    raise ExtractionFailed("The model returned output that didn't match the schema.") from last_error
