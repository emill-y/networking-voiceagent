"""Share contacts with another person by email.

    POST /shares                  share selected contacts (emails them when email is set up)
    GET  /shares/incoming         shares waiting for you to accept
    GET  /shares/link/{token}     a share opened from its link
    POST /shares/{id}/accept      add the shared contacts to your Nomi
    POST /shares/{id}/decline

Nothing is added to the recipient's contacts until they accept.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from psycopg import Connection

from app.core.auth import get_current_email, get_current_user_id
from app.core.config import get_settings
from app.core.db import get_db
from app.repositories import accounts as repo
from app.repositories import contacts as contacts_repo
from app.schemas.accounts import IncomingShare, ShareAccept, ShareAccepted, ShareCreated, ShareRequest
from app.services import email as mail
from app.services.calendar_sync import public_base
from app.services.contact_import import email_key

logger = logging.getLogger(__name__)
router = APIRouter()

# What travels with a shared contact: who they are, never your private notes.
SHARED_FIELDS = ("name", "email", "phone", "company", "role", "school", "major", "location",
                 "linkedin_url", "website_url")


def _incoming(row: dict) -> IncomingShare:
    contacts = row["contacts"] or []
    return IncomingShare(
        id=row["id"], sender_name=row["sender_name"], message=row["message"], count=len(contacts),
        names=[c.get("name", "") for c in contacts[:6]], created_at=row["created_at"],
    )


@router.post("/shares", response_model=ShareCreated, status_code=status.HTTP_201_CREATED)
def create_share(
    body: ShareRequest,
    request: Request,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    rows = contacts_repo.export_rows(conn, user_id, list(dict.fromkeys(body.contact_ids)))
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Those contacts weren’t found.")
    snapshot = [
        {**{k: r.get(k) for k in SHARED_FIELDS}, "interests": list(r.get("interests") or [])[:10]}
        for r in rows
    ]
    profile = repo.get_or_create_profile(conn, user_id)
    sender = profile["display_name"] or "A friend"
    share = repo.create_share(conn, user_id, sender, body.email, snapshot, body.message)
    settings = get_settings()
    link = f"{public_base(request, settings)}/app/shared/{share['token']}"
    count = len(snapshot)
    names = ", ".join(c["name"] for c in snapshot[:3]) + (f" and {count - 3} more" if count > 3 else "")
    text = (
        f"{sender} shared {count} contact{'s' if count != 1 else ''} with you on Nomi: {names}."
        + (f"\n\n“{body.message}”" if body.message else "")
        + "\n\nNomi is a second brain for your network. Sign in with this email to see and accept them."
    )
    emailed = mail.send(settings, body.email, f"{sender} shared contacts with you on Nomi", text,
                        ("Open in Nomi", link))
    return ShareCreated(id=share["id"], link=link, emailed=emailed, count=count)


@router.get("/shares/incoming", response_model=list[IncomingShare])
def incoming(conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id),
             email: str | None = Depends(get_current_email)):
    return [_incoming(r) for r in repo.incoming_shares(conn, user_id, email)]


@router.get("/shares/link/{token}", response_model=IncomingShare)
def by_link(token: str, conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    row = repo.share_by_token(conn, token)
    if not row or row["status"] != "pending" or row["sender_id"] == user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This share was already used or doesn’t exist.")
    return _incoming(row)


def _authorized_share(conn: Connection, share_id: UUID, user_id: UUID, email: str | None, token: str | None) -> dict:
    row = repo.share_by_id(conn, share_id)
    allowed = row and row["status"] == "pending" and row["sender_id"] != user_id and (
        (email and row["recipient_email"].lower() == email) or (token and token == row["token"])
    )
    if not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This share was already used or doesn’t exist.")
    return row


@router.post("/shares/{share_id}/accept", response_model=ShareAccepted)
def accept(share_id: UUID, body: ShareAccept, conn: Connection = Depends(get_db),
           user_id: UUID = Depends(get_current_user_id), email: str | None = Depends(get_current_email)):
    row = _authorized_share(conn, share_id, user_id, email, body.token)
    existing = contacts_repo.list_identity_fields(conn, user_id)
    known_emails = {email_key(c["email"]) for c in existing if c["email"]}
    known_names = {c["name"].strip().lower() for c in existing}
    added = skipped = 0
    for person in row["contacts"]:
        name = (person.get("name") or "").strip()
        if not name or (person.get("email") and email_key(person["email"]) in known_emails) or (
            not person.get("email") and name.lower() in known_names
        ):
            skipped += 1
            continue
        contact_id = contacts_repo.create_contact(conn, user_id, person)
        fields = {k: person.get(k) for k in ("linkedin_url", "website_url") if person.get(k)}
        if fields:
            contacts_repo.update_contact(conn, user_id, contact_id, fields)
        contacts_repo.create_interaction(
            conn, user_id, contact_id,
            {"interests": person.get("interests") or [], "notes": [f"Shared by {row['sender_name']}"]},
            None, "import", None,
        )
        contacts_repo.refresh_last_interaction(conn, user_id, contact_id)
        added += 1
    repo.respond_to_share(conn, share_id, user_id, "accepted")
    return ShareAccepted(added=added, skipped=skipped)


@router.post("/shares/{share_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline(share_id: UUID, body: ShareAccept, conn: Connection = Depends(get_db),
            user_id: UUID = Depends(get_current_user_id), email: str | None = Depends(get_current_email)):
    _authorized_share(conn, share_id, user_id, email, body.token)
    repo.respond_to_share(conn, share_id, user_id, "declined")
