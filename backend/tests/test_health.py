from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_support_and_privacy_pages_are_public():
    client = TestClient(app)
    for path, text in (
        ("/", "Support"), ("/product", "Nomi"), ("/students", "Nomi"), ("/demo", "Nomi"),
        ("/privacy", "Privacy"), ("/site/style.css", "--orange"),
    ):
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


def test_site_assets_stay_inside_the_site_folder():
    client = TestClient(app)
    assert client.get("/site/../../main.py").status_code == 404
    assert client.get("/site/nope.css").status_code == 404
