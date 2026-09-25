from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.schemas.base import ApiModel

# Trimmed strings with sane limits. Empty optional strings become None.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=400)]
Item = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]
Items = Annotated[list[Item], Field(max_length=30)]
FollowUpStatus = Literal["open", "done", "dismissed"]


class _BlankToNone(ApiModel):
    @field_validator("*", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value


# ---------- Writes ----------


class ContactFields(_BlankToNone):
    name: Name
    company: ShortText | None = None
    role: ShortText | None = None
    school: ShortText | None = None
    major: ShortText | None = None
    location: ShortText | None = None


class ContactUpdate(_BlankToNone):
    """PATCH body: only the fields sent are changed. Send null to clear one."""

    name: Name | None = None
    company: ShortText | None = None
    role: ShortText | None = None
    school: ShortText | None = None
    major: ShortText | None = None
    location: ShortText | None = None
    email: ShortText | None = None
    phone: ShortText | None = None
    linkedin_url: ShortText | None = None
    website_url: ShortText | None = None
    summary: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None

    @model_validator(mode="after")
    def name_cannot_be_cleared(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("A person needs a name.")
        return self


class InteractionFields(_BlankToNone):
    event: ShortText | None = None
    location: ShortText | None = None
    interests: Items = Field(default_factory=list)
    projects: Items = Field(default_factory=list)
    needs: Items = Field(default_factory=list)
    topics_discussed: Items = Field(default_factory=list)
    notes: Items = Field(default_factory=list)
    interaction_date: datetime | None = None


class FollowUpFields(_BlankToNone):
    action: Name
    due_at: datetime | None = None


class CapturedPerson(ApiModel):
    # Set when the user confirmed this is someone they already know.
    contact_id: UUID | None = None
    contact: ContactFields
    interaction: InteractionFields = Field(default_factory=InteractionFields)
    follow_up: FollowUpFields | None = None


class CaptureRequest(ApiModel):
    """One reviewed voice note: possibly several people."""

    transcript: Annotated[str, StringConstraints(max_length=20_000)] | None = None
    source_type: Literal["voice", "manual"] = "voice"
    people: Annotated[list[CapturedPerson], Field(min_length=1, max_length=10)]


class SavedPerson(ApiModel):
    contact_id: UUID
    interaction_id: UUID
    follow_up_id: UUID | None
    created: bool


class CaptureResponse(ApiModel):
    saved: list[SavedPerson]


class FollowUpUpdate(_BlankToNone):
    action: Name | None = None
    due_at: datetime | None = None
    status: FollowUpStatus | None = None

    @model_validator(mode="after")
    def required_fields_cannot_be_cleared(self):
        for field in ("action", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be empty.")
        return self


class FollowUpCreate(FollowUpFields):
    contact_id: UUID


# ---------- Reads ----------


class ContactSummary(ApiModel):
    id: UUID
    name: str
    company: str | None
    role: str | None
    school: str | None
    email: str | None = None
    phone: str | None = None
    last_interaction_at: datetime | None
    last_event: str | None
    open_follow_ups: int


class Interaction(ApiModel):
    id: UUID
    contact_id: UUID
    event: str | None
    location: str | None
    summary: str | None
    raw_transcript: str | None
    interests: list[str]
    projects: list[str]
    needs: list[str]
    topics_discussed: list[str]
    notes: list[str]
    interaction_date: datetime
    source_type: str


class FollowUp(ApiModel):
    id: UUID
    contact_id: UUID
    contact_name: str
    interaction_id: UUID | None
    action: str
    due_at: datetime | None
    status: FollowUpStatus
    created_at: datetime
    completed_at: datetime | None


class ContactDetail(ApiModel):
    id: UUID
    name: str
    company: str | None
    role: str | None
    school: str | None
    major: str | None
    location: str | None
    email: str | None
    phone: str | None
    linkedin_url: str | None
    website_url: str | None
    summary: str | None
    last_interaction_at: datetime | None
    created_at: datetime
    interactions: list[Interaction]
    follow_ups: list[FollowUp]


# ---------- Import from the phone's address book ----------


class ImportedPerson(_BlankToNone):
    # Set when the app matched this address-book entry to someone in Nomi.
    contact_id: UUID | None = None
    name: Name
    company: ShortText | None = None
    role: ShortText | None = None
    email: ShortText | None = None
    phone: ShortText | None = None


class ImportRequest(ApiModel):
    people: Annotated[list[ImportedPerson], Field(min_length=1, max_length=500)]


class ImportResponse(ApiModel):
    created: int
    updated: int
    unchanged: int


# ---------- Duplicate check ----------


class DuplicateQuery(_BlankToNone):
    name: ShortText | None = None
    company: ShortText | None = None
    school: ShortText | None = None


class DuplicateCheckRequest(ApiModel):
    people: Annotated[list[DuplicateQuery], Field(max_length=10)]


class DuplicateCandidate(ApiModel):
    contact_id: UUID
    name: str
    company: str | None
    role: str | None
    school: str | None
    last_interaction_at: datetime | None
    strength: Literal["strong", "possible"]
    reason: str


class DuplicateCheckResponse(ApiModel):
    # matches[i] are the candidates for people[i].
    matches: list[list[DuplicateCandidate]]
