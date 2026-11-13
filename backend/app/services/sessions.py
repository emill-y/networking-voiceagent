"""Ambient sessions: a whole networking event, transcribed in short chunks.

Each uploaded chunk (about 20 seconds) is transcribed and stored as a
segment. The transcript is split into windows of a few chunks; when a chunk
arrives, only its window is re-read by the model, so a two-hour event costs
the same per minute as a two-minute one. People found in every window are
merged by name into one list for the user to review and save.
"""

import hashlib
import hmac
import json
import logging
import secrets
from datetime import date

from app.schemas.extraction import ExtractedPerson
from app.services.extraction import ExtractionFailed, extract_people
from app.services.identity import normalize
from app.services.llm import LLMClient, LLMUnavailable

logger = logging.getLogger(__name__)

WINDOW_CHUNKS = 5  # about a minute and a half of conversation per model read
MAX_CHUNKS = 720  # four hours at 20-second chunks
FULL_KEY = str(MAX_CHUNKS + 1)  # the end-of-session notes (see session_notes.py)
LIST_FIELDS = ("interests", "projects", "needs", "topics_discussed", "notes", "conversation")
TEXT_FIELDS = ("company", "role", "school", "major", "met_at", "location", "follow_up", "follow_up_due")


def new_upload_token() -> tuple[str, str]:
    """(token for the client, hash to store)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def token_matches(token: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), stored_hash)


def add_segment(segments: list[dict], seq: int, text: str, seconds: float) -> list[dict]:
    """Insert or replace chunk `seq` (uploads can be retried or arrive out of order)."""
    kept = [s for s in segments if s["seq"] != seq]
    kept.append({"seq": seq, "text": text.strip(), "seconds": round(seconds, 1)})
    return sorted(kept, key=lambda s: s["seq"])


def window_of(seq: int) -> int:
    return seq // WINDOW_CHUNKS


def window_text(segments: list[dict], window: int) -> str:
    """The window's chunks plus the one before it, so a conversation split across
    windows is still read whole."""
    start = window * WINDOW_CHUNKS - 1
    end = (window + 1) * WINDOW_CHUNKS
    return "\n".join(s["text"] for s in segments if start <= s["seq"] < end and s["text"])


def full_transcript(segments: list[dict]) -> str:
    return "\n".join(s["text"] for s in segments if s["text"])


def read_window(segments: list[dict], window: int, llm: LLMClient, today: date, title: str | None,
                owner: str | None = None, known: list[str] | None = None) -> list[dict] | None:
    """People in one window, or None if the model couldn't answer (try again next chunk).

    The model is told who the user is (so they're never added) and who was
    already found earlier in the event (so later details land on the same
    person, under the same name)."""
    return _read(window_text(segments, window), llm, today, title, owner, known)


def _read(text: str, llm: LLMClient, today: date, title: str | None,
          owner: str | None, known: list[str] | None) -> list[dict] | None:
    if len(text.split()) < 8:
        return []
    header = []
    if title:
        header.append(f"Event: {title}")
    if owner:
        header.append(f"The user (wearing the recorder) is {owner}. Never include them.")
    if known:
        header.append("Already met earlier in this event: " + "; ".join(known[:40])
                      + ". If this part adds details about one of them, use exactly that name.")
    if header:
        text = "\n".join(f"({line})" for line in header) + "\n" + text
    try:
        result = extract_people(text, llm, today, ambient=True)
    except (LLMUnavailable, ExtractionFailed) as exc:
        logger.warning("Ambient extraction failed for a window: %s", type(exc).__name__)
        return None
    people = [p.model_dump(mode="json") for p in result.people]
    if owner:
        me = normalize(owner)
        people = [p for p in people if not _same_person(normalize(p.get("name")) or "", me)]
    return people


def known_people(windows: dict[str, list[dict]], skip: int | None = None) -> list[str]:
    """'Sarah Kim (Figma)' for everyone found outside window `skip`, for the model's context."""
    others = {k: v for k, v in windows.items() if skip is None or k != str(skip)}
    out = []
    for person in merge_people(others, None):
        if not person.name:
            out.append(f'unnamed, label "{person.label}"')
            continue
        about = ", ".join(x for x in (person.role, person.company or person.school) if x)
        out.append(f"{person.name} ({about})" if about else person.name)
    return out


def _same_person(a: str, b: str) -> bool:
    """'sarah kim' and 'sarah' are the same person; 'sarah kim' and 'sarah lee' aren't."""
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    return " " not in short and long_.split()[0] == short


def _matches(entry: dict, person: dict) -> bool:
    """Same person: by name, or (for someone whose name wasn't heard) by label."""
    name, other = normalize(person.get("name")), normalize(entry.get("name"))
    if name and other:
        return _same_person(other, name)
    label, other_label = normalize(person.get("label")), normalize(entry.get("label"))
    return bool(label and other_label and label == other_label)


def merge_people(windows: dict[str, list[dict]], event: str | None) -> list[ExtractedPerson]:
    """One entry per person across all windows, in the order they were met.

    People whose name was never said are kept, recognized by their label, so
    the user can name them at review. When an unnamed person later says their
    name (same label), the name is filled in.

    Once the session has ended, the end-of-session notes (FULL_KEY) decide who
    the people are and hold their notes; the live windows only fill in fields
    those notes left empty, and add named people the end read missed."""
    final = windows.get(FULL_KEY)
    keys = sorted((k for k in windows if k != FULL_KEY), key=int)
    if final:
        keys = [FULL_KEY] + keys
    merged: list[dict] = []
    from_final: set[int] = set()
    for key in keys:
        for person in windows[key]:
            if not normalize(person.get("name")) and not normalize(person.get("label")):
                continue
            match = next((m for m in merged if _matches(m, person)), None)
            if match is None:
                if final and key != FULL_KEY and not normalize(person.get("name")):
                    continue  # unnamed live guesses are covered by the end read
                merged.append(dict(person))
                if key == FULL_KEY:
                    from_final.add(id(merged[-1]))
                continue
            if person.get("name") and len(person["name"]) > len(match.get("name") or ""):
                match["name"] = person["name"]  # the fuller name wins
            for field in TEXT_FIELDS:
                if not match.get(field) and person.get(field):
                    match[field] = person[field]
            for field in LIST_FIELDS:
                if field == "conversation" and id(match) in from_final:
                    continue  # the end-of-session notes are the record
                seen = {x.lower() for x in match.get(field) or []}
                match[field] = list(match.get(field) or []) + [x for x in person.get(field) or [] if x.lower() not in seen]
            if not match.get("label") and person.get("label"):
                match["label"] = person["label"]
    people = [ExtractedPerson.model_validate(p) for p in merged]
    for person in people:
        if person.name:
            person.label = None
    for person in people:
        if event and not person.met_at:
            person.met_at = event
    return people


# A conversation where the model found no one: kept as one unnamed person, so
# nothing the user recorded goes to waste. They add the name at review.
MIN_FALLBACK_WORDS = 15
FALLBACK_KEY = str(MAX_CHUNKS)  # sorts after every real window
FALLBACK_PROMPT = """You read an ambient recording transcript from a networking event where no
one's name was clearly said. Return JSON only: a short label to recognize who the user
talked with (a few words from what they said, e.g. "Designer who just moved to SF"; use
"Someone you talked to" if nothing fits), the topics discussed (short items, at most 6),
and anything they said about themselves (role, school, company, projects), only if stated.
Never invent names or facts. Skip sensitive traits."""
FALLBACK_SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string"},
        "topics": {"type": "array", "items": {"type": "string"}},
        "about": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["label", "topics", "about"],
}


