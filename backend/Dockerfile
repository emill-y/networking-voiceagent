# Production image for the Nomi API. Speech-to-text happens on the phone,
# and extraction on a hosted model, so this stays small (no Whisper, no GPU).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Don't run as root inside the container.
RUN useradd --create-home nomi
USER nomi

# Hosts (Cloud Run, Fly, Railway, Render) tell us which port via $PORT.
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
