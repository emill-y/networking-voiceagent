# Nomi

A personal AI memory for the people you meet. Speak for 10–60 seconds after
meeting someone; Nomi transcribes it, pulls out who they are and what matters,
lets you confirm, and keeps a timeline of every conversation with them.

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the product vision, principles,
and roadmap.

## Layout

```
networking-voiceagent/
├── mobile/                 # Expo + React Native + TypeScript app
├── backend/                # FastAPI: transcription, extraction, memory API
├── supabase/migrations/    # PostgreSQL schema (Supabase)
├── tests/                  # AI evaluation dataset (extraction_cases.json)
└── PROJECT_CONTEXT.md
```

## How a memory is made

```
tap mic ─► record (expo-audio) ─► POST /transcribe ─► faster-whisper ─► transcript
                                                                          │
review & edit ◄─ POST /duplicate-check ◄─ people ◄─ Qwen3 via Ollama ◄─ POST /extract
      │
      └─► POST /captures ─► contacts + interactions + follow_ups (PostgreSQL)
```

Every stage is its own request, so each can be tested and can fail on its own
with a clear message. The LLM never writes to the database: its output is
validated, shown to you, and saved only after you confirm.

## Quick start

You need Python 3.12+, Node 22.13+, [Ollama](https://ollama.com), and a
PostgreSQL database (a [Supabase](https://supabase.com) project, the Supabase
CLI's local stack, or any local Postgres).

```bash
# 1. Models
ollama pull qwen3:4b        # Whisper small.en downloads on first transcription

# 2. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env         # then set DATABASE_URL (SUPABASE_URL is prefilled)
python -m scripts.migrate    # add --local-shim for plain (non-Supabase) Postgres
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 3. App (new terminal)
cd mobile
npm ci
cp .env.example .env.local   # then set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm start
```

Details: [backend/README.md](backend/README.md) · [mobile/README.md](mobile/README.md)

## Status

Phase 1 (voice capture MVP) is complete: record → transcribe → extract → review →
save → profile with timeline. Also in place: duplicate suggestions, editing and
deleting people and moments, and follow-ups you can complete or dismiss.

Phase 3 (search) is in place: conversational questions become validated
filters, with keyword fallback and "why it matched" reasons.

Also: follow-up due dates ("next week" → a date), a grounded pre-meeting
briefing on each profile, and data export / delete-everything.

Sign-in uses Supabase Auth (email/password or phone code); the API verifies every
request's token. People can be brought in from the phone's contacts: matching
happens on the device and only the people you pick are added.

Not yet: personalization, calendar and email integrations.
