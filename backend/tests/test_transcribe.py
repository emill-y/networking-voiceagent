import os
from dataclasses import replace

from app.core.config import get_settings
from app.main import app
from app.routes import transcribe as transcribe_route
from app.services.transcription import (
    Transcript,
    TranscriptionUnavailable,
    decode_audio,
    get_transcriber,
)
from tests.conftest import make_wav


class FakeTranscriber:
    """Runs the real decoder but skips the Whisper model."""

    def __init__(self):
        self.paths: list[str] = []

    def transcribe(self, audio_path: str) -> Transcript:
        self.paths.append(audio_path)
        audio = decode_audio(audio_path)
        return Transcript(
            text="I met Jason Chen.",
            language="en",
            audio_seconds=round(audio.size / 16_000, 2),
            latency_ms=5,
        )


def use(transcriber):
    app.dependency_overrides[get_transcriber] = lambda: transcriber


def test_transcribes_audio_and_deletes_the_upload(client):
    fake = FakeTranscriber()
    use(fake)
    response = client.post("/transcribe", files={"audio": ("note.wav", make_wav(), "audio/wav")})
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "I met Jason Chen."
    assert body["audioSeconds"] == 1.0
    assert body["language"] == "en"
    assert not os.path.exists(fake.paths[0])


def test_rejects_non_audio(client):
    use(FakeTranscriber())
    response = client.post("/transcribe", files={"audio": ("notes.txt", b"hello", "text/plain")})
    assert response.status_code == 415


def test_accepts_generic_content_type_with_audio_extension(client):
    use(FakeTranscriber())
    response = client.post(
        "/transcribe", files={"audio": ("note.wav", make_wav(), "application/octet-stream")}
    )
    assert response.status_code == 200


def test_corrupt_audio_is_422_and_cleaned_up(client):
    fake = FakeTranscriber()
    use(fake)
    response = client.post(
        "/transcribe", files={"audio": ("note.m4a", b"definitely not audio" * 50, "audio/m4a")}
    )
    assert response.status_code == 422
    assert "audio" in response.json()["detail"].lower()
    assert not os.path.exists(fake.paths[0])


def test_empty_upload_is_422(client):
    use(FakeTranscriber())
    response = client.post("/transcribe", files={"audio": ("note.m4a", b"", "audio/m4a")})
    assert response.status_code == 422


def test_oversized_upload_is_413(client, monkeypatch):
    use(FakeTranscriber())
    small = replace(get_settings(), max_upload_bytes=1024)
    monkeypatch.setattr(transcribe_route, "get_settings", lambda: small)
    response = client.post("/transcribe", files={"audio": ("note.wav", make_wav(), "audio/wav")})
    assert response.status_code == 413


def test_model_unavailable_is_503(client):
    class Broken:
        def transcribe(self, audio_path):
            raise TranscriptionUnavailable("Could not load Whisper model 'small.en'.")

    use(Broken())
    response = client.post("/transcribe", files={"audio": ("note.wav", make_wav(), "audio/wav")})
    assert response.status_code == 503
