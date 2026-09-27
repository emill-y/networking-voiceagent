import uuid

from app.services.network import build_network, interest_terms
from tests.conftest import OTHER_USER_ID
from tests.test_contacts import capture


def contact(name, company=None, school=None, role=None):
    return {"id": uuid.uuid4(), "name": name, "company": company, "school": school, "role": role,
            "last_interaction_at": None, "open_follow_ups": 0}


def moment(person, event=None, projects=(), interests=(), topics=(), needs=()):
    return {"contact_id": person["id"], "event": event, "projects": list(projects),
            "interests": list(interests), "topics_discussed": list(topics), "needs": list(needs)}


def test_interest_terms_skip_generic_words():
    assert interest_terms(["a robotics startup", "ML engineers", "AI"]) == {
        "robotic": "robotics", "engineer": "engineers"}


def test_links_come_with_reasons():
    jason = contact("Jason", school="UC Berkeley")
    maya = contact("Maya", school="uc berkeley")
    emma = contact("Emma", company="Figma")
    alex = contact("Alex")
    result = build_network(
        [jason, maya, emma, alex],
        [
            moment(jason, event="Cal Hacks", projects=["robotics startup"]),
            moment(maya, projects=["Robotics"]),
            moment(emma, event="cal hacks"),
            moment(alex),
        ],
    )
    edges = {(e.kind, frozenset((e.source, e.target))): e.reasons for e in result.edges}
    pair = lambda a, b: frozenset((str(a["id"]), str(b["id"])))  # noqa: E731
    assert edges[("organization", pair(jason, maya))] == ["Both at UC Berkeley"]
    assert edges[("interests", pair(jason, maya))] == ["Both into robotics"]
    assert edges[("event", pair(jason, emma))] == ["Both met at Cal Hacks"]
    assert not any(str(alex["id"]) in key[1] for key in edges)  # no evidence, no link
    assert {p.name: p.moments for p in result.people}["Jason"] == 1
    assert result.groups == []


def test_big_groups_become_hubs():
    people = [contact(f"P{i}") for i in range(6)]
    result = build_network(people, [moment(p, event="YC Demo Day") for p in people])
    assert [(g.label, g.members, g.edge_kind) for g in result.groups] == [("YC Demo Day", 6, "event")]
    assert len(result.edges) == 6  # one spoke each, not 15 pairwise lines
    assert {e.target for e in result.edges} == {"event:yc demo day"}


def test_network_endpoint_is_scoped_to_the_user(db_client):
    capture(db_client, {"contact": {"name": "Jason", "company": "Figma"},
                        "interaction": {"event": "Config"}})
    capture(db_client, {"contact": {"name": "Emma", "company": "figma"},
                        "interaction": {"event": "Config"}})
    body = db_client.get("/network").json()
    assert sorted(p["name"] for p in body["people"]) == ["Emma", "Jason"]
    assert {e["kind"] for e in body["edges"]} == {"organization", "event"}
    assert body["edges"][0]["reasons"]
    db_client.act_as(OTHER_USER_ID)
    assert db_client.get("/network").json() == {"people": [], "groups": [], "edges": []}


def test_everyday_meetings_are_not_shared_events():
    a, b = contact("A"), contact("B")
    result = build_network([a, b], [moment(a, event="Coffee"), moment(b, event="coffee")])
    assert result.edges == []
