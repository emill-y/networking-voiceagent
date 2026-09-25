from app.services.contact_import import phone_key
from tests.conftest import OTHER_USER_ID
from tests.test_contacts import capture, jason


def test_phone_key():
    assert phone_key("+1 (415) 555-0123") == phone_key("415.555.0123") == "4155550123"
    assert phone_key("12345") is None
    assert phone_key(None) is None


def test_import_creates_people_without_moments(db_client):
    response = db_client.post("/contacts/import", json={"people": [
        {"name": "Priya Shah", "company": "Figma", "email": "priya@figma.com", "phone": "+1 415 555 0101"},
        {"name": "Diego Ramirez", "phone": "(415) 555-0102"},
    ]})
    assert response.json() == {"created": 2, "updated": 0, "unchanged": 0}
    people = {c["name"]: c for c in db_client.get("/contacts").json()}
    assert people["Priya Shah"]["email"] == "priya@figma.com"
    assert people["Priya Shah"]["lastInteractionAt"] is None
    profile = db_client.get(f"/contacts/{people['Diego Ramirez']['id']}").json()
    assert profile["phone"] == "(415) 555-0102" and profile["interactions"] == []


def test_import_fills_blanks_but_never_overwrites(db_client):
    contact_id = capture(db_client, jason())[0]["contactId"]  # role "Founder", no company
    response = db_client.post("/contacts/import", json={"people": [
        {"contactId": contact_id, "name": "Jay Chen", "role": "CEO", "company": "Robo Inc",
         "phone": "415-555-0199", "email": "jason@robo.dev"},
    ]})
    assert response.json() == {"created": 0, "updated": 1, "unchanged": 0}
    profile = db_client.get(f"/contacts/{contact_id}").json()
    assert profile["name"] == "Jason Chen"  # the user's name for them wins
    assert profile["role"] == "Founder"  # not overwritten
    assert (profile["company"], profile["phone"], profile["email"]) == ("Robo Inc", "415-555-0199", "jason@robo.dev")
    assert len(profile["interactions"]) == 1  # history untouched


def test_reimport_matches_by_phone_or_email(db_client):
    first = {"name": "Priya Shah", "phone": "+14155550101"}
    db_client.post("/contacts/import", json={"people": [first]})
    again = db_client.post("/contacts/import", json={"people": [
        {"name": "Priya S.", "phone": "415 555 0101", "email": "priya@figma.com"},
        {"name": "Priya", "email": "PRIYA@figma.com"},
    ]}).json()
    assert again == {"created": 0, "updated": 1, "unchanged": 1}
    assert [c["name"] for c in db_client.get("/contacts").json()] == ["Priya Shah"]


def test_import_cannot_touch_other_users(db_client):
    contact_id = capture(db_client, jason())[0]["contactId"]
    db_client.act_as(OTHER_USER_ID)
    response = db_client.post("/contacts/import", json={"people": [
        {"contactId": contact_id, "name": "Jason Chen", "phone": "415-555-0199"},
    ]})
    # Unknown id for this user: created as their own new person instead.
    assert response.json()["created"] == 1


def test_import_validation(db_client):
    assert db_client.post("/contacts/import", json={"people": []}).status_code == 422
    assert db_client.post("/contacts/import", json={"people": [{"name": " "}]}).status_code == 422
