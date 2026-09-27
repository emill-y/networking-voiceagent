from datetime import datetime
from typing import Literal
from uuid import UUID

from app.schemas.base import ApiModel

EdgeKind = Literal["organization", "event", "interests"]


class NetworkPerson(ApiModel):
    id: UUID
    kind: Literal["person"] = "person"
    name: str
    subtitle: str | None
    moments: int
    last_interaction_at: datetime | None
    open_follow_ups: int


class NetworkGroup(ApiModel):
    """A shared place or thing many people connect through (a hub node)."""

    id: str
    kind: Literal["group"] = "group"
    label: str
    edge_kind: EdgeKind
    members: int


class NetworkEdge(ApiModel):
    source: str
    target: str
    kind: EdgeKind
    reasons: list[str]


class NetworkResponse(ApiModel):
    people: list[NetworkPerson]
    groups: list[NetworkGroup]
    edges: list[NetworkEdge]
