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


def test_delete_account_removes_user_and_data(db_client, database_url):
    import psycopg

    capture(db_client, jason())
    db_client.act_as(OTHER_USER_ID)
    capture(db_client, jason())

    assert db_client.delete("/me").status_code == 204
    with psycopg.connect(database_url) as conn:
        remaining = {row[0] for row in conn.execute("select id from auth.users")}
        owners = {row[0] for row in conn.execute("select distinct user_id from contacts")}
        # Put the user back for later tests.
        conn.execute("insert into auth.users (id) values (%s)", (OTHER_USER_ID,))
    assert OTHER_USER_ID not in remaining and USER_ID in remaining
    assert owners == {USER_ID}


def test_account_deletion_cascades_from_auth_users(db_client, database_url):
    import psycopg

    capture(db_client, jason())
    with psycopg.connect(database_url) as conn:
        conn.execute("delete from auth.users where id = %s", (USER_ID,))
        count = conn.execute("select count(*) from contacts").fetchone()[0]
        interactions = conn.execute("select count(*) from interactions").fetchone()[0]
        conn.execute("insert into auth.users (id) values (%s)", (USER_ID,))
    assert (count, interactions) == (0, 0)
