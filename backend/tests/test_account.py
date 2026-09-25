from tests.conftest import OTHER_USER_ID, USER_ID
from tests.test_contacts import capture, jason


def test_export_contains_everything(db_client):
    capture(db_client, jason(), {"contact": {"name": "Emma"}})
    export = db_client.get("/me/export").json()
    assert export["exportedAt"]
    by_name = {c["name"]: c for c in export["contacts"]}
    assert set(by_name) == {"Jason Chen", "Emma"}
    assert by_name["Jason Chen"]["interactions"][0]["rawTranscript"]
    assert by_name["Jason Chen"]["followUps"][0]["action"] == "Reach out next week"


def test_delete_all_data_only_affects_the_caller(db_client):
    capture(db_client, jason())
    db_client.act_as(OTHER_USER_ID)
    capture(db_client, jason())

    assert db_client.delete("/me/data").status_code == 204
    assert db_client.get("/contacts").json() == []
    assert db_client.get("/follow-ups").json() == []

    db_client.act_as(USER_ID)
    assert len(db_client.get("/contacts").json()) == 1
