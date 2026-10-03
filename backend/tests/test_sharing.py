import csv
import io

import pytest

from app.core.auth import get_current_email
from app.main import app
from tests.conftest import OTHER_USER_ID, USER_ID
from tests.test_contacts import capture, jason


@pytest.fixture
def emails():
    """Who each test user is signed in as."""
    addresses = {USER_ID: "eisha@example.com", OTHER_USER_ID: "annie@example.com"}
    current = {"user": USER_ID}
    return addresses, current


@pytest.fixture
def as_user(db_client, emails):
    addresses, current = emails
    original = db_client.act_as

    def act_as(user):
        current["user"] = user
        original(user)

    app.dependency_overrides[get_current_email] = lambda: addresses.get(current["user"])
    db_client.act_as = act_as
    return db_client


def test_export_respects_the_current_view(db_client):
    jason_id = capture(db_client, jason())[0]["contactId"]
    capture(db_client, {"contact": {"name": "=HYPERLINK(1)", "company": "Stripe"}, "interaction": {"interests": ["design"]}})

    everyone = db_client.post("/contacts/export", json={}).text.lstrip("﻿")
    rows = list(csv.DictReader(io.StringIO(everyone)))
    assert len(rows) == 2
    assert rows[0]["Name"] == "'=HYPERLINK(1)"  # never runs as a formula
    assert rows[1]["Where you met"] == "Berkeley founders mixer"
    assert rows[1]["Looking for"] == "designers" and rows[1]["Major"] == "EECS"
    assert rows[1]["Open follow-ups"] == "Reach out next week"

    only = db_client.post("/contacts/export", json={"ids": [jason_id], "format": "tsv"})
    assert only.headers["content-type"].startswith("text/tab-separated-values")
    lines = only.text.strip().split("\n")
    assert len(lines) == 2 and lines[1].startswith("Jason Chen\t")


def test_contacts_list_has_what_filters_need(db_client):
    capture(db_client, jason(interaction={"event": "Cal Hacks", "interests": ["Robotics", "AI"]}))
    [person] = db_client.get("/contacts").json()
    assert person["major"] == "EECS" and person["moments"] == 1
    assert sorted(person["interests"]) == ["ai", "robotics"] and person["events"] == ["Cal Hacks"]


def test_follow_ups_say_why(db_client):
    capture(db_client, jason())
    [item] = db_client.get("/follow-ups").json()
    assert item["context"] == "Founder · Met at Berkeley founders mixer · Looking for designers"
    assert item["onCalendar"] is False


def test_profile_photo_and_invite_code(db_client):
    profile = db_client.get("/me/profile").json()
    assert len(profile["inviteCode"]) == 8 and profile["inviteLink"].endswith(f"/?invite={profile['inviteCode']}")
    assert db_client.get("/me/profile").json()["inviteCode"] == profile["inviteCode"]  # stable

    photo = "data:image/png;base64,iVBORw0KGgo="
    updated = db_client.patch("/me/profile", json={"displayName": "Eisha", "avatar": photo}).json()
    assert updated["avatarUrl"] == photo and updated["displayName"] == "Eisha"
    assert db_client.patch("/me/profile", json={"avatar": "javascript:alert(1)"}).status_code == 422
    assert db_client.patch("/me/profile", json={"avatar": None}).json()["avatarUrl"] is None

    # Someone joins with the code: counted once, never for yourself.
    db_client.act_as(OTHER_USER_ID)
    assert db_client.post("/invites/redeem", json={"code": profile["inviteCode"]}).json() == {"redeemed": True}
    assert db_client.post("/invites/redeem", json={"code": profile["inviteCode"]}).json() == {"redeemed": False}
    db_client.act_as(USER_ID)
    assert db_client.post("/invites/redeem", json={"code": profile["inviteCode"]}).json() == {"redeemed": False}
    assert db_client.get("/me/profile").json()["invitedCount"] == 1


def test_sharing_needs_the_recipient_to_accept(as_user):
    client = as_user
    client.patch("/me/profile", json={"displayName": "Eisha"})
    ids = [capture(client, jason())[0]["contactId"],
           capture(client, {"contact": {"name": "Maya Singh", "email": "maya@x.test"}, "interaction": {}})[0]["contactId"]]
    created = client.post("/shares", json={"contactIds": ids, "email": "Annie@Example.com", "message": "Meet them!"})
    assert created.status_code == 201
    share = created.json()
    assert share["count"] == 2 and share["emailed"] is False  # no email provider configured: never fake "sent"
    assert "/app/shared/" in share["link"]
    assert client.get("/shares/incoming").json() == []  # not for the sender

    client.act_as(OTHER_USER_ID)
    assert client.get("/contacts").json() == []  # nothing imported silently
    [incoming] = client.get("/shares/incoming").json()
    assert incoming["senderName"] == "Eisha" and incoming["count"] == 2 and incoming["message"] == "Meet them!"
    result = client.post(f"/shares/{incoming['id']}/accept", json={}).json()
    assert result == {"added": 2, "skipped": 0}
    names = sorted(p["name"] for p in client.get("/contacts").json())
    assert names == ["Jason Chen", "Maya Singh"]
    # Private notes don't travel; who they are does.
    detail = client.get(f"/contacts/{client.get('/contacts').json()[0]['id']}").json()
    assert detail["interactions"][0]["notes"] == ["Shared by Eisha"]
    assert client.post(f"/shares/{incoming['id']}/accept", json={}).status_code == 404  # used up


def test_shares_by_link_and_decline(as_user):
    client = as_user
    contact_id = capture(client, jason())[0]["contactId"]
    link = client.post("/shares", json={"contactIds": [contact_id], "email": "someone@else.test"}).json()["link"]
    token = link.rsplit("/", 1)[1]

    client.act_as(OTHER_USER_ID)  # signed in with a different email
    assert client.get("/shares/incoming").json() == []
    opened = client.get(f"/shares/link/{token}").json()
    assert client.post(f"/shares/{opened['id']}/accept", json={}).status_code == 404  # needs the link's token
    assert client.post(f"/shares/{opened['id']}/decline", json={"token": token}).status_code == 204
    assert client.get(f"/shares/link/{token}").status_code == 404


def test_share_validation(as_user):
    client = as_user
    contact_id = capture(client, jason())[0]["contactId"]
    assert client.post("/shares", json={"contactIds": [contact_id], "email": "not-an-email"}).status_code == 422
    assert client.post("/shares", json={"contactIds": [], "email": "a@b.co"}).status_code == 422
    client.act_as(OTHER_USER_ID)  # can't share someone else's contacts
    assert client.post("/shares", json={"contactIds": [contact_id], "email": "a@b.co"}).status_code == 404
