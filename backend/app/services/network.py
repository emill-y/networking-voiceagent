"""How the people you know connect to each other.

Evidence only, never inference: two people are linked when your own notes
say they share a company or school, you met them at the same event, or
their projects/interests/needs/topics overlap. Each link carries the
reasons, so the map can explain itself.

Small groups become direct person-to-person links. Big groups (5+ people)
get a hub node instead, so 30 people from one hackathon draw 30 lines to
"Cal Hacks" rather than 435 lines between each other.
"""

import re
from collections import defaultdict
from itertools import combinations
from typing import Any
from uuid import UUID

from psycopg import Connection

from app.schemas.network import NetworkEdge, NetworkGroup, NetworkPerson, NetworkResponse
from app.services.identity import normalize

HUB_THRESHOLD = 5
MAX_PEOPLE = 300
STOPWORDS = {
    "and", "the", "for", "with", "from", "into", "about", "their", "they", "them", "this",
    "that", "some", "startup", "company", "project", "working", "work", "stuff", "things",
    "people", "looking", "new", "app", "team",
}


def interest_terms(items: list[str]) -> dict[str, str]:
    """'a robotics startup', 'ML engineers' -> {'robotic': 'robotics', 'engineer': 'engineers'}.

    Keys are crude stems for matching ('designer' ~ 'designers'); values are
    the words as spoken, for labels. Short and generic words are dropped so
    'the' or 'startup' don't link everyone."""
    terms: dict[str, str] = {}
    for item in items:
        for word in re.findall(r"[a-z0-9+#]+", item.lower()):
            stem = word[:-1] if len(word) > 4 and word.endswith("s") else word
            if len(stem) >= 4 and stem not in STOPWORDS and word not in STOPWORDS:
                terms.setdefault(stem, word)
    return terms


def _subtitle(row: dict[str, Any]) -> str | None:
    if row["role"] and row["company"]:
        return f"{row['role']} at {row['company']}"
    return row["role"] or row["company"] or row["school"]


def build_network(contacts: list[dict[str, Any]], moments: list[dict[str, Any]]) -> NetworkResponse:
    contacts = contacts[:MAX_PEOPLE]
    ids = {row["id"] for row in contacts}

    # key -> (kind, display label) and key -> member ids
    labels: dict[tuple[str, str], str] = {}
    members: dict[tuple[str, str], set[UUID]] = defaultdict(set)

    def add(kind: str, raw: str | None, person: UUID, label: str | None = None) -> None:
        key = normalize(raw)
        if not key:
            return
        labels.setdefault((kind, key), label or raw.strip())
        members[(kind, key)].add(person)

    for row in contacts:
        add("organization", row["company"], row["id"])
        add("organization", row["school"], row["id"])

    for moment in moments:
        person = moment["contact_id"]
        if person not in ids:
            continue
        add("event", moment["event"], person)
        words = interest_terms(
            moment["projects"] + moment["interests"] + moment["topics_discussed"] + moment["needs"]
        )
        for stem, word in words.items():
            add("interests", stem, person, label=word)

    groups: list[NetworkGroup] = []
    pair_reasons: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    edges: list[NetworkEdge] = []

    for (kind, key), people in sorted(members.items(), key=lambda item: -len(item[1])):
        if len(people) < 2:
            continue
        label = labels[(kind, key)]
        reason = {
            "organization": f"Both at {label}",
            "event": f"Both met at {label}",
            "interests": f"Both into {label}",
        }[kind]
        if len(people) >= HUB_THRESHOLD and kind != "interests":
            group_id = f"{kind}:{key}"
            groups.append(NetworkGroup(id=group_id, label=label, edge_kind=kind, members=len(people)))
            for person in people:
                edges.append(NetworkEdge(source=str(person), target=group_id, kind=kind, reasons=[label]))
            continue
        for a, b in combinations(sorted(people, key=str), 2):
            reasons = pair_reasons[(str(a), str(b), kind)]
            if reason not in reasons:
                reasons.append(reason)

    for (a, b, kind), reasons in pair_reasons.items():
        edges.append(NetworkEdge(source=a, target=b, kind=kind, reasons=reasons[:3]))

    counts: dict[UUID, int] = defaultdict(int)
    for moment in moments:
        counts[moment["contact_id"]] += 1
    people = [
        NetworkPerson(
            id=row["id"],
            name=row["name"],
            subtitle=_subtitle(row),
            moments=counts[row["id"]],
            last_interaction_at=row["last_interaction_at"],
            open_follow_ups=row["open_follow_ups"],
        )
        for row in contacts
    ]
    return NetworkResponse(people=people, groups=groups, edges=edges)


def get_network(conn: Connection, user_id: UUID) -> NetworkResponse:
    contacts = conn.execute(
        """
        select c.id, c.name, c.company, c.role, c.school, c.last_interaction_at,
               (select count(*) from follow_ups f
                 where f.contact_id = c.id and f.status = 'open')::int as open_follow_ups
        from contacts c
        where c.user_id = %s
        order by c.last_interaction_at desc nulls last
        limit %s
        """,
        (user_id, MAX_PEOPLE),
    ).fetchall()
    moments = conn.execute(
        "select contact_id, event, projects, interests, topics as topics_discussed, needs "
        "from interactions where user_id = %s",
        (user_id,),
    ).fetchall()
    return build_network(contacts, moments)
