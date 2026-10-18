"""Outgoing email (contact shares and invites) through Resend's HTTP API.

Optional: without RESEND_API_KEY nothing is sent and callers fall back to a
link the user shares themselves. We never report an email as sent unless
Resend accepted it.
"""

import html
import logging

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)
RESEND_URL = "https://api.resend.com/emails"


def can_send(settings: Settings) -> bool:
    return bool(settings.resend_api_key)


def send(settings: Settings, to: str, subject: str, text: str, button: tuple[str, str] | None = None,
         http: httpx.Client | None = None, html_body: str | None = None) -> bool:
    """True only if the email was accepted for delivery. html_body replaces the
    plain default design (the text version is still sent alongside it)."""
    if not settings.resend_api_key:
        return False
    body = "".join(f"<p style='margin:0 0 14px'>{html.escape(line)}</p>" for line in text.split("\n\n"))
    if button:
        label, url = button
        body += (
            f"<p style='margin:22px 0'><a href='{html.escape(url)}' style='background:#D9682A;color:#fff;"
            f"padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:600'>{html.escape(label)}</a></p>"
        )
    page = (
        "<div style='font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;"
        f"color:#18150F;max-width:520px'>{body}<p style='color:#8E877D;font-size:12px'>Nomi · nomiconnect@gmail.com</p></div>"
    )
    if html_body:
        page = html_body
    client = http or httpx.Client(timeout=10)
    try:
        response = client.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": page, "text": text},
        )
    except httpx.HTTPError as exc:
        logger.warning("Email to a share recipient failed: %s", exc)
        return False
    if response.status_code >= 400:
        logger.warning("Resend refused an email: %s %s", response.status_code, response.text[:200])
        return False
    return True


def get_mailer(settings: Settings):
    return lambda to, subject, text, button=None: send(settings, to, subject, text, button)
