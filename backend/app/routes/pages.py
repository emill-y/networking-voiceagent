"""Public web pages: support (/) and privacy policy (/privacy).

App Store Connect needs a support URL and a privacy policy URL. Serving
them from the API means they're live wherever the API is deployed, with
no separate website to host.
"""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()
PAGES = Path(__file__).resolve().parent.parent / "pages"


@router.get("/", include_in_schema=False)
def support_page() -> FileResponse:
    return FileResponse(PAGES / "index.html", media_type="text/html")


@router.get("/privacy", include_in_schema=False)
def privacy_page() -> FileResponse:
    return FileResponse(PAGES / "privacy.html", media_type="text/html")


@router.get("/style.css", include_in_schema=False)
def page_styles() -> FileResponse:
    return FileResponse(PAGES / "style.css", media_type="text/css")
