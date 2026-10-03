import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routes import account, calendar, demo, me, plans, sharing, network, pages, web_app, captures, contacts, extract, follow_ups, health, search, transcribe

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

settings = get_settings()

# Generated docs stay disabled; the API surface is documented in backend/README.md.
app = FastAPI(title="Nomi", openapi_url=None)

# Browsers (the Expo web preview) need CORS; native apps do not.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
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
app.include_router(pages.router)
app.include_router(web_app.router)
