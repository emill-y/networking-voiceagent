from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_support_and_privacy_pages_are_public():
    client = TestClient(app)
    for path, text in (("/", "Support"), ("/privacy", "Privacy"), ("/style.css", "--bg")):
        response = client.get(path)
        assert response.status_code == 200
        assert text in response.text
