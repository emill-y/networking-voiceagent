"""Serve the web version of Nomi at /app, from the same server as the API.

The web app is the Expo app exported for browsers (`scripts/build_web.sh`
writes it to backend/web/). Serving it here means one deploy, one address,
and no cross-origin (CORS) setup for the browser.

Any /app path that isn't a real file gets index.html, so deep links like
/app/people/<id> load the app, which then shows the right screen.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse

router = APIRouter()
WEB_DIR = Path(__file__).resolve().parents[2] / "web"


def _index() -> FileResponse:
    index = WEB_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "The web app hasn't been built (run scripts/build_web.sh)."
        )
    # Always revalidate the shell so a new deploy shows up immediately.
    return FileResponse(index, media_type="text/html", headers={"Cache-Control": "no-cache"})


@router.get("/app", include_in_schema=False)
def app_root() -> RedirectResponse:
    return RedirectResponse("/app/")


@router.get("/app/{path:path}", include_in_schema=False)
def web_app(path: str) -> FileResponse:
    if path:
        candidate = (WEB_DIR / path).resolve()
        # Never serve anything outside the web folder (e.g. /app/../../.env).
        if candidate.is_relative_to(WEB_DIR.resolve()) and candidate.is_file():
            # Bundles have content hashes in their names, so they can be cached for long.
            cache = "public, max-age=31536000, immutable" if "/_expo/static/" in f"/{path}" else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
    return _index()
