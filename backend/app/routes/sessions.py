"""Ambient sessions: record a networking event and find everyone you met.

    POST   /sessions                 start (returns an upload token for a paired watch)
    GET    /sessions/active          the session still recording, if any
    GET    /sessions/{id}            progress: chunks, people found so far
    POST   /sessions/{id}/chunks     upload ~30 s of audio (sign-in or X-Session-Token)
    POST   /sessions/{id}/finish     stop; final list of people to review
    DELETE /sessions/{id}            discard (also after saving: the transcript goes)

Audio is transcribed and deleted within the request. Nothing is added to
contacts here; the user reviews the people and saves them with /captures.
"""

import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Response, UploadFile, status
from psycopg import Connection

from app.core.auth import get_current_user_id, get_optional_user_id
from app.core.db import get_db
from app.core.rate_limit import ai_limiter
from app.repositories import sessions as repo
from app.routes.transcribe import transcribe_upload
from app.schemas.sessions import SessionCreate, SessionCreated, SessionFinished, SessionOut
from app.services import sessions as svc
from app.services.llm import LLMClient, get_llm_client
from app.services.transcription import Transcriber, get_transcriber

logger = logging.getLogger(__name__)
router = APIRouter()


def _out(row: dict, model=SessionOut, **extra):
    segments = row["segments"] or []
    return model(
        id=row["id"],
        title=row["title"],
        status=row["status"],
        chunks=len(segments),
        audio_seconds=row["audio_seconds"],
        words=len(svc.full_transcript(segments).split()),
        people=svc.merge_people(row["windows"] or {}, row["title"]),
        started_at=row["created_at"],
        ended_at=row["ended_at"],
        **extra,
    )


def _own(conn: Connection, user_id: UUID, session_id: UUID, lock: bool = False) -> dict:
    row = repo.get(conn, session_id, lock)
    if not row or row["user_id"] != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    return row


@router.post("/sessions", response_model=SessionCreated, status_code=status.HTTP_201_CREATED)
def start(body: SessionCreate, conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    if repo.active(conn, user_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A session is already recording. Finish it first.")
    token, token_hash = svc.new_upload_token()
    row = repo.create(conn, user_id, body.title or None, token_hash)
    return _out(row, SessionCreated, upload_token=token)


@router.get("/sessions/active", response_model=SessionOut | None)
def active(conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    row = repo.active(conn, user_id)
    return _out(row) if row else None


@router.get("/sessions/{session_id}", response_model=SessionOut)
def progress(
    session_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID | None = Depends(get_optional_user_id),
    x_session_token: str | None = Header(default=None),
):
    return _out(_authorized(conn, session_id, user_id, x_session_token))


def _authorized(conn: Connection, session_id: UUID, user_id: UUID | None, token: str | None, lock: bool = False) -> dict:
    row = repo.get(conn, session_id, lock)
    if row and user_id and row["user_id"] == user_id:
        return row
    if row and token and svc.token_matches(token, row["upload_token_hash"]) and row["status"] == "recording":
        return row
    if not user_id and not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")


@router.post("/sessions/{session_id}/chunks", response_model=SessionOut)
def upload_chunk(
    session_id: UUID,
    audio: UploadFile,
    seq: int = Form(ge=0, lt=svc.MAX_CHUNKS),
    today: date | None = Form(default=None),
    conn: Connection = Depends(get_db),
    user_id: UUID | None = Depends(get_optional_user_id),
    x_session_token: str | None = Header(default=None),
    transcriber: Transcriber = Depends(get_transcriber),
    llm: LLMClient = Depends(get_llm_client),
):
    row = _authorized(conn, session_id, user_id, x_session_token)
    if row["status"] != "recording":
        raise HTTPException(status.HTTP_409_CONFLICT, "This session has ended.")
    ai_limiter.check(row["user_id"])
    # Transcribe before locking the row: other chunks can upload meanwhile.
    result = transcribe_upload(audio, transcriber)
    row = repo.get(conn, session_id, lock=True)
    segments = svc.add_segment(row["segments"] or [], seq, result.text, result.audio_seconds)
    seconds = sum(s["seconds"] for s in segments)
    windows = dict(row["windows"] or {})
    found = svc.read_window(segments, svc.window_of(seq), llm, today or date.today(), row["title"])
    if found is not None:
        windows[str(svc.window_of(seq))] = found
    repo.save_progress(conn, session_id, segments, seconds, windows)
    return _out({**row, "segments": segments, "audio_seconds": seconds, "windows": windows})


@router.post("/sessions/{session_id}/finish", response_model=SessionFinished)
def finish(
    session_id: UUID,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
    llm: LLMClient = Depends(get_llm_client),
):
    row = _own(conn, user_id, session_id, lock=True)
    segments = row["segments"] or []
    windows = dict(row["windows"] or {})
    # Read any window the model missed (or that never got a chunk since it failed).
    for window in sorted({svc.window_of(s["seq"]) for s in segments}):
        if str(window) not in windows or window == max(svc.window_of(s["seq"]) for s in segments):
            found = svc.read_window(segments, window, llm, date.today(), row["title"])
            if found is not None:
                windows[str(window)] = found
    repo.finish(conn, session_id, windows)
    row = repo.get(conn, session_id)
    return _out(row, SessionFinished, transcript=svc.full_transcript(segments))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard(session_id: UUID, conn: Connection = Depends(get_db), user_id: UUID = Depends(get_current_user_id)):
    if not repo.delete(conn, user_id, session_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
