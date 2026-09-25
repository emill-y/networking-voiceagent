"""Save a reviewed voice note: contacts, interactions and follow-ups.

This is the business logic between "the user confirmed" and "rows exist".
It runs inside the request's transaction, so a failure on the third person
leaves nothing half-saved.
"""

from uuid import UUID

from fastapi import HTTPException, status
from psycopg import Connection

from app.repositories import contacts as repo
from app.schemas.contacts import CaptureRequest, CapturedPerson, SavedPerson
from app.services.identity import normalize


def _merge_into_existing(conn: Connection, user_id: UUID, person: CapturedPerson) -> UUID:
    assert person.contact_id is not None
    existing = repo.get_contact(conn, user_id, person.contact_id)
    if existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person no longer exists.")

    new = person.contact.model_dump()
    changes = {
        field: value
        for field, value in new.items()
        if field != "name" and value is not None and value != existing.get(field)
    }
    # Prefer the more complete name: "Jason" becomes "Jason Chen", never the reverse.
    if len(normalize(new["name"]).split()) > len(normalize(existing["name"]).split()):
        changes["name"] = new["name"]
    repo.update_contact(conn, user_id, person.contact_id, changes)
    return person.contact_id


def save_capture(conn: Connection, user_id: UUID, capture: CaptureRequest) -> list[SavedPerson]:
    saved = []
    for person in capture.people:
        created = person.contact_id is None
        if created:
            contact_id = repo.create_contact(conn, user_id, person.contact.model_dump())
        else:
            contact_id = _merge_into_existing(conn, user_id, person)

        interaction = person.interaction.model_dump()
        interaction_id = repo.create_interaction(
            conn,
            user_id,
            contact_id,
            interaction,
            raw_transcript=capture.transcript,
            source_type=capture.source_type,
            interaction_date=person.interaction.interaction_date,
        )

        follow_up_id = None
        if person.follow_up:
            follow_up_id = repo.create_follow_up(
                conn, user_id, contact_id, interaction_id,
                person.follow_up.action, person.follow_up.due_at,
            )

        repo.refresh_last_interaction(conn, user_id, contact_id)
        saved.append(
            SavedPerson(
                contact_id=contact_id,
                interaction_id=interaction_id,
                follow_up_id=follow_up_id,
                created=created,
            )
        )
    return saved
