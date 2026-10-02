import io
import math
import struct
import uuid
import wave

import pytest
from fastapi.testclient import TestClient

from app.main import app


TEST_USER = "00000000-0000-0000-0000-0000000000aa"


@pytest.fixture
def client():
    # Most endpoint tests aren't about sign-in; test_auth.py covers that.
    from app.core.auth import get_current_user_id

    app.dependency_overrides[get_current_user_id] = lambda: uuid.UUID(TEST_USER)
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
            "drop table if exists event_feeds, calendar_connections, follow_ups, interactions, contacts, nomi_migrations cascade;"
            "drop function if exists set_updated_at cascade;"
            "drop table if exists auth.users cascade;"
        )
    apply_migrations(url, local_shim=True)
    with psycopg.connect(url, autocommit=True) as conn:
        for user in (USER_ID, OTHER_USER_ID):
            conn.execute("insert into auth.users (id) values (%s) on conflict do nothing", (user,))
    return url


@pytest.fixture
def db_client(database_url):
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("truncate contacts, interactions, follow_ups, calendar_connections, event_feeds cascade")

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


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    """Each test starts with an empty rate-limit window."""
    from app.core.rate_limit import ai_limiter
    from app.routes import demo

    for limiter in (ai_limiter, demo.per_minute, demo.per_day):
        limiter._hits.clear()
    yield
