import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes import web_app


@pytest.fixture
def web_dir(tmp_path, monkeypatch):
    (tmp_path / "_expo" / "static" / "js").mkdir(parents=True)
    (tmp_path / "index.html").write_text("<html>Nomi web</html>")
    (tmp_path / "_expo" / "static" / "js" / "entry-abc.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    monkeypatch.setattr(web_app, "WEB_DIR", tmp_path)
    return tmp_path


def test_serves_files_and_falls_back_to_index(web_dir):
    client = TestClient(app)
    assert client.get("/app", follow_redirects=False).headers["location"] == "/app/"
    assert "Nomi web" in client.get("/app/").text
    assert "Nomi web" in client.get("/app/people/123").text  # deep link -> the app
    bundle = client.get("/app/_expo/static/js/entry-abc.js")
    assert bundle.text == "console.log(1)"
    assert "immutable" in bundle.headers["cache-control"]


def test_cannot_escape_the_web_folder(web_dir):
    response = TestClient(app).get("/app/..%2Fsecret.txt")
    assert "nope" not in response.text


def test_missing_build_is_a_clear_404(tmp_path, monkeypatch):
    monkeypatch.setattr(web_app, "WEB_DIR", tmp_path / "missing")
    response = TestClient(app).get("/app/")
    assert response.status_code == 404
    assert "build_web" in response.json()["detail"]


def test_api_routes_still_win():
    assert TestClient(app).get("/health").json() == {"status": "ok"}
