import json
import os

import psycopg
import pytest

from app.core.auth import get_optional_user_id
from app.main import app
from app.services import sessions as svc
from app.services.llm import LLMUnavailable, get_llm_client
from app.services.transcription import Transcript, get_transcriber
from tests.conftest import OTHER_USER_ID, USER_ID

# What each chunk "says", by the bytes uploaded.
SPEECH = {
    b"c0": "hi I'm Sarah Kim I study bioengineering at Berkeley",
    b"c1": "nice I work on protein folding we should get coffee next week",
    b"c2": "hey this is my friend Jason Chen he's building a robotics startup",
    b"c3": "yeah we're looking for designers",
    b"c4": "oh Sarah again by the way I am also really into climbing",
}


class ChunkTranscriber:
    def transcribe(self, path):
        with open(path, "rb") as f:
            data = f.read()
        return Transcript(SPEECH.get(data, ""), "en", 30.0, 5)


class ConversationLLM:
    """Finds people by the names in the window, like the model would."""

    def __init__(self):
        self.calls = []

    def chat_json(self, system, user, schema):
        self.calls.append(user)
        assert "ambient recording" in system.lower()
        # Context lines (event, who the user is, people already met) aren't speech.
        user = "\n".join(line for line in user.splitlines() if not line.startswith("("))
        people = []
        if "Maya" in user:
            people.append({"name": "Maya Patel", "role": "Student"})  # the user, introducing herself
        if "Sarah Kim" in user:
            people.append({"name": "Sarah Kim", "school": "UC Berkeley", "major": "Bioengineering",
                           "projects": ["protein folding"], "followUp": "Get coffee next week"})
        elif "Sarah" in user:
            people.append({"name": "Sarah", "interests": ["climbing"]})
        if "Jason Chen" in user:
            people.append({"name": "Jason Chen", "role": "Founder", "projects": ["robotics startup"],
                           "needs": ["designers"]})
        return json.dumps({"people": people})


@pytest.fixture
def session_client(db_client):
    llm = ConversationLLM()
    state = {"user": USER_ID}
    original = db_client.act_as

    def act_as(user):
        state["user"] = user
        original(user)

    db_client.act_as = act_as
    app.dependency_overrides[get_transcriber] = lambda: ChunkTranscriber()
    app.dependency_overrides[get_llm_client] = lambda: llm
    app.dependency_overrides[get_optional_user_id] = lambda: state["user"]
    db_client.llm = llm
    return db_client


def upload(client, session_id, seq, data, headers=None):
    return client.post(f"/sessions/{session_id}/chunks", data={"seq": str(seq)},
                       files={"audio": ("chunk.m4a", data, "audio/mp4")}, headers=headers or {})


def test_a_session_finds_everyone_you_met(session_client):
    client = session_client
    started = client.post("/sessions", json={"title": "Cal Hacks mixer"})
    assert started.status_code == 201
    session = started.json()
    assert session["status"] == "recording" and session["uploadToken"]
    assert client.get("/sessions/active").json()["id"] == session["id"]
    assert client.post("/sessions", json={}).status_code == 409  # one at a time

    # The last chunk lands in the next transcript window.
    for seq, data in zip([0, 1, 2, 3, 5], [b"c0", b"c1", b"c2", b"c3", b"c4"]):
        progress = upload(client, session["id"], seq, data)
        assert progress.status_code == 200, progress.text
    body = progress.json()
    assert body["chunks"] == 5 and body["audioSeconds"] == 150

    finished = client.post(f"/sessions/{session['id']}/finish").json()
    assert finished["status"] == "ready" and "robotics startup" in finished["transcript"]
    people = {p["name"]: p for p in finished["people"]}
    # "Sarah" in a later window merges into Sarah Kim.
    assert sorted(people) == ["Jason Chen", "Sarah Kim"]
    assert people["Sarah Kim"]["interests"] == ["climbing"]
    assert people["Sarah Kim"]["metAt"] == "Cal Hacks mixer"
    assert people["Sarah Kim"]["followUpDue"]  # "next week" resolved to a date
    assert people["Jason Chen"]["needs"] == ["designers"]
    assert client.get("/sessions/active").json() is None
    assert upload(client, session["id"], 5, b"c0").status_code == 409  # ended

    assert client.delete(f"/sessions/{session['id']}").status_code == 204
    assert client.get(f"/sessions/{session['id']}").status_code == 404


def test_a_watch_uploads_with_the_session_token(session_client):
    client = session_client
    session = client.post("/sessions", json={}).json()
    token = session["uploadToken"]

    client.act_as(None)  # the watch has no sign-in, only the token
    assert upload(client, session["id"], 0, b"c0").status_code == 401
    assert upload(client, session["id"], 0, b"c0", {"X-Session-Token": "wrong"}).status_code == 404
    ok = upload(client, session["id"], 0, b"c0", {"X-Session-Token": token})
    assert ok.status_code == 200 and ok.json()["chunks"] == 1
    assert client.get(f"/sessions/{session['id']}", headers={"X-Session-Token": token}).json()["chunks"] == 1

    client.act_as(OTHER_USER_ID)  # other people can't see it
    assert client.get(f"/sessions/{session['id']}").status_code == 404
    assert client.post(f"/sessions/{session['id']}/finish").status_code == 404

    client.act_as(USER_ID)
    client.post(f"/sessions/{session['id']}/finish")
    client.act_as(None)  # once finished, the token stops working
    assert upload(client, session["id"], 1, b"c1", {"X-Session-Token": token}).status_code == 404


