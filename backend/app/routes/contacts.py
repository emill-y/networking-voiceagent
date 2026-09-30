from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.db import get_db
from app.repositories import contacts as repo
from app.services.calendar_sync import RemoveEvents, get_remove_events
from app.schemas.contacts import (
    ContactDetail,
    ContactSummary,
    ContactUpdate,
    ImportRequest,
    ImportResponse,
)
from app.services.contact_import import import_people

router = APIRouter()

NOT_FOUND = "Person not found."


def _detail(conn: Connection, user_id: UUID, contact_id: UUID) -> ContactDetail:
    contact = repo.get_contact(conn, user_id, contact_id)
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return ContactDetail(
        **contact,
        interactions=repo.list_interactions(conn, user_id, contact_id),
        follow_ups=repo.list_follow_ups(conn, user_id, contact_id=contact_id),
    )


@router.get("/contacts", response_model=list[ContactSummary])
def list_contacts(
    limit: int = Query(50, ge=1, le=200),
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return repo.list_contacts(conn, user_id, limit)


@router.post("/contacts/import", response_model=ImportResponse)
def import_contacts(
    body: ImportRequest,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Add people the user picked from their phone's address book."""
    return import_people(conn, user_id, body.people)


@router.get("/contacts/{contact_id}", response_model=ContactDetail)
def get_contact(
    contact_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return _detail(conn, user_id, contact_id)


@router.patch("/contacts/{contact_id}", response_model=ContactDetail)
def update_contact(
    contact_id: UUID,
    body: ContactUpdate,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    if not repo.update_contact(conn, user_id, contact_id, body.model_dump(exclude_unset=True)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return _detail(conn, user_id, contact_id)


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    remove_events: RemoveEvents = Depends(get_remove_events),
):
    remove_events(conn, user_id, contact_id)
    if not repo.delete_contact(conn, user_id, contact_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/interactions/{interaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interaction(
    interaction_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    contact_id = repo.delete_interaction(conn, user_id, interaction_id)
    if contact_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Memory not found.")
    repo.refresh_last_interaction(conn, user_id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
