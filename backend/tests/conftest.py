import io
import math
import struct
import wave

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_wav(seconds: float = 1.0, rate: int = 16_000) -> bytes:
    """A short sine tone: real, decodable audio without fixture files."""
    frames = b"".join(
        struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / rate)))
        for i in range(int(seconds * rate))
    )
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(frames)
    return buffer.getvalue()


# ---------- Database tests ----------
# These need a disposable PostgreSQL database. Set TEST_DATABASE_URL, e.g.
#   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/nomi_test
# The schema in that database is dropped and recreated. Without the
# variable, database tests are skipped.

import os  # noqa: E402
import uuid  # noqa: E402

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app.core.auth import get_current_user_id  # noqa: E402
from app.core.db import get_db  # noqa: E402

USER_ID = uuid.UUID("00000000-0000-0000-0000-00000000000a")
OTHER_USER_ID = uuid.UUID("00000000-0000-0000-0000-00000000000b")


@pytest.fixture(scope="session")
def database_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set")
    from scripts.migrate import apply_migrations

    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(
            "drop table if exists follow_ups, interactions, contacts, nomi_migrations cascade;"
            "drop function if exists set_updated_at cascade;"
        )
    apply_migrations(url, local_shim=True)
    return url


@pytest.fixture
def db_client(database_url):
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("truncate contacts, interactions, follow_ups cascade")

    def test_db():
        with psycopg.connect(database_url, row_factory=dict_row) as conn:
            yield conn

    state = {"user": USER_ID}
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[get_current_user_id] = lambda: state["user"]
    with TestClient(app) as test_client:
        test_client.act_as = lambda user: state.update(user=user)
        yield test_client
    app.dependency_overrides.clear()
