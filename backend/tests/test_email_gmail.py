import dataclasses
import smtplib

from app.core.config import get_settings
from app.services import email as mail


class FakeSMTP:
    sent = []
    fail_login = False

    def __init__(self, host, port, timeout=None):
        assert (host, port) == ("smtp.gmail.com", 465)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def login(self, user, password):
        if FakeSMTP.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")
        self.user, self.password = user, password

    def send_message(self, message):
        FakeSMTP.sent.append((self.user, self.password, message))


def gmail_settings(**extra):
    values = {"resend_api_key": None, "gmail_address": "nomi.officialteam@gmail.com", "gmail_app_password": "abcdabcdabcdabcd"}
    return dataclasses.replace(get_settings(), **(values | extra))


def test_sends_through_gmail_without_a_domain(monkeypatch):
    FakeSMTP.sent, FakeSMTP.fail_login = [], False
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", FakeSMTP)
    settings = gmail_settings()
    assert mail.can_send(settings)
    assert mail.send(settings, "maya@berkeley.edu", "You're on the Nomi waitlist", "Hi Maya", html_body="<b>Hi</b>")
    user, password, message = FakeSMTP.sent[0]
    assert (user, password) == ("nomi.officialteam@gmail.com", "abcdabcdabcdabcd")
    assert message["To"] == "maya@berkeley.edu"
    assert message["From"] == "Nomi <nomi.officialteam@gmail.com>"
    assert "<b>Hi</b>" in message.get_body(("html",)).get_content()
    assert "Hi Maya" in message.get_body(("plain",)).get_content()


def test_a_rejected_login_is_not_reported_as_sent(monkeypatch):
    FakeSMTP.sent, FakeSMTP.fail_login = [], True
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", FakeSMTP)
    assert mail.send(gmail_settings(), "maya@berkeley.edu", "Hi", "Hi") is False


def test_nothing_configured_sends_nothing():
    settings = dataclasses.replace(get_settings(), resend_api_key=None, gmail_address=None, gmail_app_password=None)
    assert not mail.can_send(settings)
    assert mail.send(settings, "maya@berkeley.edu", "Hi", "Hi") is False


def test_resend_wins_when_both_are_set(monkeypatch):
    calls = []

    class FakeHttp:
        def post(self, url, headers, json):
            calls.append(url)
            return type("R", (), {"status_code": 200, "text": ""})()

    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", lambda *a, **k: (_ for _ in ()).throw(AssertionError("used Gmail")))
    assert mail.send(gmail_settings(resend_api_key="re_x"), "a@x.edu", "Hi", "Hi", http=FakeHttp())
    assert calls == [mail.RESEND_URL]
