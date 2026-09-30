from typing import Annotated
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.base import ApiModel


class CalendarStatus(ApiModel):
    available: bool  # is Google Calendar set up on this server
    connected: bool
    email: str | None = None
    push_follow_ups: bool = True


class CalendarConnectRequest(ApiModel):
    # Where to come back to afterwards: a web app path ("/app/...") or the phone app.
    return_to: Annotated[str, StringConstraints(max_length=300)] = "/app/follow-ups"


class CalendarConnectResponse(ApiModel):
    url: str


class CalendarSettings(ApiModel):
    push_follow_ups: bool


class SuggestedPerson(ApiModel):
    contact_id: UUID
    name: str
    why: str


class UpcomingEvent(ApiModel):
    id: str | None
    title: str
    start: str | None
    all_day: bool
    location: str | None = None
    link: str | None = None
    people: list[SuggestedPerson]


class UpcomingResponse(ApiModel):
    connected: bool
    events: list[UpcomingEvent]
