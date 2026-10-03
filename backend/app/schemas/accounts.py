from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator

from app.schemas.base import ApiModel

AVATAR_PREFIXES = ("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")


class MyProfile(ApiModel):
    display_name: str | None
    avatar_url: str | None
    invite_code: str
    invite_link: str
    invited_count: int


class ProfileUpdate(ApiModel):
    display_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    # A small photo as a data URL (the app resizes it first); null removes it.
    avatar: Annotated[str, StringConstraints(max_length=400_000)] | None = None

    @field_validator("avatar")
    @classmethod
    def must_be_image(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(AVATAR_PREFIXES):
            raise ValueError("Use a PNG, JPEG or WebP image.")
        return value


class RedeemInvite(ApiModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=40)]


class ExportRequest(ApiModel):
    # The contacts in the current view; omitted means everyone.
    ids: list[UUID] | None = Field(default=None, max_length=5000)
    format: str = "csv"  # csv (download) or tsv (paste into Google Sheets)


class ShareRequest(ApiModel):
    contact_ids: list[UUID] = Field(min_length=1, max_length=200)
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class ShareCreated(ApiModel):
    id: UUID
    link: str
    emailed: bool
    count: int


class IncomingShare(ApiModel):
    id: UUID
    sender_name: str
    message: str | None
    count: int
    names: list[str]
    created_at: datetime


class ShareAccept(ApiModel):
    token: str | None = None


class ShareAccepted(ApiModel):
    added: int
    skipped: int
