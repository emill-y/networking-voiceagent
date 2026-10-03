"""Calendar connections and follow-up ↔ event links."""

from typing import Any
from uuid import UUID

from psycopg import Connection

Row = dict[str, Any]


def get_connection(conn: Connection, user_id: UUID) -> Row | None:
    return conn.execute(
        "select user_id, google_email, refresh_token_encrypted, push_follow_ups, needs_reauth "
        "from calendar_connections where user_id = %s",
        (user_id,),
    ).fetchone()


def save_connection(conn: Connection, user_id: UUID, email: str | None, refresh_token_encrypted: str) -> None:
    conn.execute(
        """
        insert into calendar_connections (user_id, google_email, refresh_token_encrypted)
        values (%s, %s, %s)
        on conflict (user_id) do update
          set google_email = excluded.google_email,
              refresh_token_encrypted = excluded.refresh_token_encrypted,
              needs_reauth = false,
              updated_at = now()
        """,
        (user_id, email, refresh_token_encrypted),
    )


def delete_connection(conn: Connection, user_id: UUID) -> None:
    conn.execute("delete from calendar_connections where user_id = %s", (user_id,))
    conn.execute(
        "update follow_ups set calendar_event_id = null, calendar_event_link = null where user_id = %s", (user_id,)
    )


def mark_needs_reauth(conn: Connection, user_id: UUID) -> None:
    conn.execute(
        "update calendar_connections set needs_reauth = true, updated_at = now() where user_id = %s",
        (user_id,),
    )


def set_push(conn: Connection, user_id: UUID, push: bool) -> None:
    conn.execute(
        "update calendar_connections set push_follow_ups = %s, updated_at = now() where user_id = %s",
        (push, user_id),
    )


def follow_up_for_calendar(conn: Connection, user_id: UUID, follow_up_id: UUID) -> Row | None:
    return conn.execute(
        """
        select f.id, f.action, f.due_at, f.status, f.calendar_event_id, f.calendar_event_link, f.contact_id,
               c.name as contact_name
        from follow_ups f join contacts c on c.id = f.contact_id
        where f.user_id = %s and f.id = %s
        """,
        (user_id, follow_up_id),
    ).fetchone()


def set_event_id(
    conn: Connection, user_id: UUID, follow_up_id: UUID, event_id: str | None, link: str | None = None
) -> None:
    conn.execute(
        "update follow_ups set calendar_event_id = %s, calendar_event_link = %s where user_id = %s and id = %s",
        (event_id, link if event_id else None, user_id, follow_up_id),
    )


def event_ids(conn: Connection, user_id: UUID, contact_id: UUID | None = None) -> list[str]:
    rows = conn.execute(
        "select calendar_event_id from follow_ups where user_id = %s and calendar_event_id is not null"
        + (" and contact_id = %s" if contact_id else ""),
        (user_id, contact_id) if contact_id else (user_id,),
    ).fetchall()
    return [row["calendar_event_id"] for row in rows]
