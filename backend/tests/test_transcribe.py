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


# ---------- Hosted (Hugging Face) provider ----------

import pytest  # noqa: E402

from app.services.transcription import (  # noqa: E402
    HuggingFaceTranscriber,
    WhisperTranscriber,
    build_transcriber,
)
from tests.conftest import make_wav as _wav  # noqa: E402


class FakeInferenceClient:
    def __init__(self, text="I met Jason Chen.", error=None):
        self.text, self.error, self.calls = text, error, []

    def automatic_speech_recognition(self, audio, model):
        self.calls.append((audio, model))
        if self.error:
            raise self.error

        class Output:
            pass

        output = Output()
        output.text = self.text
        return output


def _wav_file(tmp_path):
    path = tmp_path / "note.wav"
    path.write_bytes(_wav())
    return str(path)


def test_hosted_transcription(tmp_path):
    client = FakeInferenceClient(text="  I met Jason Chen.  ")
    transcriber = HuggingFaceTranscriber("hf_x", "fal-ai", "openai/whisper-large-v3", client=client)
    result = transcriber.transcribe(_wav_file(tmp_path))
    assert result.text == "I met Jason Chen."
    assert result.audio_seconds == 1.0
    assert client.calls[0][1] == "openai/whisper-large-v3"


def test_hosted_rejects_corrupt_audio_before_uploading(tmp_path):
    path = tmp_path / "bad.m4a"
    path.write_bytes(b"not audio" * 20)
    client = FakeInferenceClient()
    transcriber = HuggingFaceTranscriber("hf_x", "fal-ai", "m", client=client)
    with pytest.raises(Exception) as info:
        transcriber.transcribe(str(path))
    assert type(info.value).__name__ == "AudioDecodeError"
    assert client.calls == []


def test_hosted_errors_become_unavailable(tmp_path):
    client = FakeInferenceClient(error=RuntimeError("401"))
    transcriber = HuggingFaceTranscriber("hf_x", "fal-ai", "m", client=client)
    with pytest.raises(TranscriptionUnavailable):
        transcriber.transcribe(_wav_file(tmp_path))


def test_hosted_without_token_is_unavailable(tmp_path):
    with pytest.raises(TranscriptionUnavailable, match="HF_TOKEN"):
        HuggingFaceTranscriber(None, "fal-ai", "m").transcribe(_wav_file(tmp_path))


def test_provider_selection():
    base = get_settings()
    assert isinstance(build_transcriber(replace(base, transcription_provider="local")), WhisperTranscriber)
    hosted = build_transcriber(replace(base, transcription_provider="huggingface", hf_token="hf_x"))
    assert isinstance(hosted, HuggingFaceTranscriber)
    with pytest.raises(ValueError):
        build_transcriber(replace(base, transcription_provider="cloud"))


def test_hosted_openai_compatible_transcription(tmp_path, monkeypatch):
    import httpx

    from app.services.transcription import OpenAICompatibleTranscriber

    seen = {}

    def fake_post(url, headers, data, files, timeout):
        seen.update(url=url, auth=headers["Authorization"], model=data["model"], name=files["file"][0])
        return httpx.Response(200, json={"text": " I met Jason Chen. "}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    result = OpenAICompatibleTranscriber("https://api.groq.com/openai/v1", "gsk_x", "whisper-large-v3").transcribe(
        _wav_file(tmp_path)
    )
    assert result.text == "I met Jason Chen."
    assert seen == {
        "url": "https://api.groq.com/openai/v1/audio/transcriptions",
        "auth": "Bearer gsk_x",
        "model": "whisper-large-v3",
        "name": "note.wav",
    }


def test_hosted_openai_compatible_errors(tmp_path, monkeypatch):
    import httpx

    from app.services.transcription import OpenAICompatibleTranscriber

    monkeypatch.setattr(
        httpx, "post",
        lambda url, **kw: httpx.Response(429, json={}, request=httpx.Request("POST", url)),
    )
    with pytest.raises(TranscriptionUnavailable):
        OpenAICompatibleTranscriber("https://x", "k", "m").transcribe(_wav_file(tmp_path))
    with pytest.raises(TranscriptionUnavailable, match="LLM_API_KEY"):
        OpenAICompatibleTranscriber("https://x", None, "m").transcribe(_wav_file(tmp_path))


def test_openai_compatible_transcriber_selection():
    from app.services.transcription import OpenAICompatibleTranscriber

    hosted = build_transcriber(replace(get_settings(), transcription_provider="openai_compatible", llm_api_key="k"))
    assert isinstance(hosted, OpenAICompatibleTranscriber)


def test_hosted_transcription_is_the_default_with_a_model_key(monkeypatch):
    monkeypatch.delenv("TRANSCRIPTION_PROVIDER", raising=False)
    monkeypatch.setenv("LLM_API_KEY", "k")
    assert get_settings().transcription_provider == "openai_compatible"
    monkeypatch.setenv("TRANSCRIPTION_PROVIDER", "local")
    assert get_settings().transcription_provider == "local"


def test_hosted_transcription_falls_back_when_the_model_is_refused(tmp_path, monkeypatch):
    import httpx

    from app.services.transcription import FALLBACK_STT_MODEL, OpenAICompatibleTranscriber

    asked = []

    def fake_post(url, headers, data, files, timeout):
        asked.append((data["model"], data.get("prompt")))
        if data["model"] == "whisper-large-v3":
            return httpx.Response(404, json={"error": {"message": "model not available"}}, request=httpx.Request("POST", url))
        return httpx.Response(200, json={"text": "hi I'm Sam"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    stt = OpenAICompatibleTranscriber("https://x", "k", "whisper-large-v3")
    assert stt.transcribe(_wav_file(tmp_path), prompt="Cal Hacks.").text == "hi I'm Sam"
    assert asked == [("whisper-large-v3", "Cal Hacks."), ("whisper-large-v3", None), (FALLBACK_STT_MODEL, None)]
    # Remembered: the next chunk goes straight to the model that works.
    asked.clear()
    stt.transcribe(_wav_file(tmp_path))
    assert asked == [(FALLBACK_STT_MODEL, None)]

    # A rate limit isn't a rejection: no fallback, the app retries later.
    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(429, json={}, request=httpx.Request("POST", url)))
    with pytest.raises(TranscriptionUnavailable, match="free limit"):
        OpenAICompatibleTranscriber("https://x", "k", "whisper-large-v3").transcribe(_wav_file(tmp_path))


def test_a_cancelled_api_key_says_so(tmp_path, monkeypatch):
    import httpx

    from app.services.transcription import OpenAICompatibleTranscriber

    monkeypatch.setattr(httpx, "post", lambda url, **kw: httpx.Response(
        401, json={"error": {"message": "Invalid API Key"}}, request=httpx.Request("POST", url)))
    with pytest.raises(TranscriptionUnavailable, match="refused the API key"):
        OpenAICompatibleTranscriber("https://x", "k", "whisper-large-v3").transcribe(_wav_file(tmp_path))
