"""Voice differentiation (speaker diarization): who spoke when.

Data in:  one ~20-second session chunk (an audio file), plus the voices
          already heard earlier in the session.
Data out: the chunk's transcript with a "[Speaker N]" label on each line,
          where the same N means the same voice for the whole session.

Three steps:

1. Within the chunk, sherpa-onnx (https://github.com/k2-fsa/sherpa-onnx) runs
   pyannote's segmentation model to find stretches of speech and groups them
   by voice: "voice A spoke 0-4s, voice B 4-9s, voice A again 9-15s".
2. Across chunks, each voice gets a voiceprint (a list of 256 numbers from the
   WeSpeaker model). Voiceprints of the same person point in nearly the same
   direction, so we compare them with cosine similarity: a close match to a
   voice heard earlier keeps that voice's number, otherwise it's a new voice.
3. Whisper's timestamped pieces of text are given to the voice that was
   talking during them.

The language model then reads labeled lines instead of an unlabeled blur, so
it can count the voices and tie each person to one.

If the user saved their voice (the You page), it's voice 0 from the start of
every session: their lines read "[You] ..." and they're never added as
someone they met.

Voiceprints are biometric data: a session's are kept only while it's open,
and deleted when it ends (see repositories/sessions.py). The user's own is
kept until they delete it (repositories/voiceprints.py).
"""

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.core.config import get_settings
from app.services.transcription import SAMPLE_RATE, decode_audio

logger = logging.getLogger(__name__)

# Cosine similarity at or above this means "the same voice as before". Measured
# with these models: one voice scores 0.9+ against itself across clips; two
# different (fairly similar) voices scored about 0.6.
SAME_VOICE = 0.65
# How readily the segmentation step splits a chunk into separate voices
# (lower = splits more). 0.5 merged two clearly different voices; 0.3 split them.
CLUSTER_THRESHOLD = 0.3
# Your saved voice was recorded up close and quietly; in a session the phone may
# be in a pocket in a loud room, so it's matched a little more loosely.
SAME_VOICE_AS_YOU = 0.6
YOU = 0  # the voice number reserved for the user's saved voice
# Saving your voice needs at least this much of you talking, and nobody else.
MIN_ENROLL_SECONDS = 6.0
# Voiceprints from less speech than this are unreliable: never start a new voice
# from them (they can still match a voice already heard).
MIN_NEW_VOICE_SECONDS = 1.0
# Enough speech per voice for a steady voiceprint; more just costs time.
MAX_PRINT_SECONDS = 15.0


@dataclass(frozen=True)
class Turn:
    """A stretch of one voice talking, in seconds from the start of the chunk."""

    start: float
    end: float
    voice: int  # this chunk's voice number (0, 1, ...), not yet the session's


@dataclass(frozen=True)
class ChunkVoices:
    turns: list[Turn]
    prints: dict[int, list[float]]  # this chunk's voice number -> voiceprint
    seconds: dict[int, float]  # how long each voice talked in this chunk


class Diarizer:
    """sherpa-onnx diarization. Models are loaded once, on first use."""

    def __init__(self, model_dir: str) -> None:
        self._dir = Path(model_dir)
        self._lock = threading.Lock()
        self._diarizer = None
        self._embedder = None

    def _load(self):
        with self._lock:
            if self._diarizer is None:
                import sherpa_onnx

                embedding = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(self._dir / "embedding.onnx"))
                config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
                    segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
                        pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                            model=str(self._dir / "segmentation.onnx")
                        ),
                    ),
                    embedding=embedding,
                    # The number of voices isn't known; group by similarity.
                    clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=CLUSTER_THRESHOLD),
                    min_duration_on=0.3,
                    min_duration_off=0.5,
                )
                self._embedder = sherpa_onnx.SpeakerEmbeddingExtractor(embedding)
                self._diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
        return self._diarizer, self._embedder

    def chunk_voices(self, audio_path: str) -> ChunkVoices:
        audio = decode_audio(audio_path)
        diarizer, embedder = self._load()
        turns = [Turn(round(t.start, 2), round(t.end, 2), t.speaker) for t in diarizer.process(audio).sort_by_start_time()]
        prints, seconds = {}, {}
        for voice in sorted({t.voice for t in turns}):
            mine = [t for t in turns if t.voice == voice]
            seconds[voice] = round(sum(t.end - t.start for t in mine), 2)
            samples = _collect(audio, mine)
            if samples.size < SAMPLE_RATE * 0.5:  # too little to fingerprint
                continue
            stream = embedder.create_stream()
            stream.accept_waveform(SAMPLE_RATE, samples)
            stream.input_finished()
            prints[voice] = list(embedder.compute(stream))
        return ChunkVoices(turns, prints, seconds)


class VoiceEnrollError(Exception):
    """The recording can't be used as the user's voice (too short, several voices)."""


def enroll_voice(chunk: ChunkVoices) -> tuple[list[float], float]:
    """(voiceprint, seconds of speech) of the one person in a recording of the
    user reading aloud. Rejects recordings with too little speech, or with a
    second voice that talks for more than a moment (that print could be anyone's)."""
    talkers = sorted((v for v in chunk.prints), key=lambda v: -chunk.seconds.get(v, 0))
    if not talkers or chunk.seconds.get(talkers[0], 0) < MIN_ENROLL_SECONDS:
        raise VoiceEnrollError("We couldn’t hear enough of you. Read the whole passage aloud, then try again.")
    main = talkers[0]
    others = sum(chunk.seconds.get(v, 0) for v in chunk.seconds if v != main)
    if others > max(2.0, 0.25 * chunk.seconds[main]):
        raise VoiceEnrollError("We heard more than one voice. Record somewhere quiet, on your own.")
    return [float(x) for x in chunk.prints[main]], round(chunk.seconds[main], 2)


