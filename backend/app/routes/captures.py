from uuid import UUID

from fastapi import APIRouter, Depends, status
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.db import get_db
from app.repositories import contacts as repo
from app.schemas.contacts import (
    CaptureRequest,
    CaptureResponse,
    DuplicateCandidate,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
)
from app.services.calendar_sync import PushFollowUp, get_calendar_push
from app.services.captures import save_capture
from app.services.identity import find_candidates

router = APIRouter()


@router.post("/captures", response_model=CaptureResponse, status_code=status.HTTP_201_CREATED)
def create_capture(
    body: CaptureRequest,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    push: PushFollowUp = Depends(get_calendar_push),
) -> CaptureResponse:
    """Save everything the user confirmed from one voice note, atomically."""
    saved = save_capture(conn, user_id, body)
    for person in saved:
        if person.follow_up_id:
            push(conn, user_id, person.follow_up_id)
    return CaptureResponse(saved=saved)


@router.post("/duplicate-check", response_model=DuplicateCheckResponse)
def duplicate_check(
    body: DuplicateCheckRequest,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
) -> DuplicateCheckResponse:
    """Suggest existing contacts that might be the same person. Never merges."""
    known = repo.list_identity_fields(conn, user_id)
    return DuplicateCheckResponse(
        matches=[
            [DuplicateCandidate.model_validate(m) for m in find_candidates(q.model_dump(), known)]
            for q in body.people
        ]
    )
