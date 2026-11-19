"""Speech-to-text.

Data in:  a path to an audio file (m4a, webm, wav, mp3, ...).
Data out: a `Transcript` with the text, detected language, and timings.

Two interchangeable implementations of `Transcriber`:

- `WhisperTranscriber` runs faster-whisper locally. The model is large and
  slow to load, so it is loaded once, lazily, and reused.
- `OpenAICompatibleTranscriber` sends the audio to a hosted Whisper that
  speaks OpenAI's /audio/transcriptions format (Groq by default). Fast
  (about a second) and uses the same key as the language model.
- `HuggingFaceTranscriber` sends the audio to a hosted Whisper through
  Hugging Face Inference Providers. Faster on a laptop, but the recording
  leaves your machine, so it is opt-in (TRANSCRIPTION_PROVIDER=huggingface).
"""

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16_000  # Whisper expects 16 kHz mono audio.


class AudioDecodeError(Exception):
    """The file is not audio we can decode (corrupt, empty, or unsupported)."""


class TranscriptionUnavailable(Exception):
    """The speech-to-text model could not be loaded."""


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str | None
    audio_seconds: float
    latency_ms: int
    # Timestamped pieces (start s, end s, text), when the model gives them.
    # Sessions use them to tell which voice said what (services/diarization.py).
    pieces: tuple[tuple[float, float, str], ...] = field(default=())


class Transcriber(Protocol):
    # prompt: optional context (names, the previous sentence) to steer spelling.
    def transcribe(self, audio_path: str, prompt: str | None = None) -> Transcript: ...


def decode_audio(audio_path: str):
    """Decode any container/codec FFmpeg understands into 16 kHz mono floats.

    Uses PyAV (FFmpeg bindings) directly so the server doesn't need the
    full faster-whisper package when transcription happens elsewhere.
    """
    import av
    import numpy as np

    chunks = []
    try:
        with av.open(audio_path) as container:
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(audio=0):
                for resampled in resampler.resample(frame):
                    chunks.append(resampled.to_ndarray())
            for resampled in resampler.resample(None):  # flush
                chunks.append(resampled.to_ndarray())
    except Exception as exc:  # FFmpeg raises several error types for bad input.
        raise AudioDecodeError("Could not read that audio file.") from exc
    if not chunks:
        raise AudioDecodeError("The recording is empty.")
    audio = np.concatenate(chunks, axis=1).reshape(-1).astype(np.float32) / 32768.0
    if audio.size == 0:
        raise AudioDecodeError("The recording is empty.")
    return audio


class WhisperTranscriber:
    def __init__(self, model_name: str, device: str, compute_type: str) -> None:
        self._model_name = model_name
        self._device = device
        self._compute_type = compute_type
        self._model = None
        self._lock = threading.Lock()

    def _get_model(self):
        # Double-checked locking so two first requests don't both load it.
        if self._model is None:
            with self._lock:
                if self._model is None:
                    try:
                        from faster_whisper import WhisperModel
                    except ImportError as exc:
                        raise TranscriptionUnavailable(
                            "Local Whisper isn't installed (pip install -r requirements-local.txt)."
                        ) from exc

                    started = time.perf_counter()
                    logger.info(
                        "Loading Whisper %s (the first time, this downloads it; can take minutes)",
                        self._model_name,
                    )
                    try:
                        self._model = WhisperModel(
                            self._model_name,
                            device=self._device,
                            compute_type=self._compute_type,
                        )
                    except Exception as exc:
                        raise TranscriptionUnavailable(
                            f"Could not load Whisper model '{self._model_name}'."
                        ) from exc
                    logger.info(
                        "Loaded Whisper %s in %.1fs",
                        self._model_name,
                        time.perf_counter() - started,
                    )
        return self._model

    def transcribe(self, audio_path: str, prompt: str | None = None) -> Transcript:
        started = time.perf_counter()
        audio = decode_audio(audio_path)
        model = self._get_model()
        # vad_filter trims silence, which speeds things up and reduces
        # Whisper's tendency to hallucinate text during long pauses.
        segments, info = model.transcribe(audio, beam_size=5, vad_filter=True, initial_prompt=prompt)
        pieces = tuple((round(s.start, 2), round(s.end, 2), s.text.strip()) for s in segments)
        text = " ".join(piece[2] for piece in pieces).strip()
        latency_ms = int((time.perf_counter() - started) * 1000)
        audio_seconds = round(audio.size / SAMPLE_RATE, 2)
        # Log timings, never the transcript itself (it is personal data).
        logger.info("Transcribed %.1fs of audio in %dms", audio_seconds, latency_ms)
        return Transcript(
            text=text,
            language=getattr(info, "language", None),
            audio_seconds=audio_seconds,
            latency_ms=latency_ms,
            pieces=pieces,
        )


