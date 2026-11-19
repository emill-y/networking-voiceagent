import json
import os

import psycopg
import pytest

from app.core.auth import get_optional_user_id
from app.main import app
from app.services.diarization import ChunkVoices, Turn, VoiceEnrollError, enroll_voice, get_diarizer, match_voices, your_voice
from app.services.llm import get_llm_client
from app.services.transcription import Transcript, get_transcriber
from tests.conftest import OTHER_USER_ID, USER_ID

ME, FRIEND = [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]
ME_IN_A_LOUD_ROOM = [0.8, 0.1, 0.55]  # cosine 0.82 to ME: still me


def test_saving_your_voice_needs_enough_of_you_and_no_one_else():
    print_, seconds = enroll_voice(ChunkVoices([Turn(0, 14, 0)], {0: ME}, {0: 14.0}))
    assert print_ == ME and seconds == 14.0

    with pytest.raises(VoiceEnrollError, match="enough"):
        enroll_voice(ChunkVoices([Turn(0, 3, 0)], {0: ME}, {0: 3.0}))
    with pytest.raises(VoiceEnrollError, match="enough"):
        enroll_voice(ChunkVoices([], {}, {}))
    with pytest.raises(VoiceEnrollError, match="more than one voice"):
        enroll_voice(ChunkVoices([Turn(0, 8, 0), Turn(8, 14, 1)], {0: ME, 1: FRIEND}, {0: 8.0, 1: 6.0}))
    # A cough or a word from someone nearby is fine.
    assert enroll_voice(ChunkVoices([Turn(0, 12, 0), Turn(12, 13, 1)], {0: ME, 1: FRIEND}, {0: 12.0, 1: 1.0}))[1] == 12.0


def test_your_saved_voice_is_voice_zero_in_sessions():
    mapping, known = match_voices(
        ChunkVoices([Turn(0, 8, 0), Turn(8, 15, 1)], {0: ME_IN_A_LOUD_ROOM, 1: FRIEND}, {0: 8.0, 1: 7.0}),
        [your_voice(ME, 14.0)],
    )
    assert mapping == {0: 0, 1: 1}
    assert [v["id"] for v in known] == [0, 1] and known[0]["seconds"] == 22.0


class FakeDiarizer:
    """Recognizes uploads by their bytes."""

    dim = 3  # voiceprint length, like the real model's 192

    VOICES = {
        b"me-reading": ChunkVoices([Turn(0, 15, 0)], {0: ME}, {0: 15.0}),
        b"too-short": ChunkVoices([Turn(0, 2, 0)], {0: ME}, {0: 2.0}),
        b"chat": ChunkVoices([Turn(0, 10, 0), Turn(10, 20, 1)], {0: ME_IN_A_LOUD_ROOM, 1: FRIEND}, {0: 10.0, 1: 10.0}),
    }

    def chunk_voices(self, path):
        with open(path, "rb") as f:
            return self.VOICES[f.read()]


@pytest.fixture
def voice_client(db_client):
    app.dependency_overrides[get_diarizer] = lambda: FakeDiarizer()
    app.dependency_overrides[get_optional_user_id] = lambda: USER_ID
    return db_client


def save(client, data):
    return client.post("/me/voice", files={"audio": ("voice.m4a", data, "audio/mp4")})


def test_save_check_and_forget_your_voice(voice_client):
    client = voice_client
    assert client.get("/me/voice").json() == {"saved": False, "seconds": None, "updatedAt": None}

    assert save(client, b"too-short").status_code == 422
    saved = save(client, b"me-reading")
    assert saved.status_code == 200, saved.text
    assert saved.json()["saved"] is True and saved.json()["seconds"] == 15.0
    assert client.get("/me/voice").json()["saved"] is True

    client.act_as(OTHER_USER_ID)
    assert client.get("/me/voice").json()["saved"] is False  # it's only yours
    client.act_as(USER_ID)

    assert client.delete("/me/voice").status_code == 204
    assert client.get("/me/voice").json()["saved"] is False

    # "Delete all data" removes it too.
    save(client, b"me-reading")
    assert client.delete("/me/data").status_code == 204
    assert client.get("/me/voice").json()["saved"] is False


def test_without_voice_recognition_the_server_says_so(db_client):
    app.dependency_overrides[get_diarizer] = lambda: None
    response = save(db_client, b"me-reading")
    assert response.status_code == 503 and "isn’t set up" in response.json()["detail"]


class ChatTranscriber:
    def transcribe(self, path, prompt=None):
        pieces = ((0.0, 10.0, "hi I'm Stephanie what do you do"), (10.0, 20.0, "I'm Jun I design games for Riot"))
        return Transcript(" ".join(p[2] for p in pieces), "en", 20.0, 5, pieces)


class LLM:
    def __init__(self):
        self.calls = []

    def chat_json(self, system, user, schema):
        self.calls.append(user)
        if "title" in schema["properties"]:
            return json.dumps({"title": "Game design chat"})
        return json.dumps({"people": [
            {"name": "Stephanie", "speaker": "You"},  # the user: never kept
            {"name": "Jun", "speaker": "Speaker 1", "company": "Riot", "role": "Game designer"},
        ]})


def test_sessions_know_which_voice_is_yours(voice_client):
    client = voice_client
    llm = LLM()
    app.dependency_overrides[get_transcriber] = lambda: ChatTranscriber()
    app.dependency_overrides[get_llm_client] = lambda: llm
    assert save(client, b"me-reading").status_code == 200

    session = client.post("/sessions", json={}).json()
    response = client.post(f"/sessions/{session['id']}/chunks", data={"seq": "0"},
                           files={"audio": ("c.m4a", b"chat", "audio/mp4")})
    assert response.status_code == 200, response.text
    sent = llm.calls[-1]
    assert "[You] hi I'm Stephanie" in sent and "[Speaker 1] I'm Jun" in sent
    assert "Lines marked [You] are the user" in sent and "heard most" not in sent

    finished = client.post(f"/sessions/{session['id']}/finish").json()
    assert [(p["name"], p["speaker"]) for p in finished["people"]] == [("Jun", "Speaker 1")]

    # The session's copy of your voice goes when it ends; your saved voice stays.
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as conn:
        assert conn.execute("select voices from ambient_sessions where id = %s", (session["id"],)).fetchone()[0] == []
    assert client.get("/me/voice").json()["saved"] is True


def test_a_voice_saved_with_an_earlier_model_must_be_recorded_again(voice_client):
    client = voice_client
    with psycopg.connect(os.environ["TEST_DATABASE_URL"]) as conn:
        conn.execute("insert into voiceprints (user_id, print, seconds) values (%s, %s, 14)",
                     (USER_ID, json.dumps([0.1] * 256)))
    assert client.get("/me/voice").json()["saved"] is False
    # In a session, the old print is simply never matched.
    mapping, known = match_voices(ChunkVoices([Turn(0, 8, 0)], {0: ME}, {0: 8.0}), [your_voice([0.1] * 256, 14.0)])
    assert mapping == {0: 1} and [v["id"] for v in known] == [0, 1]
