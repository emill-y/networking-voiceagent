import json
from dataclasses import replace
from urllib.parse import parse_qs, urlparse

import pytest

from app.core import crypto
from app.core.config import get_settings
from app.main import app
from app.services import calendar_sync
from app.services.google_calendar import CalendarRevoked, CalendarScopeMissing, GoogleCalendar
from app.services.llm import get_llm_client
from tests.conftest import USER_ID
from tests.test_contacts import capture, jason

SETTINGS = replace(get_settings(), google_client_secret="test-secret", google_client_id="client-id", public_url=None)


class FakeGoogle:
    def __init__(self):
        self.events: dict[str, dict] = {}
        self.deleted: list[str] = []
        self.upcoming: list[dict] = []
        self.revoked = False
        self.revoked_tokens: list[str] = []
        self.redirects: list[str] = []
        self.exchange_error: Exception | None = None

    def auth_url(self, redirect_uri, state):
        self.redirects.append(redirect_uri)
        return f"https://accounts.google.test/auth?state={state}"

    def exchange(self, code, redirect_uri):
        assert redirect_uri == self.redirects[-1]  # must match the one Google was given
        if self.exchange_error:
            raise self.exchange_error
        return "refresh-1", "access-1", "eisha@example.com"

    def access_token(self, refresh_token):
        if self.revoked:
            raise CalendarRevoked("gone")
        assert refresh_token == "refresh-1"
        return "access-1"

    def revoke(self, token):
        self.revoked_tokens.append(token)

    def list_events(self, token, time_min, time_max, limit=25):
        return self.upcoming

    def insert_event(self, token, body):
        event_id = f"ev{len(self.events) + 1}"
        self.events[event_id] = body
        return event_id

    def patch_event(self, token, event_id, body):
        self.events[event_id] = body

    def delete_event(self, token, event_id):
        self.deleted.append(event_id)
        self.events.pop(event_id, None)


class ExpandingLLM:
    """Stands in for the model: expands event titles into related words."""

    def chat_json(self, system, user, schema):
        if "chemistry" in user.lower():
            return json.dumps({"terms": ["chemistry", "chemical"]})
        return json.dumps({"terms": []})


