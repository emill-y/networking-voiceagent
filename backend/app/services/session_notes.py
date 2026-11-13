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

With voice differentiation on, transcript lines also carry voice labels
("[#12] [Speaker 2] hi I'm Jun", "[You] ..."). Then each person is tied to
one voice, and the same rules as the live reads hold in code: someone with
no voice of their own (only talked about) is dropped, and one voice is one
person.
"""

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import date

from pydantic import ValidationError

from app.schemas.extraction import EXTRACTION_JSON_SCHEMA, ExtractedPerson
from app.services.extraction import clean_person
from app.services.identity import normalize
from app.services.llm import LLMClient, LLMUnavailable
from app.services.sessions import SPEAKER, VOICE_LABEL, _speaker, strip_labels

logger = logging.getLogger(__name__)

MAX_WORDS = 24_000  # about two and a half hours of talking; longer sessions keep the live results
TIME_BUDGET_SECONDS = 40  # the API runs for at most 60 seconds per request
PARALLEL = 6

SPLIT_PROMPT = """You read the transcript of a networking event, recorded on the user's phone.
Each line starts with its chunk number, like [#12] (about 20 seconds each), and often a voice
label from voice analysis: "[Speaker 2]" is the same voice all event; "[You]" is the user. The event is a series of separate conversations. List every person the user
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
- speaker: when lines have voice labels, the label on this person's OWN lines ("Speaker 2").
  One voice is one person: never give two people the same speaker. Someone with no lines of
  their own (only talked about) is not a person to add. "[You]" lines are the user. Without
  labels, null.
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
                    "speaker": {"type": ["string", "null"]},
                },
                "required": ["name", "label", "chunks", "speaker"],
            },
        }
    },
    "required": ["people"],
}

NOTES_PROMPT = """You are an excellent note-taker. From part of a networking event transcript
(recorded on the user's phone), write the user's notes about ONE person: the person named
at the top. Lines may start with voice labels ("[Speaker 2]", "[You]" for the user); when the
top names this person's voice, their lines are the ones with that label. Other voices belong
to the user or to other people. Return JSON
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
Never copy chunk numbers ("[#12]") or voice labels ("[Speaker 2]") into the notes; say who
said what in words. Be exhaustive: the user relies on these notes instead of their memory. Keep every specific:
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
                people.append({"name": name, "label": label, "chunks": chunks, "speaker": _speaker(item.get("speaker"))})
        return one_per_voice(people, segments)
    except (LLMUnavailable, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Session split failed: %s", type(exc).__name__)
        return None


def one_per_voice(people: list[dict], segments: list[dict]) -> list[dict]:
    """When the transcript has voice labels: drop people without a voice of
    their own, fold two people given the same voice into one (the second name
    is kept as an "also heard as" note), and never keep the user.

    Without a saved voice ("[You]"), if every voice became a person, one of
    them is the user: the voice heard most (the phone is on them) is dropped."""
    voices = {f"Speaker {n}" for s in segments for n in SPEAKER.findall(s["text"] or "")}
    if not voices:
        for person in people:
            person["speaker"] = None
        return people
    out: list[dict] = []
    for person in people:
        if person["speaker"] not in voices:
            continue
        same = next((p for p in out if p["speaker"] == person["speaker"]), None)
        if same is None:
            out.append(person)
            continue
        same["chunks"] = sorted(set(same["chunks"]) | set(person["chunks"]))
        if person["name"] and normalize(person["name"]) != normalize(same["name"]):
            if same["name"]:
                same.setdefault("also", []).append(person["name"])
            else:
                same["name"] = person["name"]
    you_saved = any("[You]" in (s["text"] or "") for s in segments)
    if not you_saved and len(voices) >= 2 and len(out) == len(voices):
        said = words_by_voice(segments)
        heard_most = max(voices, key=lambda v: said.get(v, 0))
        out = [p for p in out if p["speaker"] != heard_most]
    return out


def words_by_voice(segments: list[dict]) -> dict[str, int]:
    """How much each labeled voice said, in words."""
    counts: dict[str, int] = {}
    for s in segments:
        for line in (s["text"] or "").splitlines():
            m = SPEAKER.match(line)
            if m:
                key = f"Speaker {m.group(1)}"
                counts[key] = counts.get(key, 0) + len(VOICE_LABEL.sub("", line).split())
    return counts


def person_text(segments: list[dict], chunks: list[int]) -> str:
    """Their chunks plus one on each side, so the start and end of the conversation aren't cut."""
    wanted = {c + d for c in chunks for d in (-1, 0, 1)}
    return "\n".join(s["text"] for s in segments if s["seq"] in wanted and s["text"])


def write_person(segments: list[dict], who: dict, llm: LLMClient, title: str | None,
                 owner: str | None) -> dict:
    """Detailed notes on one person. On failure, just who they are."""
    base = {"name": who["name"], "label": None if who["name"] else who["label"], "met_at": title,
            "speaker": who.get("speaker"), "notes": [f"Unsure: also heard as {n}" for n in who.get("also", [])]}
    focus = who["name"] or who["label"]
    header = [f"Write notes about: {focus}" + (f" ({who['label']})" if who["name"] and who["label"] else "")
              + (f". Their voice: [{who['speaker']}]" if who.get("speaker") else "")]
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
        data = strip_labels(person.model_dump(mode="json"))
        data.update({k: v for k, v in base.items() if k in ("name", "label", "speaker")})
        data["notes"] = list(data.get("notes") or []) + [n for n in base["notes"] if n not in (data.get("notes") or [])]
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
            out.append({"name": who["name"], "label": None if who["name"] else who["label"], "met_at": title,
                        "speaker": who.get("speaker")})
    return out
