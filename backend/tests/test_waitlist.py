import dataclasses
import os

import psycopg

import pytest

from app.core.config import get_settings
from app.main import app
from app.routes import waitlist as routes


@pytest.fixture
def wl(db_client):
    routes.per_hour._hits.clear()
    yield db_client
    routes.per_hour._hits.clear()


def join(client, **fields):
    body = {"name": "Maya Singh", "school": "UC Berkeley", "email": "maya@berkeley.edu"} | fields
    return client.post("/waitlist/join", json=body)


def test_join_gives_a_spot_referral_link_and_friend_code(wl):
    response = join(wl)
    assert response.status_code == 201
    spot = response.json()
    assert spot["position"] == 1 and spot["total"] == 1
    assert spot["referralUrl"].endswith(f"/waitlist?ref={spot['referralCode']}")
    assert spot["friendCode"].startswith("NOMI-")
    assert spot["referrals"] == 0 and not spot["alreadyJoined"]


def test_joining_again_returns_the_same_spot(wl):
    first = join(wl).json()
    again = join(wl, email="MAYA@Berkeley.edu ", name="Maya S").json()
    assert again["referralCode"] == first["referralCode"]
    assert again["alreadyJoined"] is True
    assert wl.get("/waitlist/stats").json()["total"] == 1


def test_referrals_are_counted_and_bad_codes_ignored(wl):
    maya = join(wl).json()
    join(wl, name="Leo Tran", email="leo@stanford.edu", school="Stanford", ref=maya["referralCode"].lower())
    join(wl, name="Kai Johnson", email="kai@ucla.edu", school="UCLA", ref="NOPE123")
    stats = wl.get(f"/waitlist/spot/{maya['referralCode']}").json()
    assert stats["referrals"] == 1 and stats["total"] == 3
    assert wl.get("/waitlist/spot/ZZZZZZ").status_code == 404


def test_validation(wl):
    assert join(wl, email="not-an-email").status_code == 422
    assert join(wl, name="").status_code == 422
    assert join(wl, school="x").status_code == 422


def test_welcome_email_only_when_email_is_configured(wl, monkeypatch):
    sent = []
    monkeypatch.setattr(routes.mail, "send", lambda settings, to, subject, text, button=None, html_body=None:
                        sent.append((to, text, html_body)) or True)

    join(wl, email="a@x.edu")
    assert sent == []  # no RESEND_API_KEY: nothing is sent

    settings = dataclasses.replace(get_settings(), resend_api_key="re_test")
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        spot = join(wl, name="Leo <b>Tran</b>", email="leo@x.edu").json()
    finally:
        app.dependency_overrides.pop(get_settings, None)
    assert len(sent) == 1
    to, text, page = sent[0]
    assert to == "leo@x.edu" and "#2" in text
    assert spot["referralUrl"] in text and spot["friendCode"] in page
    assert "Leo" in page and "<b>Tran" not in page  # names are escaped in the HTML


def test_welcome_is_recorded_only_when_sent(wl, monkeypatch):
    settings = dataclasses.replace(get_settings(), resend_api_key="re_test")
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        monkeypatch.setattr(routes.mail, "send", lambda *a, **k: False)
        join(wl, email="fail@x.edu")
        monkeypatch.setattr(routes.mail, "send", lambda *a, **k: True)
        join(wl, email="ok@x.edu")
    finally:
        app.dependency_overrides.pop(get_settings, None)
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as conn:
        rows = dict(conn.execute("select email, welcome_sent_at is not null from waitlist").fetchall())
    assert rows == {"fail@x.edu": False, "ok@x.edu": True}


def test_waitlist_page_is_served(wl):
    page = wl.get("/waitlist")
    assert page.status_code == 200 and "Claim my founding spot" in page.text
    assert 'href="/waitlist"' in wl.get("/").text
