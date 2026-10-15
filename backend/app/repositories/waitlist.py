"""Waitlist signups (see migration 20261015000000)."""

from typing import Any

from psycopg import Connection

Row = dict[str, Any]
COLUMNS = "id, name, school, email, referral_code, referred_by, friend_code, welcome_sent_at, created_at"


def by_email(conn: Connection, email: str) -> Row | None:
    return conn.execute(f"select {COLUMNS} from waitlist where lower(email) = lower(%s)", (email,)).fetchone()


def by_code(conn: Connection, code: str) -> Row | None:
    return conn.execute(f"select {COLUMNS} from waitlist where referral_code = %s", (code,)).fetchone()


def code_exists(conn: Connection, code: str) -> bool:
    return conn.execute("select 1 from waitlist where referral_code = %s", (code,)).fetchone() is not None


def add(conn: Connection, name: str, school: str, email: str, referral_code: str, referred_by: str | None,
        friend_code: str) -> Row | None:
    """None when the email is already on the list (a race with another signup)."""
    return conn.execute(
        f"""insert into waitlist (name, school, email, referral_code, referred_by, friend_code)
            values (%s, %s, %s, %s, %s, %s)
            on conflict do nothing
            returning {COLUMNS}""",
        (name, school, email, referral_code, referred_by, friend_code),
    ).fetchone()


def position(conn: Connection, row: Row) -> int:
    return conn.execute("select count(*) as n from waitlist where created_at <= %s", (row["created_at"],)).fetchone()["n"]


def referrals(conn: Connection, code: str) -> int:
    return conn.execute("select count(*) as n from waitlist where referred_by = %s", (code,)).fetchone()["n"]


def total(conn: Connection) -> int:
    return conn.execute("select count(*) as n from waitlist").fetchone()["n"]


def mark_welcomed(conn: Connection, row_id) -> None:
    conn.execute("update waitlist set welcome_sent_at = now() where id = %s", (row_id,))