class HuggingFaceTranscriber:
    def __init__(self, token: str | None, provider: str, model: str, client=None) -> None:
        self._token = token
        self._provider = provider
        self._model = model
        self._client = client  # injectable for tests

    def _get_client(self):
        if self._client is None:
            if not self._token:
                raise TranscriptionUnavailable("HF_TOKEN is not set for hosted transcription.")
            from huggingface_hub import InferenceClient

            self._client = InferenceClient(
                provider=self._provider, api_key=self._token, timeout=120
            )
        return self._client

    def transcribe(self, audio_path: str, prompt: str | None = None) -> Transcript:
        started = time.perf_counter()
        # Decode locally first: rejects corrupt files before uploading them
        # anywhere, and tells us the duration.
        audio = decode_audio(audio_path)
        client = self._get_client()
        try:
            output = client.automatic_speech_recognition(audio_path, model=self._model)
        except Exception as exc:  # network, auth, quota, provider errors
            logger.warning("Hosted transcription failed: %s", type(exc).__name__)
            raise TranscriptionUnavailable(
                f"Hosted transcription ({self._provider}/{self._model}) is unavailable."
            ) from exc
        latency_ms = int((time.perf_counter() - started) * 1000)
        audio_seconds = round(audio.size / SAMPLE_RATE, 2)
        logger.info("Hosted transcription of %.1fs took %dms", audio_seconds, latency_ms)
        return Transcript(
            text=(output.text or "").strip(),
            language=None,
            audio_seconds=audio_seconds,
            latency_ms=latency_ms,
        )


