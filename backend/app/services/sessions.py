"""Ambient sessions: a whole networking event, transcribed in short chunks.

Each uploaded chunk (about 20 seconds) is transcribed and stored as a
segment. The transcript is split into windows of a few chunks; when a chunk
arrives, only its window is re-read by the model, so a two-hour event costs
the same per minute as a two-minute one. People found in every window are
merged by name into one list for the user to review and save.

With voice differentiation on (services/diarization.py), each line of the
transcript starts with "[Speaker N]", the same N for the same voice all
session. The model ties each person to one voice, and two rules hold in code:
someone with no voice in the recording (only talked about) is dropped, and
one voice is one person.
"""

import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import date

from app.schemas.extraction import ExtractedPerson
from app.services.diarization import YOU, ChunkVoices, label_transcript, match_voices, you_heard, your_voice
from app.services.extraction import ExtractionFailed, extract_people
from app.services.identity import normalize
from app.services.llm import LLMClient, LLMUnavailable

logger = logging.getLogger(__name__)

WINDOW_CHUNKS = 5  # about a minute and a half of conversation per model read
MAX_CHUNKS = 720  # four hours at 20-second chunks
FULL_KEY = str(MAX_CHUNKS + 1)  # the end-of-session notes (see session_notes.py)
LIST_FIELDS = ("interests", "projects", "needs", "topics_discussed", "notes", "conversation")
TEXT_FIELDS = ("company", "role", "school", "major", "met_at", "location", "follow_up", "follow_up_due", "speaker")
SPEAKER = re.compile(r"\[Speaker (\d+)\]")
# Any voice label at the start of a line: "[Speaker 2] " or "[You] ".
VOICE_LABEL = re.compile(r"\[(?:Speaker \d+|You)\]\s*")
# Whisper sometimes writes a few words when there's only silence or noise. If
# voice analysis heard no one at all, text this short is treated as made up.
MAX_UNHEARD_WORDS = 12


def label_chunk(result, heard: ChunkVoices | None, voices: list[dict],
                saved_voice: dict | None = None) -> tuple[str, list[dict] | None]:
    """(text to store, the session's voices updated) for one transcribed chunk.

    saved_voice is the user's saved voice ({"print", "seconds"}), if they saved
    one: it starts the session as voice 0, so their lines read "[You] ...".
    Without voice analysis (off, or it failed) the text is kept as it is."""
    if heard is None:
        return result.text, None
    if saved_voice and not any(v["id"] == YOU for v in voices):
        voices = [your_voice(saved_voice["print"], saved_voice["seconds"])] + voices
    if not heard.turns:
        if len(result.text.split()) <= MAX_UNHEARD_WORDS:
            return "", voices
        return result.text, voices
    if not result.pieces:
        return result.text, voices
    mapping, voices = match_voices(heard, voices)
    return label_transcript(list(result.pieces), heard.turns, mapping), voices


def _speaker(value) -> str | None:
    """'Speaker 2', 'speaker 2', '2', '[Speaker 2]' -> 'Speaker 2'."""
    digits = re.search(r"\d+", str(value or ""))
    return f"Speaker {int(digits.group())}" if digits else None


def strip_labels(person: dict) -> dict:
    """Voice labels are for the model to read, not for the notes it writes."""
    for field in ("conversation", "notes", "topics_discussed"):
        if person.get(field):
            person[field] = [t for t in (" ".join(VOICE_LABEL.sub("", x).split()) for x in person[field]) if t]
    return person


def _seconds(value: float) -> str:
    return f"{round(value)} s" if value < 90 else f"{round(value / 60)} min"


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
                owner: str | None = None, known: list[str] | None = None,
                voices: list[dict] | None = None) -> list[dict] | None:
    """People in one window, or None if the model couldn't answer (try again next chunk).

    The model is told who the user is (so they're never added) and who was
    already found earlier in the event (so later details land on the same
    person, under the same name)."""
    return _read(window_text(segments, window), llm, today, title, owner, known, voices)


