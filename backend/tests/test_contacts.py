import psycopg

from tests.conftest import OTHER_USER_ID, USER_ID

TRANSCRIPT = "Today I met Jason Chen at a Berkeley founders mixer..."


def jason(**overrides):
    person = {
        "contact": {"name": "Jason Chen", "role": "Founder", "school": "UC Berkeley", "major": "EECS"},
        "interaction": {
            "event": "Berkeley founders mixer",
            "projects": ["robotics startup"],
            "needs": ["designers"],
            "topicsDiscussed": ["Magic Hour"],
        },
        "followUp": {"action": "Reach out next week"},
    }
    person.update(overrides)
    return person


def capture(client, *people, transcript=TRANSCRIPT):
    response = client.post("/captures", json={"transcript": transcript, "people": list(people)})
    assert response.status_code == 201, response.text
    return response.json()["saved"]


def test_capture_saves_contact_interaction_and_follow_up(db_client):
    saved = capture(db_client, jason())
    assert saved[0]["created"] is True

    profile = db_client.get(f"/contacts/{saved[0]['contactId']}").json()
    assert profile["name"] == "Jason Chen"
    assert profile["lastInteractionAt"] is not None
    [moment] = profile["interactions"]
    assert moment["event"] == "Berkeley founders mixer"
    assert moment["topicsDiscussed"] == ["Magic Hour"]
    assert moment["rawTranscript"] == TRANSCRIPT
    assert moment["sourceType"] == "voice"
    [follow_up] = profile["followUps"]
    assert follow_up["action"] == "Reach out next week"
    assert follow_up["status"] == "open"
    assert follow_up["interactionId"] == moment["id"]


def test_second_meeting_adds_to_the_timeline_without_overwriting(db_client):
    first = capture(db_client, jason())[0]
    second = capture(
        db_client,
        {
            "contactId": first["contactId"],
            "contact": {"name": "Jason", "company": "Robo Inc"},
            "interaction": {"event": "Cal Hacks", "needs": ["ML engineers"],
                            "interactionDate": "2030-01-01T10:00:00Z"},
        },
        transcript="Ran into Jason again at Cal Hacks.",
    )[0]
    assert second["created"] is False
    assert second["contactId"] == first["contactId"]

    profile = db_client.get(f"/contacts/{first['contactId']}").json()
    assert profile["name"] == "Jason Chen"  # the shorter name didn't replace the fuller one
    assert profile["company"] == "Robo Inc"
    assert profile["school"] == "UC Berkeley"  # untouched fields are kept
    assert [i["event"] for i in profile["interactions"]] == ["Cal Hacks", "Berkeley founders mixer"]
    assert profile["lastInteractionAt"].startswith("2030-01-01")


def test_multiple_people_in_one_note(db_client):
    emma = {"contact": {"name": "Emma", "company": "Figma", "role": "Designer"}}
    saved = capture(db_client, jason(), emma)
    assert len(saved) == 2
    names = [c["name"] for c in db_client.get("/contacts").json()]
    assert sorted(names) == ["Emma", "Jason Chen"]


def test_capture_is_all_or_nothing(db_client):
    missing = {"contactId": "00000000-0000-0000-0000-000000000999", "contact": {"name": "Ghost"}}
    response = db_client.post("/captures", json={"people": [jason(), missing]})
    assert response.status_code == 404
    assert db_client.get("/contacts").json() == []


def test_capture_validation(db_client):
    assert db_client.post("/captures", json={"people": []}).status_code == 422
    blank = {"contact": {"name": "   "}}
    assert db_client.post("/captures", json={"people": [blank]}).status_code == 422


def test_contact_list_is_recent_first_with_counts(db_client):
    capture(db_client, {"contact": {"name": "Old"}, "interaction": {"interactionDate": "2020-01-01T00:00:00Z"}})
    capture(db_client, jason())
    [first, second] = db_client.get("/contacts").json()
    assert first["name"] == "Jason Chen"
    assert first["lastEvent"] == "Berkeley founders mixer"
    assert first["openFollowUps"] == 1
    assert second["name"] == "Old"


