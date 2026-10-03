from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.base import ApiModel


class PlanPerson(ApiModel):
    contact_id: UUID
    name: str
    why: str | None = None


class RealEvent(ApiModel):
    id: str
    title: str
    start: str
    end: str | None = None
    all_day: bool
    city: str | None = None
    country: str | None = None
    online: bool
    url: str | None = None
    venue: str | None = None
    image_url: str | None = None
    category: str = "other"
    source: str  # conferences | ticketmaster | seatgeek | feed
    source_label: str
    topics: list[str]
    where: str  # local | nearby | online | travel | anywhere
    people: list[PlanPerson]


class Plan(ApiModel):
    event: RealEvent
    people: list[PlanPerson]
    shared: str
    why: str


class EventSource(ApiModel):
    label: str
    kind: str
    url: str | None = None
    events: int


class EventCategory(ApiModel):
    key: str
    label: str
    count: int


class PlansResponse(ApiModel):
    plans: list[Plan]
    events: list[RealEvent]
    categories: list[EventCategory] = []
    # The calendars you follow (iCal feeds), with how many events each has.
    sources: list[EventSource]


class EventFeed(ApiModel):
    id: UUID
    url: str
    label: str
    created_at: datetime


class EventFeedRequest(ApiModel):
    url: Annotated[str, StringConstraints(min_length=8, max_length=1000)]


class EventFeedAdded(ApiModel):
    feed: EventFeed
    upcoming: int
