import json
import os

import psycopg
import pytest

from app.core.auth import get_optional_user_id
from app.main import app
from app.services import sessions as svc
from app.services.diarization import ChunkVoices, Turn, get_diarizer, label_transcript, match_voices
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
        if "title" in schema["properties"]:  # naming an untitled session
            return json.dumps({"title": "robotics startup chat"})
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
    app.dependency_overrides[get_diarizer] = lambda: None  # voice tests below opt in
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


def test_people_whose_name_wasnt_said_are_kept_by_label():
    windows = {
        "0": [{"name": None, "label": "Airbnb designer who climbs", "role": "Designer"}],
        "1": [{"name": None, "label": "Airbnb designer who climbs", "interests": ["climbing"]},
              {"name": None, "label": None, "notes": ["said hi"]}],
        "2": [{"name": "Kai", "label": "Airbnb designer who climbs", "company": "Airbnb"}],
    }
    people = svc.merge_people(windows, "Mixer")
    assert len(people) == 1
    kai = people[0]
    assert (kai.name, kai.label, kai.role, kai.company, kai.interests) == ("Kai", None, "Designer", "Airbnb", ["climbing"])

    unnamed = svc.merge_people({"0": [{"name": None, "label": "CS student with a drone startup"}]}, None)
    assert [(p.name, p.label) for p in unnamed] == [(None, "CS student with a drone startup")]
    assert svc.known_people({"0": [{"name": None, "label": "CS student with a drone startup"}]}) == [
        'unnamed, label "CS student with a drone startup"'
    ]


SPEECH[b"nameless"] = ("hey bro how's it going yeah I'm building a drone delivery thing for campus "
                       "we need someone who knows hardware honestly it's been a wild semester")


def test_a_conversation_without_names_is_kept_not_lost(session_client):
    client = session_client
    session = client.post("/sessions", json={"title": "Mixer"}).json()
    upload(client, session["id"], 0, b"nameless")

    class Summarizer:
        def chat_json(self, system, user, schema):
            if "label" in schema["properties"] and "people" not in schema["properties"]:
                return json.dumps({"label": "Drone startup founder", "topics": ["drone delivery"], "about": ["needs hardware help"]})
            return json.dumps({"people": []})

    app.dependency_overrides[get_llm_client] = lambda: Summarizer()
    finished = client.post(f"/sessions/{session['id']}/finish").json()
    assert [(p["name"], p["label"], p["topicsDiscussed"]) for p in finished["people"]] == [
        (None, "Drone startup founder", ["drone delivery"])
    ]

    # The model being down still keeps the conversation, just without a summary.
    class Down:
        def chat_json(self, *a):
            raise LLMUnavailable("down")

    assert svc.conversation_fallback([{"seq": 0, "text": SPEECH[b"nameless"], "seconds": 20}], Down(), "Mixer")["label"] == "Someone from Mixer"
    assert svc.conversation_fallback([{"seq": 0, "text": "um yeah", "seconds": 20}], Down(), None) is None


def test_an_untitled_session_is_named_from_the_conversation_and_can_be_renamed(session_client):
    client = session_client
    session = client.post("/sessions", json={}).json()
    upload(client, session["id"], 0, b"c2")
    finished = client.post(f"/sessions/{session['id']}/finish").json()
    assert finished["title"] == "Robotics startup chat" and finished["titleAuto"] is True
    # A made-up title is a topic, not a place: it's never "where you met".
    assert all(p["metAt"] is None for p in finished["people"])

    renamed = client.patch(f"/sessions/{session['id']}", json={"title": "  Lab open house "}).json()
    assert renamed["title"] == "Lab open house" and renamed["titleAuto"] is False
    assert all(p["metAt"] == "Lab open house" for p in renamed["people"])

    # Saved sessions can still be renamed; an empty name clears it.
    person = {"contact": {"name": "Jason Chen"}}
    assert client.post(f"/sessions/{session['id']}/save", json={"people": [person]}).status_code == 200
    assert client.patch(f"/sessions/{session['id']}", json={"title": ""}).json()["title"] is None

    # Only your own sessions.
    client.act_as(OTHER_USER_ID)
    assert client.patch(f"/sessions/{session['id']}", json={"title": "Mine now"}).status_code == 404


def test_a_named_session_keeps_its_name():
    class NoCall:
        def chat_json(self, *a):
            raise AssertionError("should not be called")

    # Too little speech to name: no model call, no title.
    assert svc.suggest_title([{"seq": 0, "text": "um yeah ok", "seconds": 20}], NoCall()) is None

    class Rambling:
        def chat_json(self, *a):
            return json.dumps({"title": "x" * 200})

    long_talk = [{"seq": 0, "text": "we talked for a while about many different things today", "seconds": 20}]
    assert svc.suggest_title(long_talk, Rambling()) is None  # an essay isn't a title

    class Down:
        def chat_json(self, *a):
            raise LLMUnavailable("down")

    assert svc.suggest_title(long_talk, Down()) is None



# ---------- Voice differentiation ----------

A, B = [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]  # two clearly different voiceprints


