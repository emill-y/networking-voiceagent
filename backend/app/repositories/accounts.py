"""Profiles (photo, display name, invite code), invite redemptions and contact shares."""

import secrets
import string
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb

Row = dict[str, Any]
CODE_ALPHABET = string.ascii_lowercase + string.digits


def _new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def get_or_create_profile(conn: Connection, user_id: UUID) -> Row:
    row = conn.execute(
        "select display_name, avatar, invite_code from user_profiles where user_id = %s", (user_id,)
    ).fetchone()
    if row:
        return row
    for _ in range(5):
        created = conn.execute(
            """
            insert into user_profiles (user_id, invite_code) values (%s, %s)
            on conflict do nothing
            returning display_name, avatar, invite_code
            """,
            (user_id, _new_code()),
        ).fetchone()
        if created:
            return created
        existing = conn.execute(
            "select display_name, avatar, invite_code from user_profiles where user_id = %s", (user_id,)
        ).fetchone()
        if existing:
            return existing
    raise RuntimeError("Couldn't create an invite code.")


def update_profile(conn: Connection, user_id: UUID, changes: dict[str, Any]) -> None:
    get_or_create_profile(conn, user_id)
    allowed = {k: v for k, v in changes.items() if k in {"display_name", "avatar"}}
    if not allowed:
        return
    assignments = ", ".join(f"{k} = %s" for k in allowed)
    conn.execute(
        f"update user_profiles set {assignments}, updated_at = now() where user_id = %s",
        (*allowed.values(), user_id),
    )


def invited_count(conn: Connection, user_id: UUID) -> int:
    return conn.execute(
        "select count(*)::int as n from invite_redemptions where inviter_id = %s", (user_id,)
    ).fetchone()["n"]


def redeem_invite(conn: Connection, invitee_id: UUID, code: str) -> bool:
    inviter = conn.execute(
        "select user_id from user_profiles where invite_code = %s", (code.strip().lower(),)
    ).fetchone()
    if not inviter or inviter["user_id"] == invitee_id:
        return False
    result = conn.execute(
        "insert into invite_redemptions (invitee_id, inviter_id) values (%s, %s) on conflict do nothing",
        (invitee_id, inviter["user_id"]),
    )
    return result.rowcount == 1


# ---------- Shares ----------

SHARE_COLUMNS = "id, sender_name, recipient_email, contacts, message, token, status, created_at"


def create_share(conn: Connection, sender_id: UUID, sender_name: str, email: str,
                 contacts: list[dict], message: str | None) -> Row:
    return conn.execute(
        f"""
        insert into contact_shares (sender_id, sender_name, recipient_email, contacts, message, token)
        values (%s, %s, %s, %s, %s, %s)
        returning {SHARE_COLUMNS}
        """,
        (sender_id, sender_name, email.lower(), Jsonb(contacts), message, secrets.token_urlsafe(24)),
    ).fetchone()


def incoming_shares(conn: Connection, user_id: UUID, email: str | None) -> list[Row]:
    return conn.execute(
        f"""
        select {SHARE_COLUMNS} from contact_shares
        where status = 'pending' and sender_id <> %s
          and (recipient_id = %s or (%s::text is not null and lower(recipient_email) = %s))
        order by created_at desc
        """,
        (user_id, user_id, email, email),
    ).fetchall()


def share_by_token(conn: Connection, token: str) -> Row | None:
    return conn.execute(f"select {SHARE_COLUMNS}, sender_id from contact_shares where token = %s", (token,)).fetchone()


def share_by_id(conn: Connection, share_id: UUID) -> Row | None:
    return conn.execute(f"select {SHARE_COLUMNS}, sender_id from contact_shares where id = %s", (share_id,)).fetchone()


def respond_to_share(conn: Connection, share_id: UUID, user_id: UUID, status: str) -> None:
    conn.execute(
        "update contact_shares set status = %s, recipient_id = %s, responded_at = now() where id = %s",
        (status, user_id, share_id),
    )
