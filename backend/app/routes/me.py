"""Your profile (photo, name), invite link and invites.

    GET   /me/profile       profile, invite code and link
    PATCH /me/profile       change display name or photo
    POST  /invites/redeem   record that you joined through someone's invite
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.config import get_settings
from app.core.db import get_db
from app.repositories import accounts as repo
from app.schemas.accounts import MyProfile, ProfileUpdate, RedeemInvite
from app.services.calendar_sync import public_base

router = APIRouter()


def _profile(conn: Connection, user_id: UUID, request: Request) -> MyProfile:
    row = repo.get_or_create_profile(conn, user_id)
    base = public_base(request, get_settings())
    return MyProfile(
        display_name=row["display_name"],
        avatar_url=row["avatar"],
        invite_code=row["invite_code"],
        invite_link=f"{base}/?invite={row['invite_code']}",
        invited_count=repo.invited_count(conn, user_id),
    )


@router.get("/me/profile", response_model=MyProfile)
def get_profile(request: Request, conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    return _profile(conn, user_id, request)


@router.patch("/me/profile", response_model=MyProfile)
def update_profile(body: ProfileUpdate, request: Request, conn: Connection = Depends(get_db),
                   user_id: UUID = Depends(get_current_user_id)):
    repo.update_profile(conn, user_id, body.model_dump(exclude_unset=True))
    return _profile(conn, user_id, request)


@router.post("/invites/redeem")
def redeem(body: RedeemInvite, conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    return {"redeemed": repo.redeem_invite(conn, user_id, body.code)}