def _read(text: str, llm: LLMClient, today: date, title: str | None,
          owner: str | None, known: list[str] | None, voices: list[dict] | None = None) -> list[dict] | None:
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
    others = sorted((v for v in voices or [] if v["id"] != YOU), key=lambda v: -v["seconds"])
    if voices and you_heard(voices):
        header.append("Lines marked [You] are the user, recognized by their saved voice. Never add them."
                      + (" Other voices so far: " + ", ".join(f"Speaker {v['id']} ({_seconds(v['seconds'])})" for v in others) + "."
                         if others else ""))
    elif others:
        header.append("Voices heard so far: " + ", ".join(f"Speaker {v['id']} ({_seconds(v['seconds'])})" for v in others)
                      + f". Speaker {others[0]['id']}, heard most, is probably the user wearing the recorder.")
    if header:
        text = "\n".join(f"({line})" for line in header) + "\n" + text
    try:
        result = extract_people(text, llm, today, ambient=True)
    except (LLMUnavailable, ExtractionFailed) as exc:
        logger.warning("Ambient extraction failed for a window: %s", type(exc).__name__)
        return None
    people = [strip_labels(p.model_dump(mode="json")) for p in result.people]
    labels = {f"Speaker {n}" for n in SPEAKER.findall(text)}
    if labels:
        # Voices were labeled: only people with a voice in this part count.
        for person in people:
            person["speaker"] = _speaker(person.get("speaker"))
        people = [p for p in people if p["speaker"] in labels]
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
    """Same person: same voice, or by name, or (for someone whose name wasn't
    heard) by label."""
    if person.get("speaker") and person.get("speaker") == entry.get("speaker"):
        return True  # one voice is one person
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
    # With voice labels, the end read decides which voices are people; a voice it
    # left out (the user, or no one real) doesn't come back from a live read.
    final_voices = {p.get("speaker") for p in final or [] if p.get("speaker")}
    keys = sorted((k for k in windows if k != FULL_KEY), key=int)
    if final:
        keys = [FULL_KEY] + keys
    merged: list[dict] = []
    from_final: set[int] = set()
    for key in keys:
        for person in windows[key]:
            if not normalize(person.get("name")) and not normalize(person.get("label")):
                continue
            if final_voices and key != FULL_KEY and person.get("speaker") and person["speaker"] not in final_voices:
                continue
            match = next((m for m in merged if _matches(m, person)), None)
            if match is None:
                if final and key != FULL_KEY and not normalize(person.get("name")):
                    continue  # unnamed live guesses are covered by the end read
                merged.append(dict(person))
                if key == FULL_KEY:
                    from_final.add(id(merged[-1]))
                continue
            new, old = normalize(person.get("name")), normalize(match.get("name"))
            if new and old and not _same_person(new, old):
                # Same voice, different name: keep the first, flag the other.
                note = f"Unsure: also heard as {person['name']}"
                if note not in (match.get("notes") or []):
                    match["notes"] = list(match.get("notes") or []) + [note]
            elif person.get("name") and len(person["name"]) > len(match.get("name") or ""):
                match["name"] = person["name"]  # the fuller name wins
            for field in TEXT_FIELDS:
                if not match.get(field) and person.get(field):
                    match[field] = person[field]
            for field in LIST_FIELDS:
                if field == "conversation" and id(match) in from_final and match.get("conversation"):
                    continue  # the end-of-session notes are the record (unless writing them failed)
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


TITLE_PROMPT = """You name a recorded conversation so the user can find it later in a list.
Return JSON only: a title of 2 to 5 words about what the conversation was mainly about,
in sentence case, with no quotes or ending punctuation.
Good titles: "Hawaii trip plans", "Cal Hacks team chat", "Coffee about design jobs".
Prefer the main topic or plan over small talk. Use a named event if one is clearly stated.
Don't use people's names unless the conversation was only about one person.
If there's too little to tell, return an empty title."""
TITLE_SCHEMA = {"type": "object", "properties": {"title": {"type": "string"}}, "required": ["title"]}
MIN_TITLE_WORDS = 8
MAX_TITLE_CHARS = 60


def suggest_title(segments: list[dict], llm: LLMClient) -> str | None:
    """A short title made up from the conversation ("Hawaii trip plans"), or None."""
    text = full_transcript(segments)
    if len(text.split()) < MIN_TITLE_WORDS:
        return None
    try:
        raw = llm.chat_json(TITLE_PROMPT, f"Transcript:\n\"\"\"\n{text[:12000]}\n\"\"\"", TITLE_SCHEMA)
        title = " ".join(str(json.loads(raw).get("title") or "").split()).strip(" \"'.")
    except (LLMUnavailable, ValueError, TypeError, AttributeError) as exc:
        logger.warning("Session title failed: %s", type(exc).__name__)
        return None
    if not title or len(title) > MAX_TITLE_CHARS:
        return None
    return title[0].upper() + title[1:]


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
    # Stored text carries voice labels ("[Speaker 2] ..."); Whisper should only see speech.
    before = " ".join(VOICE_LABEL.sub("", before).split())
    if before:
        parts.append(before[-500:])
    prompt = " ".join(parts).strip()
    return prompt[-900:] or None