def test_retries_and_out_of_order_chunks(session_client):
    client = session_client
    session = client.post("/sessions", json={}).json()
    upload(client, session["id"], 1, b"c1")
    upload(client, session["id"], 0, b"c0")
    body = upload(client, session["id"], 0, b"c0").json()  # a retried upload replaces, not duplicates
    assert body["chunks"] == 2
    assert [p["name"] for p in body["people"]] == ["Sarah Kim"]


def test_the_model_being_down_doesnt_lose_audio(session_client):
    client = session_client

    class Down:
        def chat_json(self, *a):
            raise LLMUnavailable("down")

    app.dependency_overrides[get_llm_client] = lambda: Down()
    session = client.post("/sessions", json={}).json()
    body = upload(client, session["id"], 0, b"c0").json()
    assert body["chunks"] == 1 and body["people"] == []
    app.dependency_overrides[get_llm_client] = lambda: client.llm  # back up: finish catches up
    finished = client.post(f"/sessions/{session['id']}/finish").json()
    assert [p["name"] for p in finished["people"]] == ["Sarah Kim"]


def test_windows_and_merging():
    segments = [{"seq": i, "text": f"t{i}", "seconds": 30} for i in range(9)]
    assert svc.window_text(segments, 0) == "t0\nt1\nt2\nt3\nt4"
    assert svc.window_text(segments, 1) == "t4\nt5\nt6\nt7\nt8"  # plus the chunk before
    merged = svc.merge_people({
        "1": [{"name": "Sarah", "interests": ["Climbing"]}],
        "0": [{"name": "Sarah Kim", "interests": ["climbing", "ai"]}, {"name": "Sarah Lee"}],
    }, None)
    assert [(p.name, p.interests) for p in merged] == [("Sarah Kim", ["climbing", "ai"]), ("Sarah Lee", [])]


SPEECH[b"me"] = "hi I'm Maya nice to meet you"


def test_the_user_is_never_added_and_earlier_people_give_context(session_client):
    client = session_client
    session = client.post("/sessions", json={"title": "Mixer", "you": "Maya Patel"}).json()
    upload(client, session["id"], 0, b"me")
    upload(client, session["id"], 1, b"c0")
    body = upload(client, session["id"], 5, b"c4").json()  # next window: "Sarah again"
    assert [p["name"] for p in body["people"]] == ["Sarah Kim"]  # Maya (the user) is left out
    assert "(The user (wearing the recorder) is Maya Patel. Never include them.)" in client.llm.calls[0]
    assert "Already met earlier in this event: Sarah Kim (UC Berkeley)" in client.llm.calls[-1]


def _reviewed(names):
    return [{"contact": {"name": n, "school": "UC Berkeley"},
             "interaction": {"event": "Cal Hacks mixer", "topics": [], "notes": ["Met at the mixer"]}}
            for n in names]


def test_saving_a_session_keeps_it_and_drops_the_transcript(session_client):
    client = session_client
    session = client.post("/sessions", json={"title": "Cal Hacks mixer"}).json()
    upload(client, session["id"], 0, b"c0")
    client.post(f"/sessions/{session['id']}/finish")

    names = [f"Person {i}" for i in range(12)]  # more than 10 people in one session
    saved = client.post(f"/sessions/{session['id']}/save", json={"people": _reviewed(names)})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["status"] == "saved" and [c["name"] for c in body["contacts"]] == names
    assert body["chunks"] == 0 and body["people"] == []  # the transcript is gone
    assert client.post(f"/sessions/{session['id']}/save", json={"people": _reviewed(["x"])}).status_code == 409

    history = client.get("/sessions").json()
    assert [(s["id"], s["status"], len(s["contacts"])) for s in history] == [(session["id"], "saved", 12)]
    assert client.get(f"/sessions/{session['id']}").json()["contacts"][0]["school"] == "UC Berkeley"

    # Old unfinished sessions are cleaned up; saved ones stay.
    with psycopg.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as conn:
        conn.execute("update ambient_sessions set updated_at = now() - interval '30 days'")
    client.post("/sessions", json={})
    assert [s["status"] for s in client.get("/sessions").json()] == ["recording", "saved"]

    # Deleting a saved session keeps the people it added.
    contact_id = body["contacts"][0]["id"]
    assert client.delete(f"/sessions/{session['id']}").status_code == 204
    assert client.get(f"/contacts/{contact_id}").status_code == 200

    client.act_as(OTHER_USER_ID)
    assert client.get("/sessions").json() == []
