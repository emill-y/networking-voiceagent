"""Bring people in from the phone's address book.

The app matches the address book against Nomi on the device and sends only
the entries the user picked. Here we:

- fill in blanks on people already in Nomi (never overwrite what the user
  wrote; their own notes are the more personal source), and
- create everyone else, unless their phone number or email already belongs
  to someone saved (so importing twice doesn't duplicate anyone).

Imported people start with no moments: an import isn't a conversation.
"""

import re
from uuid import UUID

from psycopg import Connection

from app.repositories import contacts as repo
from app.schemas.contacts import ImportedPerson, ImportResponse

FILLABLE = ("company", "role", "email", "phone")


def phone_key(phone: str | None) -> str | None:
    """Compare numbers by digits, ignoring formatting and a leading country code."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) < 7:
        return None
    return digits[-10:]


def email_key(email: str | None) -> str | None:
    email = (email or "").strip().lower()
    return email if "@" in email else None


def import_people(conn: Connection, user_id: UUID, people: list[ImportedPerson]) -> ImportResponse:
    known = repo.list_identity_fields(conn, user_id)
    by_id = {row["id"]: row for row in known}
    by_phone = {phone_key(row["phone"]): row for row in known if phone_key(row["phone"])}
    by_email = {email_key(row["email"]): row for row in known if email_key(row["email"])}

    created = updated = unchanged = 0
    for person in people:
        existing = (
            by_id.get(person.contact_id)
            or by_phone.get(phone_key(person.phone))
            or by_email.get(email_key(person.email))
        )
        if existing is None:
            fields = person.model_dump(exclude={"contact_id"})
            new_id = repo.create_contact(conn, user_id, fields)
            row = {"id": new_id, **fields}
            created += 1
        else:
            changes = {
                field: getattr(person, field)
                for field in FILLABLE
                if getattr(person, field) and not existing.get(field)
            }
            if changes:
                repo.update_contact(conn, user_id, existing["id"], changes)
                existing.update(changes)
                updated += 1
            else:
                unchanged += 1
            row = existing
        # Later entries in the same import can match earlier ones.
        if phone_key(row.get("phone")):
            by_phone[phone_key(row["phone"])] = row
        if email_key(row.get("email")):
            by_email[email_key(row["email"])] = row
    return ImportResponse(created=created, updated=updated, unchanged=unchanged)
