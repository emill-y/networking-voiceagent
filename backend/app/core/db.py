"""Database connections (PostgreSQL / Supabase) via psycopg 3.

Each request gets its own connection and transaction: the transaction
commits if the request succeeds and rolls back if it raises. That keeps
multi-row writes (contact + interaction + follow-up) all-or-nothing.

A connection per request is simple and fine at MVP scale; a connection
pool is the upgrade path when traffic grows.
"""

from collections.abc import Iterator

import psycopg
from fastapi import HTTPException, status
from psycopg.rows import dict_row

from app.core.config import get_settings


def get_db() -> Iterator[psycopg.Connection]:
    """FastAPI dependency yielding a connection inside a transaction."""
    url = get_settings().database_url
    if not url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Database is not configured (DATABASE_URL)."
        )
    try:
        conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=5)
    except psycopg.OperationalError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database is unavailable.") from exc
    # `with conn` commits on success, rolls back on exception, then closes.
    with conn:
        yield conn
