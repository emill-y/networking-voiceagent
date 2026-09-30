"""Your data belongs to you: take it with you, or erase it."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from psycopg import Connection, errors

from app.core.auth import get_current_user_id
from app.core.db import get_db
from app.services.calendar_sync import RemoveEvents, get_remove_events
from app.repositories import contacts as repo
from app.schemas.base import ApiModel
from app.schemas.contacts import ContactDetail

router = APIRouter()


class DataExport(ApiModel):
    exported_at: datetime
    contacts: list[ContactDetail]


@router.get("/me/export", response_model=DataExport)
def export_data(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
) -> DataExport:
    contacts = []
    for row in repo.list_contacts(conn, user_id, limit=None):
        contact = repo.get_contact(conn, user_id, row["id"])
        contacts.append(
            ContactDetail(
                **contact,
                interactions=repo.list_interactions(conn, user_id, row["id"]),
                follow_ups=repo.list_follow_ups(conn, user_id, contact_id=row["id"]),
            )
        )
    return DataExport(exported_at=datetime.now(UTC), contacts=contacts)


@router.delete("/me/data", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_data(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    remove_events: RemoveEvents = Depends(get_remove_events),
) -> Response:
    remove_events(conn, user_id, None)
    # Interactions and follow-ups cascade from contacts.
    conn.execute("delete from contacts where user_id = %s", (user_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    remove_events: RemoveEvents = Depends(get_remove_events),
) -> Response:
    """Delete the account itself (the Supabase user) and all of its data."""
    remove_events(conn, user_id, None)
    conn.execute("delete from contacts where user_id = %s", (user_id,))
    try:
        # The backend's database role owns the schema and may remove auth users,
        # the same way Supabase's own "delete user" SQL does.
        conn.execute("delete from auth.users where id = %s", (user_id,))
    except errors.InsufficientPrivilege as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Your data was not deleted: the server can't remove accounts. Please try again later.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
