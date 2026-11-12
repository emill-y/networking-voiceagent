"""Your saved voice (see migration 20261112020000)."""

from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg.types.json import Jsonb

Row = dict[str, Any]


def get(conn: Connection, user_id: UUID) -> Row | None:
    return conn.execute(
        "select print, seconds, updated_at from voiceprints where user_id = %s", (user_id,)
    ).fetchone()


def save(conn: Connection, user_id: UUID, print_: list[float], seconds: float) -> Row:
    return conn.execute(
        """insert into voiceprints (user_id, print, seconds) values (%s, %s, %s)
           on conflict (user_id) do update set print = excluded.print, seconds = excluded.seconds, updated_at = now()
           returning print, seconds, updated_at""",
        (user_id, Jsonb(print_), seconds),
    ).fetchone()


def delete(conn: Connection, user_id: UUID) -> None:
    conn.execute("delete from voiceprints where user_id = %s", (user_id,))
