"""Search SQL. Every clause is fixed text; only values are parameters."""

from typing import Any
from uuid import UUID

from psycopg import Connection

from app.schemas.search import SearchFilters

# One searchable text per person: their details, every moment, every follow-up.
DOCUMENT_SQL = """
    concat_ws(' ', c.name, c.company, c.role, c.school, c.major, c.location, c.summary,
      (select string_agg(concat_ws(' ', i.event, i.location,
                array_to_string(i.projects, ' '), array_to_string(i.needs, ' '),
                array_to_string(i.topics, ' '), array_to_string(i.interests, ' '),
                array_to_string(i.notes, ' ')), ' ')
         from interactions i where i.contact_id = c.id),
      (select string_agg(f.action, ' ') from follow_ups f where f.contact_id = c.id))
"""


def _like(value: str) -> str:
    """Substring pattern with LIKE wildcards in the input escaped."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search_contacts(conn: Connection, user_id: UUID, filters: SearchFilters, limit: int = 25) -> list[dict[str, Any]]:
    where = ["c.user_id = %(user_id)s"]
    params: dict[str, Any] = {"user_id": user_id, "limit": limit}

    for field in ("company", "role", "school", "location"):
        value = getattr(filters, field)
        if value:
            where.append(f"c.{field} ilike %({field})s")
            params[field] = _like(value)

    moment_conditions = []
    if filters.event:
        moment_conditions.append("i.event ilike %(event)s")
        params["event"] = _like(filters.event)
    if filters.met_after:
        moment_conditions.append("i.interaction_date >= %(met_after)s")
        params["met_after"] = filters.met_after
    if filters.met_before:
        moment_conditions.append("i.interaction_date < (%(met_before)s::date + 1)")
        params["met_before"] = filters.met_before
    if moment_conditions:
        # The same moment must satisfy all of them ("met at X in the last week").
        where.append(
            "exists (select 1 from interactions i where i.contact_id = c.id and "
            + " and ".join(moment_conditions) + ")"
        )

    if filters.has_open_follow_up is not None:
        where.append(
            ("" if filters.has_open_follow_up else "not ")
            + "exists (select 1 from follow_ups f where f.contact_id = c.id and f.status = 'open')"
        )

    for n, keyword in enumerate(filters.keywords):
        # Full-text search handles word forms ("designers" ~ "designer");
        # the substring match catches names and partial words.
        where.append(
            f"(to_tsvector('english', {DOCUMENT_SQL}) @@ plainto_tsquery('english', %(kw{n})s)"
            f" or {DOCUMENT_SQL} ilike %(kwlike{n})s)"
        )
        params[f"kw{n}"] = keyword
        params[f"kwlike{n}"] = _like(keyword)

    return conn.execute(
        f"""
        select c.id, c.name, c.company, c.role, c.school, c.last_interaction_at,
               (select i.event from interactions i where i.contact_id = c.id
                 order by i.interaction_date desc limit 1) as last_event,
               (select count(*) from follow_ups f
                 where f.contact_id = c.id and f.status = 'open')::int as open_follow_ups
        from contacts c
        where {" and ".join(where)}
        order by c.last_interaction_at desc nulls last
        limit %(limit)s
        """,
        params,
    ).fetchall()


def people_profiles(conn: Connection, user_id: UUID, limit: int = 500) -> list[dict[str, Any]]:
    """Everything known about each person, for the model to read when ranking."""
    return conn.execute(
        """
        select c.id, c.name, c.company, c.role, c.school, c.major, c.location, c.summary,
               c.last_interaction_at,
               coalesce((select json_agg(json_build_object(
                          'event', i.event, 'date', i.interaction_date::date,
                          'projects', i.projects, 'needs', i.needs, 'topics', i.topics,
                          'interests', i.interests, 'notes', i.notes,
                          'said', left(i.raw_transcript, 400))
                        order by i.interaction_date desc)
                 from interactions i where i.contact_id = c.id), '[]'::json) as moments,
               coalesce((select array_agg(f.action order by f.created_at) from follow_ups f
                 where f.contact_id = c.id and f.status = 'open'), '{}') as open_follow_ups
        from contacts c
        where c.user_id = %(user_id)s
        order by c.last_interaction_at desc nulls last
        limit %(limit)s
        """,
        {"user_id": user_id, "limit": limit},
    ).fetchall()


def contact_summaries(conn: Connection, user_id: UUID, ids: list[UUID]) -> dict[UUID, dict[str, Any]]:
    rows = conn.execute(
        """
        select c.id, c.name, c.company, c.role, c.school, c.last_interaction_at,
               (select i.event from interactions i where i.contact_id = c.id
                 order by i.interaction_date desc limit 1) as last_event,
               (select count(*) from follow_ups f
                 where f.contact_id = c.id and f.status = 'open')::int as open_follow_ups
        from contacts c
        where c.user_id = %(user_id)s and c.id = any(%(ids)s)
        """,
        {"user_id": user_id, "ids": ids},
    ).fetchall()
    return {row["id"]: row for row in rows}