class OpenAICompatibleTranscriber:
    def __init__(self, base_url: str, api_key: str | None, model: str, timeout_seconds: float = 60) -> None:
        self._url = f"{base_url}/audio/transcriptions"
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_seconds

    def transcribe(self, audio_path: str, prompt: str | None = None) -> Transcript:
        started = time.perf_counter()
        # Decode locally first: rejects bad files before uploading, and gives the duration.
        audio = decode_audio(audio_path)
        if not self._api_key:
            raise TranscriptionUnavailable("LLM_API_KEY is not set for hosted transcription.")
        # If the provider refuses the request itself (a model this account can't
        # use, a context prompt it won't take), try again the plain way: no
        # prompt, then the widely available model. Rate limits and outages aren't
        # retried here; the app retries the chunk later.
        attempts = [(self._model, prompt)]
        if prompt:
            attempts.append((self._model, None))
        if self._model != FALLBACK_STT_MODEL:
            attempts.append((FALLBACK_STT_MODEL, None))
        body: dict = {}
        for i, (model, context) in enumerate(attempts):
            try:
                body = self._request(audio_path, model, context)
            except _Rejected as exc:
                logger.warning("Hosted transcription refused (%s, status %s): %s", model, exc.status, exc.reason)
                if i == len(attempts) - 1:
                    raise TranscriptionUnavailable(_refusal_message(exc)) from exc
                continue
            if model != self._model:
                logger.warning("Using %s for speech-to-text from now on (%s was refused)", model, self._model)
                self._model = model  # don't ask for the refused model on every chunk
            break
        try:
            text = body["text"]
            pieces = tuple(
                (round(float(s["start"]), 2), round(float(s["end"]), 2), str(s.get("text") or "").strip())
                for s in body.get("segments") or []
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise TranscriptionUnavailable("Speech-to-text sent back something unexpected.") from exc
        latency_ms = int((time.perf_counter() - started) * 1000)
        audio_seconds = round(audio.size / SAMPLE_RATE, 2)
        logger.info("Hosted transcription of %.1fs took %dms", audio_seconds, latency_ms)
        return Transcript(text=(text or "").strip(), language="en",
                          audio_seconds=audio_seconds, latency_ms=latency_ms, pieces=pieces)

    def _request(self, audio_path: str, model: str, prompt: str | None) -> dict:
        import httpx

        try:
            with open(audio_path, "rb") as file:
                response = httpx.post(
                    self._url,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    # verbose_json adds timestamped segments, used to label who spoke.
                    data={"model": model, "language": "en", "response_format": "verbose_json", "temperature": "0",
                          **({"prompt": prompt} if prompt else {})},
                    files={"file": (os.path.basename(audio_path), file)},
                    timeout=self._timeout,
                )
        except httpx.HTTPError as exc:
            logger.warning("Hosted transcription failed to connect (%s)", type(exc).__name__)
            raise TranscriptionUnavailable("Couldn’t reach speech-to-text. Retrying.") from exc
        if response.status_code in (401, 403):
            logger.error("Hosted transcription: the API key was refused (status %s): %s",
                         response.status_code, _error_text(response))
            raise TranscriptionUnavailable(
                "Speech-to-text refused the API key. Set a new LLM_API_KEY in Vercel and redeploy."
            )
        if response.status_code == 429:
            logger.warning("Hosted transcription rate limited: %s", _error_text(response))
            raise TranscriptionUnavailable("Speech-to-text is at its free limit right now. Retrying.")
        if response.status_code >= 500:
            logger.warning("Hosted transcription unavailable (status %s): %s", response.status_code, _error_text(response))
            raise TranscriptionUnavailable("Speech-to-text is down for a moment. Retrying.")
        if response.status_code >= 400:
            raise _Rejected(response.status_code, _error_text(response))
        try:
            return response.json()
        except ValueError as exc:
            raise TranscriptionUnavailable("Speech-to-text sent back something unexpected.") from exc


# Groq's long-standing speech model, used when the configured one is refused.
FALLBACK_STT_MODEL = "whisper-large-v3-turbo"


class _Rejected(Exception):
    def __init__(self, status: int, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


def _refusal_message(exc: _Rejected) -> str:
    return f"Speech-to-text refused the audio ({exc.status}): {exc.reason}" if exc.reason else \
        f"Speech-to-text refused the audio ({exc.status})."


def _error_text(response) -> str:
    """The provider's own explanation (never the audio or the transcript)."""
    try:
        error = response.json().get("error", {})
        return (error.get("message", "") if isinstance(error, dict) else str(error))[:300]
    except ValueError:
        return response.text[:300]


_transcriber: Transcriber | None = None


def build_transcriber(settings) -> Transcriber:
    if settings.transcription_provider == "openai_compatible":
        return OpenAICompatibleTranscriber(settings.llm_base_url, settings.llm_api_key, settings.stt_model)
    if settings.transcription_provider == "huggingface":
        return HuggingFaceTranscriber(
            settings.hf_token, settings.hf_inference_provider, settings.hf_asr_model
        )
    if settings.transcription_provider != "local":
        raise ValueError(
            f"Unknown TRANSCRIPTION_PROVIDER '{settings.transcription_provider}' "
            "(use 'local', 'openai_compatible' or 'huggingface')."
        )
    return WhisperTranscriber(
        settings.whisper_model, settings.whisper_device, settings.whisper_compute_type
    )


def get_transcriber() -> Transcriber:
    """FastAPI dependency. Tests override this with a fake."""
    global _transcriber
    if _transcriber is None:
        _transcriber = build_transcriber(get_settings())
    return _transcriber
