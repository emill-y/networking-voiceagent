"""Ambient sessions (see migration 20261007000000)."""

from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb

Row = dict[str, Any]
COLUMNS = "id, user_id, title, status, segments, audio_seconds, windows, upload_token_hash, created_at, ended_at"


def create(conn: Connection, user_id: UUID, title: str | None, token_hash: str) -> Row:
    # Abandoned sessions (and their transcripts) don't linger.
    conn.execute("delete from ambient_sessions where updated_at < now() - interval '7 days'")
    return conn.execute(
        f"insert into ambient_sessions (user_id, title, upload_token_hash) values (%s, %s, %s) returning {COLUMNS}",
        (user_id, title, token_hash),
    ).fetchone()


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
