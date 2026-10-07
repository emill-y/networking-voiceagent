from fastapi.testclient import TestClient
from psycopg import errors as pg_errors

from app.main import app


@app.get("/_test/missing-table")
def _missing_table():
    raise pg_errors.UndefinedTable('relation "ambient_sessions" does not exist')


def test_missing_table_is_explained_not_a_bare_500():
    response = TestClient(app).get("/_test/missing-table")
    assert response.status_code == 503
    assert "database update" in response.json()["detail"]