def test_voices_keep_their_number_across_chunks():
    first = ChunkVoices([Turn(0, 5, 0), Turn(5, 9, 1)], {0: A, 1: B}, {0: 5.0, 1: 4.0})
    mapping, known = match_voices(first, [])
    assert mapping == {0: 1, 1: 2} and [v["seconds"] for v in known] == [5.0, 4.0]

    # Next chunk: the sides swap (B speaks first, as chunk voice 0).
    second = ChunkVoices([Turn(0, 3, 0), Turn(3, 9, 1)], {0: [0.1, 0.99, 0.0], 1: [0.98, 0.05, 0.0]}, {0: 3.0, 1: 6.0})
    mapping, known = match_voices(second, known)
    assert mapping == {0: 2, 1: 1} and len(known) == 2
    assert known[0]["seconds"] == 11.0

    # A new voice talking long enough is new; a half-second blip isn't.
    third = ChunkVoices([Turn(0, 4, 0), Turn(4, 4.5, 1)], {0: [0.0, 0.0, 1.0], 1: [0.5, 0.5, -0.7]}, {0: 4.0, 1: 0.5})
    mapping, known = match_voices(third, known)
    assert mapping == {0: 3} and len(known) == 3


def test_transcript_lines_are_labeled_by_who_was_talking():
    pieces = [(0.0, 2.0, "hi I'm Sam"), (2.0, 4.5, "I just moved here"), (5.0, 8.0, "nice I'm Jun"), (8.0, 8.4, "yeah")]
    turns = [Turn(0.0, 4.8, 0), Turn(4.9, 8.0, 1)]
    assert label_transcript(pieces, turns, {0: 1, 1: 2}) == (
        "[Speaker 1] hi I'm Sam I just moved here\n[Speaker 2] nice I'm Jun yeah"
    )
    assert label_transcript(pieces, [], {}) == "hi I'm Sam I just moved here nice I'm Jun yeah"


class FakeDiarizer:
    """Two voices: the user (A) and one friend (B), who mentions other names."""

    def chunk_voices(self, path):
        with open(path, "rb") as f:
            data = f.read()
        if data == b"silence":
            return ChunkVoices([], {}, {})
        return ChunkVoices([Turn(0, 10, 0), Turn(10, 20, 1)], {0: A, 1: B}, {0: 10.0, 1: 10.0})


FRIEND_TALK = {
    b"talk": [(0.0, 10.0, "hey how was your week"),
              (10.0, 20.0, "good I'm Jun my sister Lien is visiting and Lucida says hi we're going to Hawaii in December")],
    b"silence": [(0.0, 3.0, "thank you for watching")],
}


class PiecesTranscriber:
    def transcribe(self, path):
        with open(path, "rb") as f:
            pieces = FRIEND_TALK.get(f.read(), [])
        return Transcript(" ".join(p[2] for p in pieces), "en", 20.0, 5, tuple(pieces))


class OverEagerLLM:
    """Adds everyone it hears named, like the model did before; only Jun has a voice."""

    def __init__(self):
        self.calls = []

    def chat_json(self, system, user, schema):
        self.calls.append(user)
        if "title" in schema["properties"]:
            return json.dumps({"title": "Hawaii trip plans"})
        assert "speaker" in schema["properties"]["people"]["items"]["properties"]
        return json.dumps({"people": [
            {"name": "Jun", "speaker": "Speaker 2", "notes": ["Plans: Hawaii trip in December"]},
            {"name": "Lien", "speaker": None},           # only talked about
            {"name": "Lucida", "speaker": "Speaker 7"},  # no such voice
            {"name": "June", "speaker": "speaker 2"},    # same voice as Jun
        ]})


def test_one_voice_is_one_person_and_names_without_a_voice_are_dropped(session_client):
    client = session_client
    llm = OverEagerLLM()
    app.dependency_overrides[get_transcriber] = lambda: PiecesTranscriber()
    app.dependency_overrides[get_llm_client] = lambda: llm
    app.dependency_overrides[get_diarizer] = lambda: FakeDiarizer()

    session = client.post("/sessions", json={}).json()
    assert upload(client, session["id"], 0, b"talk").status_code == 200
    assert upload(client, session["id"], 1, b"silence").status_code == 200

    # The model saw labeled lines and a summary of the voices.
    assert "[Speaker 2] good I'm Jun" in llm.calls[-1]
    assert "Speaker 1 (10 s), Speaker 2 (10 s)" in llm.calls[-1]
    # "thank you for watching" over silence was dropped.
    assert "watching" not in llm.calls[-1]

    finished = client.post(f"/sessions/{session['id']}/finish").json()
    assert [(p["name"], p["speaker"]) for p in finished["people"]] == [("Jun", "Speaker 2")]
    assert "Unsure: also heard as June" in finished["people"][0]["notes"]
    assert finished["title"] == "Hawaii trip plans"

    # Voiceprints are gone once the session ends.
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as conn:
        assert conn.execute("select voices from ambient_sessions where id = %s", (session["id"],)).fetchone()[0] == []
