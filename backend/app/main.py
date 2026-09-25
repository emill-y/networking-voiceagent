import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routes import extract, health, transcribe

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
