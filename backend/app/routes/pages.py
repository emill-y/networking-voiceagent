"""Public web pages: the landing page (/) and privacy policy (/privacy).

App Store Connect needs a marketing/support URL and a privacy policy URL.
Serving them from the API means they're live wherever the API is deployed,
with no separate website to host.
"""

import os
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

router = APIRouter()
PAGES = Path(__file__).resolve().parent.parent / "pages"
_MAIL_LINK = re.compile(r'<a href="mailto:\{\{SUPPORT_EMAIL\}\}">\{\{SUPPORT_EMAIL\}\}</a>')


@lru_cache
def _render(name: str, email: str) -> str:
    html = (PAGES / name).read_text()
    if email:
        return html.replace("{{SUPPORT_EMAIL}}", email)
    # No address configured: point people at the in-app contact instead of a broken link.
    return _MAIL_LINK.sub("the contact on our App Store page", html)


def _page(name: str) -> HTMLResponse:
    return HTMLResponse(_render(name, os.environ.get("SUPPORT_EMAIL", "").strip()))


@router.get("/", include_in_schema=False)
def landing_page() -> HTMLResponse:
    return _page("index.html")


@router.get("/privacy", include_in_schema=False)
def privacy_page() -> HTMLResponse:
    return _page("privacy.html")


@router.get("/style.css", include_in_schema=False)
def page_styles() -> FileResponse:
    return FileResponse(PAGES / "style.css", media_type="text/css")
