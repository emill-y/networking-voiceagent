"""The end-of-session read: who you talked to, and detailed notes on each.

During a session the transcript is read a minute or two at a time, which is
enough to show people as they're met but too narrow to tell conversations
apart or write good notes. When the session ends:

1. Split: the model reads the whole transcript (lines tagged with chunk
   numbers) and lists every person the user talked with, kept separate even
   when nobody said a name, with the chunks where each conversation happened.
2. Notes: for each person, the model reads just their part of the transcript
   and writes thorough, sectioned notes (Granola-style), in parallel.

Anything that fails or runs out of time falls back to the live results.
"""

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import date

from pydantic import ValidationError

from app.schemas.extraction import EXTRACTION_JSON_SCHEMA, ExtractedPerson
from app.services.extraction import clean_person
from app.services.llm import LLMClient, LLMUnavailable

logger = logging.getLogger(__name__)

MAX_WORDS = 24_000  # about two and a half hours of talking; longer sessions keep the live results
TIME_BUDGET_SECONDS = 40  # the API runs for at most 60 seconds per request
PARALLEL = 6

SPLIT_PROMPT = """You read the transcript of a networking event, recorded on the user's phone.
There are no speaker labels. Each line starts with its chunk number, like [#12] (about 20
seconds each). The event is a series of separate conversations. List every person the user
had a real conversation with, each one separately. Return JSON only.

Rules:
- A new conversation usually starts with a greeting or introduction ("hey", "nice to meet
  you", "what do you do?", "I'm..."), the user introducing themselves again, or a clear
  change of who is talking and what about. Each new conversation partner is a new person.
- Never merge two different people, even when neither said a name. When in doubt, keep
  them separate.
- The same person can come back later in the event: list every chunk of theirs.
- In a group conversation, list each person who said something about themselves.
- Never include the user (they wear the recorder; they often ask the questions and repeat
  their own introduction). Skip people who are only mentioned, and passersby.
- name: as said (fix obvious speech-recognition misspellings using the hints), or null if
  never said. Never invent one.
- label: always set, a few words that tell this person apart from the others ("Airbnb
  designer who climbs", "CS junior building a drone startup").
- chunks: the chunk numbers of their conversation, in order.
- Order people by when the user met them."""

SPLIT_SCHEMA = {
    "type": "object",
    "properties": {
        "people": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": ["string", "null"]},
                    "label": {"type": "string"},
                    "chunks": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["name", "label", "chunks"],
            },
        }
    },
    "required": ["people"],
}

NOTES_PROMPT = """You are an excellent note-taker. From part of a networking event transcript
(recorded on the user's phone, no speaker labels), write the user's notes about ONE person:
the person named at the top. Other voices belong to the user or to other people. Return JSON
only: one object with this person's details.

Fill every field that was stated (role, company, school, major, location, interests,
projects, needs, topicsDiscussed, followUp). company is only a named organization.

conversation holds the notes, like great meeting notes: short section headings that start
with "## ", each followed by bullet sentences. Use these sections when they have content,
in this order:
## About them
## What they're working on
## What you talked about
## Their advice and ideas
## Next steps
Be exhaustive: the user relies on these notes instead of their memory. Keep every specific:
numbers, dates, places, companies, schools, classes, products, people they mentioned, stories,
opinions, questions they asked, and what the user shared. A few minutes of conversation is
usually 10 to 30 bullets. One fact per bullet, as a full sentence from the user's point of
view ("They're a junior in IEOR at Berkeley." "I told them about Nomi; they asked how it
handles consent."). Only write what was said. If you're not sure a line was this person,
start the bullet with "Unsure:". Never record sensitive traits (health, religion, sexuality,
politics, ethnicity). Never include facts about the user as facts about this person."""

PERSON_SCHEMA = EXTRACTION_JSON_SCHEMA["properties"]["people"]["items"]


def tagged_transcript(segments: list[dict]) -> str:
    return "\n".join(f"[#{s['seq']}] {s['text']}" for s in segments if s["text"])


def split_people(segments: list[dict], llm: LLMClient, title: str | None, owner: str | None,
                 hints: list[str]) -> list[dict] | None:
    """[{name, label, chunks}] or None if the model couldn't answer."""
    header = []
    if title:
        header.append(f"Event: {title}")
    if owner:
        header.append(f"The user is {owner}. Never include them.")
    if hints:
        header.append("Noticed while recording (may be incomplete or misspelled): " + "; ".join(hints[:40]))
    message = "\n".join(header) + "\n\nTranscript:\n" + tagged_transcript(segments)
    try:
        data = json.loads(llm.chat_json(SPLIT_PROMPT, message, SPLIT_SCHEMA))
        people = []
        for item in data.get("people") or []:
            chunks = sorted({int(c) for c in item.get("chunks") or [] if isinstance(c, (int, float))})
            name = (item.get("name") or "").strip() or None
            label = (item.get("label") or "").strip() or None
            if chunks and (name or label):
                people.append({"name": name, "label": label, "chunks": chunks})
        return people
    except (LLMUnavailable, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Session split failed: %s", type(exc).__name__)
        return None


def person_text(segments: list[dict], chunks: list[int]) -> str:
    """Their chunks plus one on each side, so the start and end of the conversation aren't cut."""
    wanted = {c + d for c in chunks for d in (-1, 0, 1)}
    return "\n".join(s["text"] for s in segments if s["seq"] in wanted and s["text"])


def write_person(segments: list[dict], who: dict, llm: LLMClient, title: str | None,
                 owner: str | None) -> dict:
    """Detailed notes on one person. On failure, just who they are."""
    base = {"name": who["name"], "label": None if who["name"] else who["label"], "met_at": title}
    focus = who["name"] or who["label"]
    header = [f"Write notes about: {focus}" + (f" ({who['label']})" if who["name"] and who["label"] else "")]
    if owner:
        header.append(f"The user is {owner}.")
    if title:
        header.append(f"Event: {title}")
    message = "\n".join(header) + "\n\nTranscript:\n" + person_text(segments, who["chunks"])
    try:
        raw = json.loads(llm.chat_json(NOTES_PROMPT, message, PERSON_SCHEMA))
        person = clean_person(ExtractedPerson.model_validate(raw))
        if person is None:
            return base
        data = person.model_dump(mode="json")
        data.update({k: v for k, v in base.items() if k in ("name", "label")})
        data["met_at"] = data.get("met_at") or title
        return data
    except (LLMUnavailable, ValueError, ValidationError) as exc:
        logger.warning("Notes for one person failed: %s", type(exc).__name__)
        return base


def write_notes(segments: list[dict], llm: LLMClient, today: date, title: str | None, owner: str | None,
                hints: list[str], budget: float = TIME_BUDGET_SECONDS) -> list[dict] | None:
    """Everyone in the session with detailed notes, or None to keep the live results."""
    words = sum(len(s["text"].split()) for s in segments)
    if words < 15 or words > MAX_WORDS:
        return None
    started = time.monotonic()
    people = split_people(segments, llm, title, owner, hints)
    if not people:
        return None
    remaining = budget - (time.monotonic() - started)
    pool = ThreadPoolExecutor(max_workers=PARALLEL)
    futures = [pool.submit(write_person, segments, who, llm, title, owner) for who in people]
    wait(futures, timeout=max(remaining, 5))
    pool.shutdown(wait=False, cancel_futures=True)
    out = []
    for who, future in zip(people, futures):
        if future.done() and not future.exception():
            out.append(future.result())
        else:
            out.append({"name": who["name"], "label": None if who["name"] else who["label"], "met_at": title})
    return out
