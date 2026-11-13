"""Your voice: saved once, so sessions know which voice is yours.

    GET    /me/voice   whether you've saved your voice
    POST   /me/voice   save it from a short recording of you reading aloud (multipart `audio`)
    DELETE /me/voice   forget it

The recording is deleted within the request; only the voiceprint is kept.
"""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.config import get_settings
from app.core.db import get_db
from app.repositories import voiceprints
from app.schemas.base import ApiModel
from app.services import audio_upload
from app.services.diarization import Diarizer, VoiceEnrollError, enroll_voice, get_diarizer
from app.services.transcription import AudioDecodeError

logger = logging.getLogger(__name__)
router = APIRouter()


class MyVoice(ApiModel):
    saved: bool
    # Seconds of your speech it was made from.
    seconds: float | None = None
    updated_at: datetime | None = None


def _out(row) -> MyVoice:
    if not row:
        return MyVoice(saved=False)
    return MyVoice(saved=True, seconds=row["seconds"], updated_at=row["updated_at"])


@router.get("/me/voice", response_model=MyVoice)
def get_voice(conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    return _out(voiceprints.get(conn, user_id))


@router.post("/me/voice", response_model=MyVoice)
def save_voice(
    audio: UploadFile,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    diarizer: Diarizer | None = Depends(get_diarizer),
):
    if diarizer is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Voice recognition isn’t set up on this server yet.")
    temp_path = audio_upload.save_to_temp(audio, get_settings().max_upload_bytes)
    try:
        heard = diarizer.chunk_voices(temp_path)
    except AudioDecodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    finally:
        audio_upload.remove(temp_path)  # the recording never outlives the request
    try:
        print_, seconds = enroll_voice(heard)
    except VoiceEnrollError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    logger.info("Saved a voiceprint from %.1fs of speech", seconds)
    return _out(voiceprints.save(conn, user_id, print_, seconds))


@router.delete("/me/voice", status_code=status.HTTP_204_NO_CONTENT)
def delete_voice(conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    voiceprints.delete(conn, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
