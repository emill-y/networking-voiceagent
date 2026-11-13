import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.core.rate_limit import limit_ai_requests
from app.schemas.transcription import TranscriptionResponse
from app.services import audio_upload
from app.services.transcription import (
    AudioDecodeError,
    Transcriber,
    TranscriptionUnavailable,
    get_transcriber,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def transcribe_upload(audio: UploadFile, transcriber: Transcriber, prompt: str | None = None):
    """Save, transcribe and delete one uploaded recording."""
    temp_path = audio_upload.save_to_temp(audio, get_settings().max_upload_bytes)
    try:
        logger.info("Received %.1f KB of audio; transcribing", os.path.getsize(temp_path) / 1024)
        try:
            return transcriber.transcribe(temp_path, prompt=prompt) if prompt else transcriber.transcribe(temp_path)
        except AudioDecodeError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
        except TranscriptionUnavailable as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    finally:
        # Minimal audio retention: the file never outlives the request.
        audio_upload.remove(temp_path)


# A plain `def` (not `async def`) makes FastAPI run this in a worker thread,
# so slow Whisper inference doesn't block other requests.
@router.post("/transcribe", response_model=TranscriptionResponse)
def transcribe(
    audio: UploadFile,
    transcriber: Transcriber = Depends(get_transcriber),
    _user_id: UUID = Depends(limit_ai_requests),
) -> TranscriptionResponse:
    result = transcribe_upload(audio, transcriber)
    return TranscriptionResponse(
        text=result.text,
        language=result.language,
        audio_seconds=result.audio_seconds,
        latency_ms=result.latency_ms,
    )
