"""The public website: /, /product, /waitlist, /students, /demo, /privacy and /site/* assets.

On Vercel these are static files (scripts/build-vercel.mjs); serving them
from the API too means the site also works locally and on Cloud Run.
"""

import os
import re
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
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
    return HTMLResponse(_render(name, (os.environ.get("SUPPORT_EMAIL") or "nomi.officialteam@gmail.com").strip()))


SITE = PAGES / "site"
NAMED_PAGES = ("product", "students", "waitlist", "demo", "privacy")


@router.get("/", include_in_schema=False)
def landing_page() -> HTMLResponse:
    return _page("index.html")


def _named(name: str):
    def page() -> HTMLResponse:
        return _page(f"{name}.html")

    return page


for _name in NAMED_PAGES:
    router.add_api_route(f"/{_name}", _named(_name), methods=["GET"], include_in_schema=False)


@router.get("/site/{path:path}", include_in_schema=False)
def site_asset(path: str) -> FileResponse:
    candidate = (SITE / path).resolve()
    # Never serve anything outside the site folder.
    if not candidate.is_relative_to(SITE.resolve()) or not candidate.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
