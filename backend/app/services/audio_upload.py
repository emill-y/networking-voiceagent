"""Receiving an audio upload safely: type check, size limit, temp file."""

import os
import tempfile
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

ALLOWED_EXTENSIONS = {".m4a", ".mp4", ".aac", ".caf", ".wav", ".webm", ".ogg", ".mp3", ".3gp"}
CHUNK_BYTES = 64 * 1024


def looks_like_audio(upload: UploadFile) -> bool:
    content_type = (upload.content_type or "").lower()
    extension = Path(upload.filename or "").suffix.lower()
    if content_type.startswith("audio/"):
        return True
    # Some clients label recordings generically; fall back to the extension.
    return content_type in {"", "application/octet-stream", "video/mp4", "video/webm"} and (
        extension in ALLOWED_EXTENSIONS
    )


def save_to_temp(upload: UploadFile, max_bytes: int) -> str:
    """Write the upload to a temp file and return its path. The caller deletes it."""
    if not looks_like_audio(upload):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Please upload an audio file.")
    # Only the extension from the client's filename is used, never the name
    # itself, so a crafted filename can't influence the path we write to.
    suffix = Path(upload.filename or "").suffix.lower()
    suffix = suffix if suffix in ALLOWED_EXTENSIONS else ".audio"
    fd, temp_path = tempfile.mkstemp(prefix="nomi-", suffix=suffix)
    try:
        written = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := upload.file.read(CHUNK_BYTES):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status.HTTP_413_CONTENT_TOO_LARGE,
                        f"Recording is larger than {max_bytes // (1024 * 1024)} MB.",
                    )
                out.write(chunk)
        if written == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The recording is empty.")
    except BaseException:
        remove(temp_path)
        raise
    return temp_path


def remove(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
