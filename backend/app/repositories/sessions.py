"""Ambient sessions (see migration 20261007000000)."""

from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb

Row = dict[str, Any]
COLUMNS = ("id, user_id, title, status, segments, audio_seconds, windows, upload_token_hash, created_at, ended_at, "
           "owner_name, contact_ids")


def create(conn: Connection, user_id: UUID, title: str | None, token_hash: str, owner_name: str | None = None) -> Row:
    # Abandoned sessions (and their transcripts) don't linger; saved ones stay.
    conn.execute("delete from ambient_sessions where status <> 'saved' and updated_at < now() - interval '7 days'")
    return conn.execute(
        f"insert into ambient_sessions (user_id, title, upload_token_hash, owner_name) values (%s, %s, %s, %s) returning {COLUMNS}",
        (user_id, title, token_hash, owner_name),
    ).fetchone()


def recent(conn: Connection, user_id: UUID, limit: int = 100) -> list[Row]:
    return conn.execute(
        f"select {COLUMNS} from ambient_sessions where user_id = %s order by created_at desc limit %s",
        (user_id, limit),
    ).fetchall()


def save(conn: Connection, session_id: UUID, contact_ids: list[UUID]) -> None:
    """Keep the session as a record of who was met; drop its transcript."""
    conn.execute(
        """update ambient_sessions set status = 'saved', contact_ids = %s, segments = '[]', windows = '{}',
               ended_at = coalesce(ended_at, now()), updated_at = now() where id = %s""",
        (contact_ids, session_id),
    )


def contacts(conn: Connection, user_id: UUID, ids: list[UUID]) -> list[Row]:
    """The contacts a session created that still exist, in the session's order."""
    if not ids:
        return []
    rows = conn.execute(
        "select id, name, role, company, school from contacts where user_id = %s and id = any(%s)",
        (user_id, ids),
    ).fetchall()
    by_id = {row["id"]: row for row in rows}
    return [by_id[i] for i in ids if i in by_id]


def get(conn: Connection, session_id: UUID, lock: bool = False) -> Row | None:
    return conn.execute(
        f"select {COLUMNS} from ambient_sessions where id = %s" + (" for update" if lock else ""), (session_id,)
    ).fetchone()


def active(conn: Connection, user_id: UUID) -> Row | None:
    return conn.execute(
        f"""select {COLUMNS} from ambient_sessions
            where user_id = %s and status = 'recording' and created_at > now() - interval '12 hours'
            order by created_at desc limit 1""",
        (user_id,),
    ).fetchone()


def save_progress(conn: Connection, session_id: UUID, segments: list, audio_seconds: float, windows: dict) -> None:
    conn.execute(
        "update ambient_sessions set segments = %s, audio_seconds = %s, windows = %s, updated_at = now() where id = %s",
        (Jsonb(segments), audio_seconds, Jsonb(windows), session_id),
    )


def finish(conn: Connection, session_id: UUID, windows: dict) -> None:
    conn.execute(
        "update ambient_sessions set status = 'ready', windows = %s, ended_at = now(), updated_at = now() where id = %s",
        (Jsonb(windows), session_id),
    )


def delete(conn: Connection, user_id: UUID, session_id: UUID) -> bool:
    return conn.execute(
        "delete from ambient_sessions where user_id = %s and id = %s", (user_id, session_id)
    ).rowcount > 0
