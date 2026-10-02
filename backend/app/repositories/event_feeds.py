"""Public calendar feeds someone added to find events."""

from typing import Any
from uuid import UUID

from psycopg import Connection

Row = dict[str, Any]


def list_feeds(conn: Connection, user_id: UUID) -> list[Row]:
    return conn.execute(
        "select id, url, label, created_at from event_feeds where user_id = %s order by created_at",
        (user_id,),
    ).fetchall()


def add_feed(conn: Connection, user_id: UUID, url: str, label: str) -> Row | None:
    """None if this feed was already added."""
    return conn.execute(
        """
        insert into event_feeds (user_id, url, label) values (%s, %s, %s)
        on conflict (user_id, url) do nothing
        returning id, url, label, created_at
        """,
        (user_id, url, label),
    ).fetchone()


def delete_feed(conn: Connection, user_id: UUID, feed_id: UUID) -> bool:
    return conn.execute(
        "delete from event_feeds where user_id = %s and id = %s", (user_id, feed_id)
    ).rowcount > 0


def delete_all(conn: Connection, user_id: UUID) -> None:
    conn.execute("delete from event_feeds where user_id = %s", (user_id,))
