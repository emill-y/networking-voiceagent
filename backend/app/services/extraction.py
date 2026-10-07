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
- Do not record sensitive traits (health, religion, sexuality, politics, ethnicity).
- Capture every stated detail about each person. Voice notes are often unpunctuated
  and lowercase; read them as speech.

Example. Note: "met priya shah at the career fair she's a software engineer at figma
working on their plugin platform she offered to refer me and we talked about design
systems i should send her my resume by friday"
Result: {"people":[{"name":"Priya Shah","company":"Figma","role":"Software engineer",
"school":null,"major":null,"metAt":"Career fair","location":null,"interests":[],
"projects":["Plugin platform"],"needs":[],"topicsDiscussed":["Design systems"],
"notes":["Offered to refer me"],"followUp":"Send my resume by Friday"}]}"""

# Ambient sessions: a recording of the conversations themselves, not a note.
AMBIENT_PROMPT = """You extract memory notes about people from an ambient recording of the
user at a networking event. The transcript has several speakers and no speaker labels,
and may include background noise or fragments. Return JSON only.

Rules:
- Create one entry per person the user actually talked with. Find them through
  introductions ("I'm Sarah", "my name is", "this is my friend Jason") and what each
  person says about themselves ("I study chemistry at Berkeley", "I work at Figma").
- Never include the user (the person wearing the recorder; they often ask the
  questions and introduce themselves first). If you can't tell who someone is, skip them.
- Skip people who are only mentioned and weren't there ("my professor said...").
- Never invent a name. A person without a stated name is skipped.
- Only record facts that are stated. Hedged facts go in notes, starting with "Unsure:".
- company is only a named organization; descriptions go in role or projects.
- metAt is the event if it's named in the recording, else null.
- followUp is a concrete next step that was agreed ("let's get coffee next week",
  "send me your resume"), written as the user's action. Else null.
- Keep list items short, without duplicates. Use null and [] for unknowns.
- Do not record sensitive traits (health, religion, sexuality, politics, ethnicity)."""

# A note this long that yields nothing but names probably lost its details.
THIN_NOTE_WORDS = 12
RETRY_NUDGE = (
    "\n\nYour previous answer only had names. Re-read the note and fill in every stated "
    "detail (role, company, school, where you met, projects, needs, topics, notes, follow-up)."
)


def _only_names(people: list[ExtractedPerson]) -> bool:
    return bool(people) and all(
        not any(v for k, v in person if k not in {"name", "follow_up_due"}) for person in people
    )


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
    ambient: bool = False,
) -> ContactExtractionResult:
    """People from a voice note, or (ambient=True) from a recorded conversation."""
    today = today or date.today()
    about = describe_speaker(context)
    label = "Ambient recording transcript" if ambient else "Voice note transcript"
    prompt = AMBIENT_PROMPT if ambient else SYSTEM_PROMPT
    user_message = (f"{about}\n\n" if about else "") + (
        f"{label}:\n\"\"\"\n{transcript.strip()}\n\"\"\""
    )
    last_error: Exception | None = None
    thin: list[ExtractedPerson] | None = None
    long_note = len(transcript.split()) >= THIN_NOTE_WORDS

    for attempt in range(1, MAX_ATTEMPTS + 1):
        message = user_message + (RETRY_NUDGE if thin is not None else "")
        raw = llm.chat_json(prompt, message, EXTRACTION_JSON_SCHEMA)
        try:
            parsed = ContactExtractionResult.model_validate_json(raw)
        except ValidationError as exc:
            # Log the shape of the problem, not the content (personal data).
            logger.warning("Invalid extraction output (attempt %d): %d errors", attempt, exc.error_count())
            last_error = exc
            continue
        people = [p for p in (clean_person(person) for person in parsed.people) if p]
        if long_note and _only_names(people) and thin is None and attempt < MAX_ATTEMPTS:
            logger.warning("Extraction returned only names for a %d-word note; retrying", len(transcript.split()))
            thin = people
            continue
        return _finish(people, today)

    if thin is not None:
        return _finish(thin, today)  # the retry failed; names are better than nothing

    raise ExtractionFailed("The model returned output that didn't match the schema.") from last_error


def _finish(people: list[ExtractedPerson], today: date) -> ContactExtractionResult:
    for person in people:
        person.follow_up_due = resolve_due_date(person.follow_up, today)
    filled = sum(1 for person in people for k, v in person if v and k != "name")
    logger.info("Extracted %d people with %d filled fields", len(people), filled)
    return ContactExtractionResult(people=people)