@pytest.fixture
def google(monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setattr("app.routes.calendar.get_settings", lambda: SETTINGS)
    monkeypatch.setattr("app.services.calendar_sync.get_settings", lambda: SETTINGS)
    calendar_sync._cache.clear()
    app.dependency_overrides[calendar_sync.get_calendar_client] = lambda: fake
    app.dependency_overrides[get_llm_client] = lambda: ExpandingLLM()
    return fake


def connect(client, google):
    url = client.post("/calendar/connect", json={"returnTo": "/app/follow-ups"}).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    response = client.get("/calendar/callback", params={"code": "abc", "state": state}, follow_redirects=False)
    assert response.status_code in (302, 307), response.text
    return response.headers["location"]


def test_not_configured_says_so(db_client):
    app.dependency_overrides[calendar_sync.get_calendar_client] = lambda: None
    assert db_client.get("/calendar").json()["available"] is False
    assert db_client.post("/calendar/connect", json={}).status_code == 503
    assert db_client.get("/calendar/upcoming").json() == {"connected": False, "events": []}


def test_connect_stores_an_encrypted_token_and_comes_back(db_client, google, database_url):
    assert db_client.get("/calendar").json() == {
        "available": True, "connected": False, "email": None, "pushFollowUps": True,
    }
    location = connect(db_client, google)
    assert location.endswith("/app/follow-ups?calendar=connected")
    assert google.redirects[-1].endswith("/calendar/callback")
    status = db_client.get("/calendar").json()
    assert status["connected"] is True and status["email"] == "eisha@example.com"

    import psycopg
    with psycopg.connect(database_url) as conn:
        stored = conn.execute("select refresh_token_encrypted from calendar_connections").fetchone()[0]
    assert "refresh-1" not in stored
    assert crypto.decrypt(SETTINGS, stored) == "refresh-1"


def test_tampered_or_denied_callbacks_change_nothing(db_client, google):
    bad = db_client.get("/calendar/callback", params={"code": "x", "state": "nope.nope"}, follow_redirects=False)
    assert "calendar=expired" in bad.headers["location"]
    state = crypto.sign_state(SETTINGS, USER_ID, "/app/you")
    denied = db_client.get("/calendar/callback", params={"error": "access_denied", "state": state}, follow_redirects=False)
    assert denied.headers["location"].endswith("/app/you?calendar=denied")
    assert db_client.get("/calendar").json()["connected"] is False
    # Return addresses outside Nomi are ignored.
    evil = crypto.sign_state(SETTINGS, USER_ID, "https://evil.test")
    assert crypto.verify_state(SETTINGS, evil)[1] == "https://evil.test"
    url = db_client.post("/calendar/connect", json={"returnTo": "https://evil.test"}).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    assert crypto.verify_state(SETTINGS, state)[1] == "/app/follow-ups"


def test_state_expires():
    state = crypto.sign_state(SETTINGS, USER_ID, "/app", now=1_000)
    assert crypto.verify_state(SETTINGS, state, now=1_100)[0] == USER_ID
    with pytest.raises(crypto.CryptoError):
        crypto.verify_state(SETTINGS, state, now=1_000 + 601)


def test_follow_ups_go_on_the_calendar_and_stay_in_step(db_client, google):
    connect(db_client, google)
    saved = capture(db_client, jason(followUp={"action": "Send Jason the deck", "dueAt": "2026-10-02T19:00:00Z"}))
    follow_up_id = saved[0]["followUpId"]
    [(event_id, event)] = google.events.items()
    assert event["summary"] == "Send Jason the deck · Jason Chen"
    assert event["start"] == {"date": "2026-10-02"} and event["end"] == {"date": "2026-10-03"}
    assert f"/app/people/{saved[0]['contactId']}" in event["description"]

    db_client.patch(f"/follow-ups/{follow_up_id}", json={"status": "done"})
    assert google.events[event_id]["summary"].startswith("✓ ")
    db_client.patch(f"/follow-ups/{follow_up_id}", json={"dueAt": "2026-10-05T19:00:00Z", "status": "open"})
    assert google.events[event_id]["start"] == {"date": "2026-10-05"}
    db_client.patch(f"/follow-ups/{follow_up_id}", json={"status": "dismissed"})
    assert google.deleted == [event_id]


def test_undated_follow_ups_and_turning_sync_off(db_client, google):
    connect(db_client, google)
    saved = capture(db_client, jason())  # "Reach out next week" arrives without a date here
    assert google.events == {}
    db_client.patch("/calendar", json={"pushFollowUps": False})
    db_client.post("/follow-ups", json={"contactId": saved[0]["contactId"], "action": "Call", "dueAt": "2026-10-02T19:00:00Z"})
    assert google.events == {}
    assert db_client.get("/calendar").json()["pushFollowUps"] is False


def test_deleting_a_person_removes_their_events(db_client, google):
    connect(db_client, google)
    saved = capture(db_client, jason(followUp={"action": "Send the deck", "dueAt": "2026-10-02T19:00:00Z"}))
    [event_id] = google.events
    assert db_client.delete(f"/contacts/{saved[0]['contactId']}").status_code == 204
    assert google.deleted == [event_id]


def test_upcoming_events_suggest_people(db_client, google, database_url):
    connect(db_client, google)
    capture(db_client, {
        "contact": {"name": "Diego Alvarez", "role": "Chemical engineering PhD"},
        "interaction": {"projects": ["battery materials"]},
    })
    import psycopg
    with psycopg.connect(database_url, autocommit=True) as conn:  # emails arrive via contact import
        conn.execute("update contacts set email = 'diego@stanford.test' where name = 'Diego Alvarez'")
    capture(db_client, {"contact": {"name": "Priya Shah", "company": "Figma"}, "interaction": {}})
    google.upcoming = [
        {"id": "e1", "summary": "Chemistry 1A", "start": {"dateTime": "2026-10-01T10:00:00-07:00"}},
        {"id": "e2", "summary": "Coffee", "start": {"dateTime": "2026-10-01T15:00:00-07:00"},
         "attendees": [{"email": "Diego@Stanford.test"}]},
        {"id": "e3", "summary": "Lunch with Priya", "start": {"date": "2026-10-02"}},
        {"id": "e4", "summary": "Send the deck · Priya", "start": {"date": "2026-10-02"},
         "extendedProperties": {"private": {"nomi": "follow-up"}}},
    ]
    events = db_client.get("/calendar/upcoming").json()["events"]
    assert [e["title"] for e in events] == ["Chemistry 1A", "Coffee", "Lunch with Priya"]  # Nomi's own skipped
    chem, coffee, lunch = events
    assert [(p["name"], p["why"]) for p in chem["people"]] == [("Diego Alvarez", "Your notes mention “chemical”")]
    assert [(p["name"], p["why"]) for p in coffee["people"]] == [("Diego Alvarez", "On the invite")]
    assert [(p["name"], p["why"]) for p in lunch["people"]] == [("Priya Shah", "Named in the event")]
    assert lunch["allDay"] is True


def test_revoked_access_disconnects(db_client, google):
    connect(db_client, google)
    google.revoked = True
    assert db_client.get("/calendar/upcoming").json()["connected"] is False
    assert db_client.get("/calendar").json()["connected"] is False


def test_disconnect_revokes(db_client, google):
    connect(db_client, google)
    assert db_client.delete("/calendar").status_code == 204
    assert google.revoked_tokens == ["refresh-1"]
    assert db_client.get("/calendar").json()["connected"] is False


def test_coming_back_to_the_site_you_started_on(db_client, google):
    def returned_to(return_to, origin):
        url = db_client.post("/calendar/connect", json={"returnTo": return_to}, headers={"Origin": origin}).json()["url"]
        return crypto.verify_state(SETTINGS, parse_qs(urlparse(url).query)["state"][0])[1]

    # Same site as the request (e.g. the *.vercel.app domain while PUBLIC_URL is another).
    assert returned_to("http://testserver/app/you", "http://testserver") == "http://testserver/app/you"
    # Someone else's site, or a mismatched Origin, falls back to a path on this site.
    assert returned_to("https://evil.test/app/you", "https://evil.test") == "/app/follow-ups"
    assert returned_to("http://testserver/app/you", "https://evil.test") == "/app/follow-ups"
    assert returned_to("http://testserver/elsewhere", "http://testserver") == "/app/follow-ups"


def test_unticked_calendar_permission_is_explained(db_client, google):
    google.exchange_error = CalendarScopeMissing("no calendar")
    assert connect(db_client, google).endswith("/app/follow-ups?calendar=scope")
    assert db_client.get("/calendar").json()["connected"] is False


def test_google_client_checks_the_granted_scope():
    import httpx

    def handler(request):
        return httpx.Response(200, json={"access_token": "a", "refresh_token": "r", "scope": "openid email"})

    client = GoogleCalendar("id", "secret", http=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(CalendarScopeMissing):
        client.exchange("code", "https://nomi.test/calendar/callback")
