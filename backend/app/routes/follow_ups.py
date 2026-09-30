from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.db import get_db
from app.repositories import contacts as repo
from app.schemas.contacts import FollowUp, FollowUpCreate, FollowUpStatus, FollowUpUpdate
from app.services.calendar_sync import PushFollowUp, get_calendar_push

router = APIRouter()


@router.get("/follow-ups", response_model=list[FollowUp])
def list_follow_ups(
    status_filter: FollowUpStatus | None = Query(None, alias="status"),
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return repo.list_follow_ups(conn, user_id, status=status_filter)


@router.post("/follow-ups", response_model=FollowUp, status_code=status.HTTP_201_CREATED)
def create_follow_up(
    body: FollowUpCreate,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    push: PushFollowUp = Depends(get_calendar_push),
):
    if repo.get_contact(conn, user_id, body.contact_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found.")
    follow_up_id = repo.create_follow_up(
        conn, user_id, body.contact_id, None, body.action, body.due_at
    )
    push(conn, user_id, follow_up_id)
    return repo.get_follow_up(conn, user_id, follow_up_id)


@router.patch("/follow-ups/{follow_up_id}", response_model=FollowUp)
def update_follow_up(
    follow_up_id: UUID,
    body: FollowUpUpdate,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    push: PushFollowUp = Depends(get_calendar_push),
):
    if not repo.update_follow_up(conn, user_id, follow_up_id, body.model_dump(exclude_unset=True)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Follow-up not found.")
    push(conn, user_id, follow_up_id)
    return repo.get_follow_up(conn, user_id, follow_up_id)
