from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.db import get_db
from app.repositories import contacts as repo
from app.schemas.contacts import FollowUp, FollowUpCreate, FollowUpStatus, FollowUpUpdate
from app.core.config import get_settings
from app.services import calendar_sync
from app.services.calendar_sync import CalendarActionError, PushFollowUp, get_calendar_push
from app.services.google_calendar import GoogleCalendar

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


def _calendar_error(exc: CalendarActionError) -> HTTPException:
    code = status.HTTP_409_CONFLICT if exc.state in ("disconnected", "needs_reauth", "unavailable") else status.HTTP_502_BAD_GATEWAY
    return HTTPException(code, {"message": str(exc), "calendarState": exc.state})


@router.post("/follow-ups/{follow_up_id}/calendar", response_model=FollowUp)
def add_follow_up_to_calendar(
    follow_up_id: UUID,
    request: Request,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
):
    """"Add to Google Calendar": an all-day event on the follow-up's date."""
    settings = get_settings()
    try:
        calendar_sync.add_to_calendar(conn, user_id, follow_up_id, client, settings,
                                      calendar_sync.public_base(request, settings))
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Follow-up not found.") from exc
    except CalendarActionError as exc:
        conn.commit()  # keep "needs reconnect" even though the request fails
        raise _calendar_error(exc) from exc
    return repo.get_follow_up(conn, user_id, follow_up_id)


@router.delete("/follow-ups/{follow_up_id}/calendar", response_model=FollowUp)
def remove_follow_up_from_calendar(
    follow_up_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    client: GoogleCalendar | None = Depends(calendar_sync.get_calendar_client),
):
    try:
        calendar_sync.remove_from_calendar(conn, user_id, follow_up_id, client, get_settings())
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Follow-up not found.") from exc
    except CalendarActionError as exc:
        raise _calendar_error(exc) from exc
    return repo.get_follow_up(conn, user_id, follow_up_id)
