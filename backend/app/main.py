import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import errors as pg_errors

from app.core.config import get_settings
from app.routes import account, calendar, demo, me, plans, sessions, sharing, waitlist, network, pages, web_app, captures, contacts, extract, follow_ups, health, search, transcribe, voice

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

settings = get_settings()

# Generated docs stay disabled; the API surface is documented in backend/README.md.
app = FastAPI(title="Nomi", openapi_url=None)

# Browsers (the Expo web preview) need CORS; native apps do not.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Session-Token"],
)


# A deploy that ran before its migration (a new table or column is missing)
# says so plainly instead of a bare 500.
@app.exception_handler(pg_errors.UndefinedTable)
@app.exception_handler(pg_errors.UndefinedColumn)
async def missing_migration(_: Request, exc: Exception) -> JSONResponse:
    logging.getLogger("nomi").error("Database is missing a migration: %s. Run `python -m scripts.migrate`.", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "This feature needs a database update that hasn't been applied yet. Run the migration, then try again."},
    )


app.include_router(health.router)
app.include_router(transcribe.router)
app.include_router(extract.router)
app.include_router(captures.router)
app.include_router(contacts.router)
app.include_router(follow_ups.router)
app.include_router(search.router)
app.include_router(network.router)
app.include_router(account.router)
app.include_router(demo.router)
app.include_router(calendar.router)
app.include_router(plans.router)
app.include_router(me.router)
app.include_router(sharing.router)
app.include_router(sessions.router)
app.include_router(voice.router)
app.include_router(waitlist.router)
app.include_router(pages.router)
app.include_router(web_app.router)
