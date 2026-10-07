from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.base import ApiModel
from app.schemas.extraction import ExtractedPerson


class SessionCreate(ApiModel):
    # The event, e.g. "Cal Hacks mixer": becomes "where you met".
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


class SessionOut(ApiModel):
    id: UUID
    title: str | None
    status: str  # recording | ready
    chunks: int
    audio_seconds: float
    words: int
    people: list[ExtractedPerson]
    started_at: datetime
    ended_at: datetime | None = None


class SessionCreated(SessionOut):
    # For a paired Apple Watch: uploads to this session only, while it's recording.
    upload_token: str


class SessionFinished(SessionOut):
    transcript: str