def conversation_fallback(segments: list[dict], llm: LLMClient, title: str | None) -> dict | None:
    """One unnamed person for a session where nobody was found, or None if
    there's hardly any speech to keep."""
    text = full_transcript(segments)
    if len(text.split()) < MIN_FALLBACK_WORDS:
        return None
    default = f"Someone from {title}" if title else "Someone you talked to"
    person = {"name": None, "label": default, "met_at": title, "topics_discussed": [], "notes": []}
    try:
        raw = llm.chat_json(FALLBACK_PROMPT, f"Transcript:\n\"\"\"\n{text[-12000:]}\n\"\"\"", FALLBACK_SCHEMA)
        data = json.loads(raw)
        label = str(data.get("label") or "").strip()
        if label and len(label) <= 80:
            person["label"] = label
        person["topics_discussed"] = [str(t).strip() for t in data.get("topics") or [] if str(t).strip()][:6]
        person["notes"] = [str(t).strip() for t in data.get("about") or [] if str(t).strip()][:6]
    except (LLMUnavailable, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Conversation fallback failed: %s", type(exc).__name__)
    return person


def transcription_prompt(segments: list[dict], seq: int, title: str | None, names: list[str]) -> str | None:
    """Context for speech-to-text: the event, names already heard, and the end of
    the previous chunk, so names are spelled consistently and a sentence cut
    between chunks still reads right. Whisper uses about the last 224 tokens."""
    parts = []
    if title:
        parts.append(f"{title}.")
    if names:
        parts.append(", ".join(names[:20]) + ".")
    before = next((s["text"] for s in reversed(segments) if s["seq"] < seq and s["text"]), "")
    if before:
        parts.append(before[-500:])
    prompt = " ".join(parts).strip()
    return prompt[-900:] or None
