"""Speech-to-text.

Data in:  a path to an audio file (m4a, webm, wav, mp3, ...).
Data out: a `Transcript` with the text, detected language, and timings.

Two interchangeable implementations of `Transcriber`:

- `WhisperTranscriber` runs faster-whisper locally. The model is large and
  slow to load, so it is loaded once, lazily, and reused.
- `HuggingFaceTranscriber` sends the audio to a hosted Whisper through
  Hugging Face Inference Providers. Faster on a laptop, but the recording
  leaves your machine, so it is opt-in (TRANSCRIPTION_PROVIDER=huggingface).
"""

import logging
import threading
import time
from dataclasses import dataclass
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


class Transcriber(Protocol):
    def transcribe(self, audio_path: str) -> Transcript: ...


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

    def transcribe(self, audio_path: str) -> Transcript:
        started = time.perf_counter()
        audio = decode_audio(audio_path)
        model = self._get_model()
        # vad_filter trims silence, which speeds things up and reduces
        # Whisper's tendency to hallucinate text during long pauses.
        segments, info = model.transcribe(audio, beam_size=5, vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        latency_ms = int((time.perf_counter() - started) * 1000)
        audio_seconds = round(audio.size / SAMPLE_RATE, 2)
        # Log timings, never the transcript itself (it is personal data).
        logger.info("Transcribed %.1fs of audio in %dms", audio_seconds, latency_ms)
        return Transcript(
            text=text,
            language=getattr(info, "language", None),
            audio_seconds=audio_seconds,
            latency_ms=latency_ms,
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

    def transcribe(self, audio_path: str) -> Transcript:
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


_transcriber: Transcriber | None = None


def build_transcriber(settings) -> Transcriber:
    if settings.transcription_provider == "huggingface":
        return HuggingFaceTranscriber(
            settings.hf_token, settings.hf_inference_provider, settings.hf_asr_model
        )
    if settings.transcription_provider != "local":
        raise ValueError(
            f"Unknown TRANSCRIPTION_PROVIDER '{settings.transcription_provider}' "
            "(use 'local' or 'huggingface')."
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
