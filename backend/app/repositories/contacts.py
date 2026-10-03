"""SQL for contacts, interactions and follow-ups.

Every function takes the caller's `user_id` and includes it in the WHERE
clause, so one user can never read or change another user's rows even if
they guess an id. All values are passed as query parameters (%s), never
formatted into SQL strings, which prevents SQL injection.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from psycopg import Connection

Row = dict[str, Any]

CONTACT_COLUMNS = (
    "id, name, company, role, school, major, location, email, phone, linkedin_url, "
    "website_url, summary, last_interaction_at, created_at"
)
UPDATABLE_CONTACT_FIELDS = {
    "name", "company", "role", "school", "major", "location", "email", "phone",
    "linkedin_url", "website_url", "summary",
}
INTERACTION_COLUMNS = (
    "id, contact_id, event, location, summary, raw_transcript, interests, projects, needs, "
    "topics as topics_discussed, notes, interaction_date, source_type"
)
# Each follow-up comes with what it's about: the person's role and the
# moment it came from (or their latest one), so the list can say why.
FOLLOW_UP_SELECT = """
    select f.id, f.contact_id, c.name as contact_name, f.interaction_id, f.action,
           f.due_at, f.status, f.created_at, f.completed_at,
           f.calendar_event_id, f.calendar_event_link,
           c.role as contact_role, c.company as contact_company, c.school as contact_school,
           m.event as moment_event, m.needs as moment_needs, m.projects as moment_projects,
           m.topics as moment_topics, m.interaction_date as moment_date
    from follow_ups f
    join contacts c on c.id = f.contact_id
    left join lateral (
      select i.event, i.needs, i.projects, i.topics, i.interaction_date
      from interactions i
      where i.contact_id = f.contact_id and (f.interaction_id is null or i.id = f.interaction_id)
      order by (i.id = f.interaction_id) desc nulls last, i.interaction_date desc
      limit 1
    ) m on true
"""


# ---------- Contacts ----------


def list_contacts(conn: Connection, user_id: UUID, limit: int | None = 50) -> list[Row]:
    """Most recently seen first. limit=None returns everyone.

    Includes what Contacts filters on: interests, events, location, and how
    often you've met.
    """
    return conn.execute(
        """
        select c.id, c.name, c.company, c.role, c.school, c.major, c.location, c.email, c.phone,
               c.last_interaction_at, c.created_at,
               (select i.event from interactions i
                 where i.contact_id = c.id
                 order by i.interaction_date desc limit 1) as last_event,
               (select count(*) from follow_ups f
                 where f.contact_id = c.id and f.status = 'open')::int as open_follow_ups,
               (select count(*) from interactions i where i.contact_id = c.id)::int as moments,
               (select min(i.interaction_date) from interactions i where i.contact_id = c.id) as first_met_at,
               coalesce((select array_agg(distinct lower(x)) from interactions i, unnest(i.interests) x
                          where i.contact_id = c.id), '{}') as interests,
               coalesce((select array_agg(distinct i.event) from interactions i
                          where i.contact_id = c.id and i.event is not null), '{}') as events
        from contacts c
        where c.user_id = %s
        order by c.last_interaction_at desc nulls last, c.created_at desc
        limit %s
        """,
        (user_id, limit),
    ).fetchall()


def export_rows(conn: Connection, user_id: UUID, ids: list[UUID] | None) -> list[Row]:
    """Everything stored about each person, for a spreadsheet. ids=None: everyone."""
    return conn.execute(
        """
        select c.id, c.name, c.email, c.phone, c.company, c.role, c.school, c.major, c.location,
               c.linkedin_url, c.website_url, c.summary, c.last_interaction_at,
               (select min(i.interaction_date) from interactions i where i.contact_id = c.id) as first_met_at,
               (select count(*) from interactions i where i.contact_id = c.id)::int as moments,
               coalesce((select array_agg(distinct x) from interactions i, unnest(i.interests) x where i.contact_id = c.id), '{}') as interests,
               coalesce((select array_agg(distinct x) from interactions i, unnest(i.projects) x where i.contact_id = c.id), '{}') as projects,
               coalesce((select array_agg(distinct x) from interactions i, unnest(i.needs) x where i.contact_id = c.id), '{}') as needs,
               coalesce((select array_agg(distinct x) from interactions i, unnest(i.topics) x where i.contact_id = c.id), '{}') as topics,
               coalesce((select array_agg(distinct x) from interactions i, unnest(i.notes) x where i.contact_id = c.id), '{}') as notes,
               coalesce((select array_agg(distinct i.event) from interactions i
                          where i.contact_id = c.id and i.event is not null), '{}') as events,
               coalesce((select array_agg(f.action order by f.due_at nulls last) from follow_ups f
                          where f.contact_id = c.id and f.status = 'open'), '{}') as open_follow_ups
        from contacts c
        where c.user_id = %(user_id)s and (%(all)s or c.id = any(%(ids)s))
        order by lower(c.name)
        """,
        {"user_id": user_id, "all": ids is None, "ids": ids or []},
    ).fetchall()


def list_identity_fields(conn: Connection, user_id: UUID) -> list[Row]:
    """The fields duplicate detection compares against."""
    return conn.execute(
        "select id, name, company, role, school, email, phone, last_interaction_at "
        "from contacts where user_id = %s",
        (user_id,),
    ).fetchall()


def get_contact(conn: Connection, user_id: UUID, contact_id: UUID) -> Row | None:
    return conn.execute(
        f"select {CONTACT_COLUMNS} from contacts where user_id = %s and id = %s",
        (user_id, contact_id),
    ).fetchone()


def create_contact(conn: Connection, user_id: UUID, fields: dict[str, Any]) -> UUID:
    row = conn.execute(
        """
        insert into contacts (user_id, name, company, role, school, major, location, email, phone)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            user_id, fields["name"], fields.get("company"), fields.get("role"),
            fields.get("school"), fields.get("major"), fields.get("location"),
            fields.get("email"), fields.get("phone"),
        ),
    ).fetchone()
    return row["id"]


