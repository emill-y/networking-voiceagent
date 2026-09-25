"""Speech-to-text with faster-whisper.

Data in:  a path to an audio file (m4a, webm, wav, mp3, ...).
Data out: a `Transcript` with the text, detected language, and timings.

The Whisper model is large (hundreds of MB) and slow to load, so it is
loaded once, lazily, on the first request, and reused afterwards.
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
    """Decode any container/codec PyAV understands into 16 kHz mono floats."""
    from faster_whisper import decode_audio as fw_decode

    try:
        audio = fw_decode(audio_path, sampling_rate=SAMPLE_RATE)
    except Exception as exc:  # PyAV raises several error types for bad input.
        raise AudioDecodeError("Could not read that audio file.") from exc
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
                    from faster_whisper import WhisperModel

                    started = time.perf_counter()
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


_transcriber: Transcriber | None = None


def get_transcriber() -> Transcriber:
    """FastAPI dependency. Tests override this with a fake."""
    global _transcriber
    if _transcriber is None:
        settings = get_settings()
        _transcriber = WhisperTranscriber(
            settings.whisper_model, settings.whisper_device, settings.whisper_compute_type
        )
    return _transcriber
