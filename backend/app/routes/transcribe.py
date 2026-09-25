import logging
import os
import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.core.auth import get_current_user_id
from app.core.config import get_settings
from app.schemas.transcription import TranscriptionResponse
from app.services.transcription import (
    AudioDecodeError,
    Transcriber,
    TranscriptionUnavailable,
    get_transcriber,
)

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".m4a", ".mp4", ".aac", ".caf", ".wav", ".webm", ".ogg", ".mp3", ".3gp"}
CHUNK_BYTES = 64 * 1024


def _looks_like_audio(upload: UploadFile) -> bool:
    content_type = (upload.content_type or "").lower()
    extension = Path(upload.filename or "").suffix.lower()
    if content_type.startswith("audio/"):
        return True
    # Some clients label recordings generically; fall back to the extension.
    return content_type in {"", "application/octet-stream", "video/mp4", "video/webm"} and (
        extension in ALLOWED_EXTENSIONS
    )


# A plain `def` (not `async def`) makes FastAPI run this in a worker thread,
# so slow Whisper inference doesn't block other requests.
@router.post("/transcribe", response_model=TranscriptionResponse)
def transcribe(
    audio: UploadFile,
    transcriber: Transcriber = Depends(get_transcriber),
    _user_id: UUID = Depends(get_current_user_id),
) -> TranscriptionResponse:
    if not _looks_like_audio(audio):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Please upload an audio file.")

    max_bytes = get_settings().max_upload_bytes
    # Only the extension from the client's filename is used, never the name
    # itself, so a crafted filename can't influence the path we write to.
    suffix = Path(audio.filename or "").suffix.lower()
    suffix = suffix if suffix in ALLOWED_EXTENSIONS else ".audio"

    fd, temp_path = tempfile.mkstemp(prefix="nomi-", suffix=suffix)
    try:
        written = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := audio.file.read(CHUNK_BYTES):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE,
                        f"Recording is larger than {max_bytes // (1024 * 1024)} MB.",
                    )
                out.write(chunk)
        if written == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The recording is empty.")

        logger.info("Received %.1f KB of audio; transcribing", written / 1024)
        try:
            result = transcriber.transcribe(temp_path)
        except AudioDecodeError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
        except TranscriptionUnavailable as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    finally:
        # Minimal audio retention: the file never outlives the request.
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass

    return TranscriptionResponse(
        text=result.text,
        language=result.language,
        audio_seconds=result.audio_seconds,
        latency_ms=result.latency_ms,
    )
