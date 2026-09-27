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


def test_pages_show_the_configured_support_email(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("SUPPORT_EMAIL", "help@nomi.test")
    assert 'mailto:help@nomi.test' in client.get("/").text
    assert 'mailto:help@nomi.test' in client.get("/privacy").text
    monkeypatch.delenv("SUPPORT_EMAIL")
    assert "{{SUPPORT_EMAIL}}" not in client.get("/").text