def update_contact(conn: Connection, user_id: UUID, contact_id: UUID, changes: dict[str, Any]) -> bool:
    """Apply `changes` (column -> value). Returns False if no such contact."""
    changes = {k: v for k, v in changes.items() if k in UPDATABLE_CONTACT_FIELDS}
    if not changes:
        return get_contact(conn, user_id, contact_id) is not None
    # Column names come from the fixed allow-list above, never from input.
    assignments = ", ".join(f"{column} = %s" for column in changes)
    result = conn.execute(
        f"update contacts set {assignments} where user_id = %s and id = %s",
        (*changes.values(), user_id, contact_id),
    )
    return result.rowcount == 1


def delete_contact(conn: Connection, user_id: UUID, contact_id: UUID) -> bool:
    # Interactions and follow-ups are removed by ON DELETE CASCADE.
    result = conn.execute(
        "delete from contacts where user_id = %s and id = %s", (user_id, contact_id)
    )
    return result.rowcount == 1


def refresh_last_interaction(conn: Connection, user_id: UUID, contact_id: UUID) -> None:
    conn.execute(
        """
        update contacts set last_interaction_at = (
          select max(interaction_date) from interactions
          where contact_id = %s and user_id = %s
        )
        where id = %s and user_id = %s
        """,
        (contact_id, user_id, contact_id, user_id),
    )


# ---------- Interactions ----------


def create_interaction(
    conn: Connection,
    user_id: UUID,
    contact_id: UUID,
    fields: dict[str, Any],
    raw_transcript: str | None,
    source_type: str,
    interaction_date: datetime | None,
) -> UUID:
    row = conn.execute(
        """
        insert into interactions (
          user_id, contact_id, raw_transcript, event, location,
          interests, projects, needs, topics, notes, source_type, interaction_date
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s, now()))
        returning id
        """,
        (
            user_id, contact_id, raw_transcript, fields.get("event"), fields.get("location"),
            fields.get("interests", []), fields.get("projects", []), fields.get("needs", []),
            fields.get("topics_discussed", []), fields.get("notes", []),
            source_type, interaction_date,
        ),
    ).fetchone()
    return row["id"]


def list_interactions(conn: Connection, user_id: UUID, contact_id: UUID) -> list[Row]:
    return conn.execute(
        f"select {INTERACTION_COLUMNS} from interactions "
        "where user_id = %s and contact_id = %s order by interaction_date desc",
        (user_id, contact_id),
    ).fetchall()


def delete_interaction(conn: Connection, user_id: UUID, interaction_id: UUID) -> UUID | None:
    """Deletes one interaction; returns its contact_id, or None if not found."""
    row = conn.execute(
        "delete from interactions where user_id = %s and id = %s returning contact_id",
        (user_id, interaction_id),
    ).fetchone()
    return row["contact_id"] if row else None


# ---------- Follow-ups ----------


def create_follow_up(
    conn: Connection,
    user_id: UUID,
    contact_id: UUID,
    interaction_id: UUID | None,
    action: str,
    due_at: datetime | None,
) -> UUID:
    row = conn.execute(
        """
        insert into follow_ups (user_id, contact_id, interaction_id, action, due_at)
        values (%s, %s, %s, %s, %s)
        returning id
        """,
        (user_id, contact_id, interaction_id, action, due_at),
    ).fetchone()
    return row["id"]


def get_follow_up(conn: Connection, user_id: UUID, follow_up_id: UUID) -> Row | None:
    return conn.execute(
        FOLLOW_UP_SELECT + " where f.user_id = %s and f.id = %s", (user_id, follow_up_id)
    ).fetchone()


def list_follow_ups(
    conn: Connection, user_id: UUID, status: str | None = None, contact_id: UUID | None = None
) -> list[Row]:
    return conn.execute(
        FOLLOW_UP_SELECT
        + """
        where f.user_id = %s
          and (%s::text is null or f.status = %s)
          and (%s::uuid is null or f.contact_id = %s)
        order by (f.status = 'open') desc, f.due_at asc nulls last, f.created_at desc
        """,
        (user_id, status, status, contact_id, contact_id),
    ).fetchall()


def update_follow_up(conn: Connection, user_id: UUID, follow_up_id: UUID, changes: dict[str, Any]) -> bool:
    allowed = {k: v for k, v in changes.items() if k in {"action", "due_at", "status"}}
    if not allowed:
        return get_follow_up(conn, user_id, follow_up_id) is not None
    assignments = [f"{column} = %s" for column in allowed]
    values = list(allowed.values())
    if "status" in allowed:
        # completed_at records when something was marked done.
        assignments.append("completed_at = case when %s = 'done' then now() else null end")
        values.append(allowed["status"])
    result = conn.execute(
        f"update follow_ups set {', '.join(assignments)} where user_id = %s and id = %s",
        (*values, user_id, follow_up_id),
    )
    return result.rowcount == 1