def test_users_cannot_see_or_touch_each_others_people(db_client):
    contact_id = capture(db_client, jason())[0]["contactId"]
    db_client.act_as(OTHER_USER_ID)
    assert db_client.get("/contacts").json() == []
    assert db_client.get(f"/contacts/{contact_id}").status_code == 404
    assert db_client.patch(f"/contacts/{contact_id}", json={"name": "X"}).status_code == 404
    assert db_client.delete(f"/contacts/{contact_id}").status_code == 404
    other = {"contactId": contact_id, "contact": {"name": "Jason Chen"}}
    assert db_client.post("/captures", json={"people": [other]}).status_code == 404
    db_client.act_as(USER_ID)
    assert db_client.get(f"/contacts/{contact_id}").status_code == 200


def test_edit_contact(db_client):
    contact_id = capture(db_client, jason())[0]["contactId"]
    response = db_client.patch(
        f"/contacts/{contact_id}", json={"company": "Robo Inc", "school": None, "email": "j@robo.dev"}
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["company"], body["school"], body["email"]) == ("Robo Inc", None, "j@robo.dev")
    assert body["role"] == "Founder"
    assert db_client.patch(f"/contacts/{contact_id}", json={"name": None}).status_code == 422


def test_delete_interaction_and_contact(db_client):
    contact_id = capture(db_client, jason())[0]["contactId"]
    capture(db_client, {"contactId": contact_id, "contact": {"name": "Jason Chen"},
                        "interaction": {"event": "Coffee", "interactionDate": "2020-05-01T00:00:00Z"}})
    profile = db_client.get(f"/contacts/{contact_id}").json()
    mixer = next(i for i in profile["interactions"] if i["event"] == "Berkeley founders mixer")

    assert db_client.delete(f"/interactions/{mixer['id']}").status_code == 204
    profile = db_client.get(f"/contacts/{contact_id}").json()
    assert [i["event"] for i in profile["interactions"]] == ["Coffee"]
    assert profile["lastInteractionAt"].startswith("2020-05-01")
    # The follow-up stays, detached from the deleted moment.
    assert profile["followUps"][0]["interactionId"] is None

    assert db_client.delete(f"/contacts/{contact_id}").status_code == 204
    assert db_client.get(f"/contacts/{contact_id}").status_code == 404
    assert db_client.get("/follow-ups").json() == []


def test_follow_up_lifecycle(db_client):
    contact_id = capture(db_client, jason())[0]["contactId"]
    [follow_up] = db_client.get("/follow-ups?status=open").json()
    assert follow_up["contactName"] == "Jason Chen"

    done = db_client.patch(f"/follow-ups/{follow_up['id']}", json={"status": "done"}).json()
    assert done["status"] == "done" and done["completedAt"] is not None
    assert db_client.get("/follow-ups?status=open").json() == []

    reopened = db_client.patch(f"/follow-ups/{follow_up['id']}", json={"status": "open"}).json()
    assert reopened["completedAt"] is None

    created = db_client.post(
        "/follow-ups", json={"contactId": contact_id, "action": "Send the intro", "dueAt": "2030-02-01T00:00:00Z"}
    )
    assert created.status_code == 201
    assert db_client.patch(f"/follow-ups/{follow_up['id']}", json={"status": "later"}).status_code == 422


def test_duplicate_check(db_client):
    capture(db_client, jason())
    capture(db_client, {"contact": {"name": "Jason Park", "company": "Stripe"}})
    capture(db_client, {"contact": {"name": "Emma Stone"}})

    response = db_client.post(
        "/duplicate-check",
        json={"people": [
            {"name": "jason chen"},
            {"name": "Jason"},
            {"name": "Jason P", "company": "stripe"},
            {"name": "Nobody"},
            {"name": None},
        ]},
    )
    matches = response.json()["matches"]
    assert [(m["name"], m["strength"]) for m in matches[0]] == [("Jason Chen", "strong")]
    assert {m["name"] for m in matches[1]} == {"Jason Chen", "Jason Park"}
    assert all(m["strength"] == "possible" for m in matches[1])
    assert [(m["name"], m["strength"]) for m in matches[2]] == [("Jason Park", "strong")]
    assert "Stripe" in matches[2][0]["reason"]
    assert matches[3] == [] and matches[4] == []


def test_row_level_security_limits_direct_access(db_client, database_url):
    capture(db_client, jason())
    with psycopg.connect(database_url) as conn:
        conn.execute("grant select on contacts to authenticated")
        conn.execute("set local role authenticated")
        conn.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(OTHER_USER_ID),))
        assert conn.execute("select count(*) from contacts").fetchone()[0] == 0
        conn.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(USER_ID),))
        assert conn.execute("select count(*) from contacts").fetchone()[0] == 1
        conn.rollback()
