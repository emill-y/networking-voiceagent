"""Turn a transcript into structured people using the LLM.

Pipeline: transcript -> LLM (schema-constrained JSON) -> Pydantic
validation -> cleanup rules -> result for the user to review.
Nothing here writes to the database; the user confirms first.
"""

import logging
from datetime import date

from pydantic import ValidationError

from app.schemas.extraction import (
    AMBIENT_JSON_SCHEMA,
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
MAX_CONVERSATION_ITEMS = 60
MAX_TEXT_CHARS = 400

# ---------------------------------------------------------------------------
# WHAT TO REMEMBER: the part of the prompt that decides what Nomi pays
# attention to. Both prompts below include it. Edit this list to change what
# the model keeps; run `python -m scripts.eval_extraction` afterwards to check.
# ---------------------------------------------------------------------------
WHAT_TO_REMEMBER = """What matters most (capture these whenever they're said):
- How you met: the occasion and how you got talking ("met at the career fair, she
  sat next to me at the Figma talk"). Put the event or place in metAt and the story
  in a note starting with "How we met:".
- Their future plans, with any timing: trips, moves, new jobs, launches,
  applications, graduations ("going to Hawaii in December"). Add each as a note
  starting with "Plans:", e.g. "Plans: Hawaii trip in December".
- What they want or are looking for (a job, cofounder, designers, advice): needs.
- What they're working on: projects. What they care about: interests.
- What the user wants to do with them or promised them ("send my resume", "get
  coffee next week"): followUp, as the user's action with its timing.
- Things to bring up next time (how the trip went, how the interview went): a note
  starting with "Ask about:"."""

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

""" + WHAT_TO_REMEMBER + """

Example. Note: "met priya shah at the career fair she's a software engineer at figma
working on their plugin platform she offered to refer me and we talked about design
systems i should send her my resume by friday"
Result: {"people":[{"name":"Priya Shah","company":"Figma","role":"Software engineer",
"school":null,"major":null,"metAt":"Career fair","location":null,"interests":[],
"projects":["Plugin platform"],"needs":[],"topicsDiscussed":["Design systems"],
"notes":["Offered to refer me"],"followUp":"Send my resume by Friday"}]}"""

# Ambient sessions: a recording of the conversations themselves, not a note.
AMBIENT_PROMPT = """You extract memory notes about people from an ambient recording of the
user at a networking event. The transcript has several speakers, often with voice labels
("[Speaker 2]", "[You]"; see below), and may include background noise or fragments.
Return JSON only.

Who counts as a person (most important; a wrong person is worse than a missing one):
- Only add someone who was there and spoke with the user in this recording. Good
  evidence: they introduce themselves ("I'm Sarah"), the user greets them by name
  ("hey Jason, nice to meet you"), or someone introduces them to the user ("this is
  my friend Alex, he's here with me").
- A name that only comes up in conversation is NOT a person to add: people they talk
  about ("my sister Maya is coming"), people in stories, celebrities, coworkers,
  teachers, friends who weren't there. A whole conversation with one friend usually
  means ONE person, even if many names are mentioned.
- Count the voices. A back-and-forth between the user and one other speaker is one
  person. Don't split one speaker into several people, and don't add more people
  than there are distinct speakers answering the user.
- Ignore garbled fragments and words that look like speech-recognition mistakes on
  silence or noise ("thank you for watching", random single words). Never build a
  person from them.
- If you're unsure whether someone was there, leave them out.

Voice labels (when lines start with "[Speaker N]"):
- They come from voice analysis of the audio: the same label is the same voice for
  the whole session. They tell you who is talking; names tell you who they are.
- Set speaker to the label on this person's OWN lines (where they talk), e.g. a line
  "[Speaker 2] hi I'm Jun" means Jun is Speaker 2. Never use the label of the line
  where someone else says their name.
- One voice is one person: never give two people the same speaker. A person with no
  lines of their own in the recording is not someone to add, whatever names are said.
- "[You]" lines are the user, recognized by their saved voice: never add them, and
  never give anyone the speaker "You". Without [You] lines, the voice heard most is
  usually the user; never add the user either way.
- Voice analysis is good but not perfect: rarely, one voice is split into two labels.
  If two labels clearly belong to the same person (same name, same story), use the
  label with more lines.
- Without labels, set speaker to null.

Rules:
- Create one entry per person the user actually talked with, using what each person
  says about themselves ("I study chemistry at Berkeley", "I work at Figma").
- Never include the user (the person wearing the recorder; they often ask the
  questions and introduce themselves first). If you can't tell who someone is, skip them.
- Each separate conversation is a separate person. Never merge two people because
  neither said a name. Reuse an "already met" label only when the details clearly
  match that person.
- Never invent a name. If someone clearly talked with the user but their name was
  never said ("hey bro", "nice to meet you"), still include them with name null and a
  label: a few words to recognize them by, from what they said ("Airbnb designer who
  climbs", "CS student building a drone startup"). Include an unnamed person only if
  they had a real exchange with the user or shared something about themselves; skip
  passersby and bare greetings. If their name comes up later, use it.
- label is null whenever name is known.
- Only record facts that are stated. Hedged facts go in notes, starting with "Unsure:".
- company is only a named organization; descriptions go in role or projects.
- metAt is the event if it's named in the recording, else null.
- followUp is a concrete next step that was agreed ("let's get coffee next week",
  "send me your resume"), written as the user's action. Else null.
- Keep list items short, without duplicates. Use null and [] for unknowns.
- Be thorough: the user relies on these notes instead of their memory. Missing a
  detail is worse than a long note. Fill every field that was stated.
- conversation is the record of what was said with that person, in order, as full
  sentences that keep the specifics: numbers, places, companies, classes, products,
  people they mentioned, stories, opinions, advice, plans ("She's a junior in IEOR
  and interned at Magic Hour last summer on their video pipeline." "They argued the
  Bay Area is better than NYC for hardware startups."). Write it from the user's
  point of view ("I", "they"), never copying voice labels like "[Speaker 2]". Several
  sentences for any real conversation.
- Do not record sensitive traits (health, religion, sexuality, politics, ethnicity).
- Lines in parentheses at the top are context, not speech: the event name, who the
  user is (never include them, even if their name is spoken), and people already met
  earlier in the event. When a person from that list appears again, reuse their exact
  name (or, for "unnamed" people, their exact label) and add the details from this part. If an unnamed person from that list now says their name, give the name and
  keep the same label.
- Speech recognition misspells names. If a name here is clearly the same person as one
  already met (same first name, same company or school), use the earlier spelling.

""" + WHAT_TO_REMEMBER

# A note this long that yields nothing but names probably lost its details.
THIN_NOTE_WORDS = 12
RETRY_NUDGE = (
    "\n\nYour previous answer only had names. Re-read the note and fill in every stated "
    "detail (role, company, school, where you met, projects, needs, topics, notes, follow-up)."
)


def _only_names(people: list[ExtractedPerson]) -> bool:
    return bool(people) and all(
        not any(v for k, v in person if k not in {"name", "label", "follow_up_due", "speaker"}) for person in people
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


def _clean_list(values: list[str], limit: int = MAX_LIST_ITEMS) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        text = _clean_text(value)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            cleaned.append(text)
    return cleaned[:limit]


def clean_person(person: ExtractedPerson) -> ExtractedPerson | None:
    """Normalize whitespace, drop placeholders and duplicates.

    Returns None for entries with no information at all.
    """
    data = {}
    for field_name, value in person:
        if isinstance(value, list):
            data[field_name] = _clean_list(value, MAX_CONVERSATION_ITEMS if field_name == "conversation" else MAX_LIST_ITEMS)
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
        raw = llm.chat_json(prompt, message, AMBIENT_JSON_SCHEMA if ambient else EXTRACTION_JSON_SCHEMA)
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
