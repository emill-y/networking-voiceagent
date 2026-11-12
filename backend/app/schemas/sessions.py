from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.base import ApiModel
from app.schemas.contacts import CapturedPerson
from app.schemas.extraction import ExtractedPerson


class SessionCreate(ApiModel):
    # The event, e.g. "Cal Hacks mixer": becomes "where you met".
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    # The user's own name, so the AI never adds them as someone they met.
    you: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None


class SessionUpdate(ApiModel):
    # A new name for the session; empty clears it.
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


class SessionContact(ApiModel):
    id: UUID
    name: str
    role: str | None = None
    company: str | None = None
    school: str | None = None


class SessionOut(ApiModel):
    id: UUID
    title: str | None
    # True when Nomi made the title up from the conversation (the user didn't name it).
    title_auto: bool = False
    status: str  # recording | ready | saved
    chunks: int
    audio_seconds: float
    words: int
    people: list[ExtractedPerson]
    started_at: datetime
    ended_at: datetime | None = None
    # Saved sessions: the people it added to your network.
    contacts: list[SessionContact] = []


class SessionCreated(SessionOut):
    # For a paired Apple Watch: uploads to this session only, while it's recording.
    upload_token: str


class SessionFinished(SessionOut):
    transcript: str


class SessionSave(ApiModel):
    """The people the user kept after reviewing a session."""

    people: Annotated[list[CapturedPerson], Field(min_length=1, max_length=60)]