def your_voice(print_: list[float], seconds: float) -> dict:
    """The user's saved voice, as the first entry of a session's voices."""
    return {"id": YOU, "print": [float(x) for x in print_], "seconds": round(seconds, 2), "saved": round(seconds, 2)}


def you_heard(voices: list[dict]) -> bool:
    """Has the user's saved voice been heard in this session yet?"""
    return any(v["id"] == YOU and v["seconds"] > v.get("saved", 0) for v in voices)


def _collect(audio: np.ndarray, turns: list[Turn]) -> np.ndarray:
    parts, total = [], 0
    for turn in turns:
        part = audio[int(turn.start * SAMPLE_RATE): int(turn.end * SAMPLE_RATE)]
        parts.append(part)
        total += part.size
        if total >= MAX_PRINT_SECONDS * SAMPLE_RATE:
            break
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


def _cosine(a: list[float], b: list[float]) -> float:
    x, y = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    norm = float(np.linalg.norm(x) * np.linalg.norm(y))
    return float(x @ y) / norm if norm else 0.0


def match_voices(chunk: ChunkVoices, known: list[dict]) -> tuple[dict[int, int], list[dict]]:
    """Give each of the chunk's voices its session-wide number.

    `known` is the session's voices so far: [{"id": 1, "print": [...], "seconds": 12.5}].
    Returns (chunk voice -> session voice id, updated known voices). A voice's
    print is kept as a running average weighted by talk time, so it steadies
    as the session goes on. If the chunk split one person into two voices, both
    match the same earlier voice and get the same id.
    """
    known = [dict(v) for v in known]
    mapping: dict[int, int] = {}
    # Longest talkers first: their voiceprints are the most reliable.
    for voice in sorted(chunk.prints, key=lambda v: -chunk.seconds.get(v, 0)):
        vec = chunk.prints[voice]
        # How far each known voice is above the bar it has to clear.
        scores = [(_cosine(vec, k["print"]) - (SAME_VOICE_AS_YOU if k["id"] == YOU else SAME_VOICE), k) for k in known]
        best_score, best = max(scores, key=lambda s: s[0], default=(-1.0, None))
        talk = chunk.seconds.get(voice, 0.0)
        if best is not None and best_score >= 0:
            total = best["seconds"] + talk
            if total > 0:
                best["print"] = [(a * best["seconds"] + b * talk) / total for a, b in zip(best["print"], vec)]
            best["seconds"] = round(total, 2)
            mapping[voice] = best["id"]
        elif talk >= MIN_NEW_VOICE_SECONDS:
            new_id = max((k["id"] for k in known), default=0) + 1
            known.append({"id": new_id, "print": [float(x) for x in vec], "seconds": round(talk, 2)})
            mapping[voice] = new_id
    return mapping, known


def label_transcript(pieces: list[tuple[float, float, str]], turns: list[Turn], mapping: dict[int, int]) -> str:
    """'[Speaker 1] hi I'm Sam\\n[Speaker 2] nice to meet you', from Whisper's
    timestamped pieces and the voices talking at those times. A piece with no
    clear voice keeps the label before it; consecutive pieces by one voice join."""
    lines: list[tuple[int | None, str]] = []
    for start, end, text in pieces:
        text = text.strip()
        if not text:
            continue
        overlap: dict[int, float] = {}
        for turn in turns:
            if turn.voice in mapping:
                shared = min(end, turn.end) - max(start, turn.start)
                if shared > 0:
                    overlap[mapping[turn.voice]] = overlap.get(mapping[turn.voice], 0) + shared
        voice = max(overlap, key=overlap.get) if overlap else (lines[-1][0] if lines else None)
        if lines and lines[-1][0] == voice:
            lines[-1] = (voice, f"{lines[-1][1]} {text}")
        else:
            lines.append((voice, text))
    return "\n".join(f"[{_label(v)}] {t}" if v is not None else t for v, t in lines)


def _label(voice: int) -> str:
    return "You" if voice == YOU else f"Speaker {voice}"


_diarizer: Diarizer | None = None
_checked = False


def get_diarizer() -> Diarizer | None:
    """FastAPI dependency: the diarizer, or None when it's off or not set up
    (sessions then work as before, without voice labels). Tests override this."""
    global _diarizer, _checked
    if not _checked:
        _checked = True
        settings = get_settings()
        model_dir = Path(settings.diarization_model_dir)
        if not settings.diarization:
            logger.info("Voice differentiation is off (DIARIZATION=off)")
        elif not (model_dir / "segmentation.onnx").exists() or not (model_dir / "embedding.onnx").exists():
            logger.warning("Voice differentiation models not found in %s; run python -m scripts.download_diarization_models", model_dir)
        else:
            try:
                import sherpa_onnx  # noqa: F401
            except ImportError:
                logger.warning("Voice differentiation needs sherpa-onnx (pip install -r requirements-local.txt)")
            else:
                _diarizer = Diarizer(str(model_dir))
    return _diarizer
