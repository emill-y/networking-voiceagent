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
    def transcribe(self, path, prompt=None):
        with open(path, "rb") as f:
            data = f.read()
        return Transcript(SPEECH.get(data, ""), "en", 30.0, 5)


class ConversationLLM:
    """Finds people by the names in the window, like the model would."""

    def __init__(self):
        self.calls = []

    def chat_json(self, system, user, schema):
        if system.startswith("You read the transcript of a networking event"):
            return json.dumps({"people": []})  # the end read finds nothing: live results stay
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


def test_the_whole_session_read_gives_each_persons_conversation():
    windows = {
        "0": [{"name": "Sarah Kim", "conversation": ["She studies bioengineering."]}],
        "1": [{"name": "Sarah", "conversation": ["She climbs on weekends."], "interests": ["climbing"]}],
        svc.FULL_KEY: [{"name": "Sarah Kim", "conversation": [
            "She studies bioengineering at Berkeley.", "She climbs at Mission Cliffs on weekends."]}],
    }
    sarah = svc.merge_people(windows, None)[0]
    assert sarah.conversation == ["She studies bioengineering at Berkeley.", "She climbs at Mission Cliffs on weekends."]
    assert sarah.interests == ["climbing"]
    # Without the full read, every window's notes are kept, in order.
    del windows[svc.FULL_KEY]
    assert svc.merge_people(windows, None)[0].conversation == ["She studies bioengineering.", "She climbs on weekends."]


def test_speech_to_text_gets_names_and_the_previous_sentence():
    segments = [{"seq": 0, "text": "so I've been working on protein", "seconds": 20}]
    prompt = svc.transcription_prompt(segments, 1, "Cal Hacks", ["Sarah Kim", "Jason Chen"])
    assert prompt == "Cal Hacks. Sarah Kim, Jason Chen. so I've been working on protein"
    assert svc.transcription_prompt([], 0, None, []) is None


def test_conversation_notes_are_saved_under_the_person(session_client):
    client = session_client
    session = client.post("/sessions", json={"title": "Mixer"}).json()
    upload(client, session["id"], 0, b"c0")
    client.post(f"/sessions/{session['id']}/finish")
    person = {"contactId": None, "contact": {"name": "Sarah Kim"},
              "interaction": {"event": "Mixer", "summary": "She studies bioengineering at Berkeley.\nShe wants to get coffee."}}
    saved = client.post(f"/sessions/{session['id']}/save", json={"people": [person]}).json()
    contact = client.get(f"/contacts/{saved['contacts'][0]['id']}").json()
    assert contact["interactions"][0]["summary"] == "She studies bioengineering at Berkeley.\nShe wants to get coffee."


def test_the_end_read_tells_people_apart_and_writes_detailed_notes():
    from app.services import session_notes

    segments = [
        {"seq": 0, "text": "hey bro what are you working on", "seconds": 20},
        {"seq": 1, "text": "I'm building a drone delivery startup for campus, we need hardware people", "seconds": 20},
        {"seq": 2, "text": "nice to meet you, I'm at Airbnb doing design, I climb at Mission Cliffs", "seconds": 20},
        {"seq": 3, "text": "you should come climbing Thursday", "seconds": 20},
    ]

    class Model:
        def __init__(self):
            self.messages = []

        def chat_json(self, system, user, schema):
            self.messages.append(user)
            if system == session_notes.SPLIT_PROMPT:
                return json.dumps({"people": [
                    {"name": None, "label": "Drone startup founder", "chunks": [0, 1]},
                    {"name": None, "label": "Airbnb designer who climbs", "chunks": [2, 3]},
                ]})
            if "Drone startup founder" in user.splitlines()[0]:
                return json.dumps({"projects": ["drone delivery startup"], "needs": ["hardware people"], "conversation": [
                    "## What they're working on", "They're building a drone delivery startup for campus.",
                    "## Next steps", "They need hardware people."]})
            return json.dumps({"company": "Airbnb", "role": "Designer", "interests": ["climbing"], "conversation": [
                "## About them", "They design at Airbnb.", "They climb at Mission Cliffs.",
                "## Next steps", "They invited me climbing on Thursday."]})

    model = Model()
    notes = session_notes.write_notes(segments, model, None, "Mixer", "Maya", [])
    assert [(p["label"], p.get("company")) for p in notes] == [("Drone startup founder", None), ("Airbnb designer who climbs", "Airbnb")]
    assert notes[1]["conversation"][0] == "## About them"
    assert "[#2]" in model.messages[0]  # the split sees chunk numbers
    # Each person's notes come from just their part of the transcript (plus a chunk either side).
    founder_text = next(m for m in model.messages[1:] if "Drone startup founder" in m)
    assert "drone delivery" in founder_text and "Thursday" not in founder_text

    # The end read decides who's who; a live guess that lumped them together is dropped.
    windows = {"0": [{"name": None, "label": "Someone from Mixer", "interests": ["drones"]}], svc.FULL_KEY: notes}
    people = svc.merge_people(windows, "Mixer")
    assert [p.label for p in people] == ["Drone startup founder", "Airbnb designer who climbs"]


def test_the_end_read_gives_up_gracefully():
    from app.services import session_notes

    class Down:
        def chat_json(self, *a):
            raise LLMUnavailable("down")

    segments = [{"seq": 0, "text": "hello there I'm Sarah and I study chemistry at Berkeley nice to meet you", "seconds": 20}]
    assert session_notes.write_notes(segments, Down(), None, None, None, []) is None
    assert session_notes.write_notes([{"seq": 0, "text": "hi", "seconds": 1}], Down(), None, None, None, []) is None
