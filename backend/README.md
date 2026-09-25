# Nomi backend

FastAPI service that turns voice notes into relationship memory.

## Setup

Python 3.12+. From `backend/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env
```

`.env` holds machine-specific settings and secrets and is ignored by Git.
Every setting is listed in `.env.example`.

### Models

- **Speech-to-text:** [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
  downloads `small.en` (~480 MB) from Hugging Face the first time `/transcribe`
  runs, then reuses it. Set `WHISPER_MODEL=tiny.en` for quicker experiments.
- **LLM:** install [Ollama](https://ollama.com), then `ollama pull qwen3:4b`.
  Ollama serves it at `http://127.0.0.1:11434`.

### Database

Set `DATABASE_URL` to a PostgreSQL connection string, then create the tables:

```bash
python -m scripts.migrate               # Supabase (hosted or `supabase start`)
python -m scripts.migrate --local-shim  # plain PostgreSQL
```

With a hosted Supabase project, copy the connection string from
Project Settings → Database. You can also apply `supabase/migrations/*.sql`
with the Supabase CLI (`supabase db push`). `--local-shim` creates tiny
stand-ins for Supabase's `auth` schema so the Row Level Security policies
also work on plain Postgres. Never use it against Supabase.

## Run

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

For a physical phone, use `--host 0.0.0.0` and point the app at your
computer's LAN IP (see `mobile/README.md`).

## API

JSON uses camelCase. Errors look like `{"detail": "message"}`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/transcribe` | Multipart `audio` file → `{text, language, audioSeconds, latencyMs}` |
| POST | `/extract` | `{transcript}` → `{people: ExtractedPerson[]}` |
| POST | `/duplicate-check` | `{people: [{name, company, school}]}` → possible existing matches per person |
| POST | `/captures` | Save one reviewed note (people, moments, follow-ups) atomically |
| GET | `/contacts` | People, most recently seen first |
| GET / PATCH / DELETE | `/contacts/{id}` | Profile with timeline and follow-ups; edit; forget |
| DELETE | `/interactions/{id}` | Forget one moment |
| GET / POST | `/follow-ups` | List (`?status=open`) or add |
| PATCH | `/follow-ups/{id}` | Edit, complete (`status: done`), or dismiss |
| POST | `/search` | `{query}` → people, each with the reasons it matched |
| GET | `/me/export` | Everything you've saved, as JSON |
| DELETE | `/me/data` | Permanently delete everything you've saved |

## How it's organized

```
app/
├── main.py            # creates the app, CORS, registers routers
├── core/              # config (env vars), db connection, current user
├── routes/            # HTTP layer: parse request, call services, map errors
├── services/          # logic: transcription, llm, extraction, identity, captures
├── repositories/      # SQL, always scoped by user_id
└── schemas/           # Pydantic models = the API contract
```

**Transcription** (`services/transcription.py`). The upload is streamed to a
temp file with a size cap, decoded to 16 kHz mono with PyAV (corrupt audio → 422),
transcribed by a Whisper model loaded once per process, and deleted before the
response is sent. Timings are logged; transcripts are not.

**Extraction** (`services/extraction.py`, `services/llm.py`). The transcript goes
to Qwen3 with a JSON Schema (Ollama *structured outputs* constrain generation to
it), thinking disabled, temperature 0. The prompt forbids guessing and routes
hedged facts ("I think she's at Google") into notes starting with `Unsure:`
rather than structured fields. The reply is validated with Pydantic (one retry),
cleaned (whitespace, placeholders, duplicates), and returned for review. The LLM
sits behind an `LLMClient` interface so the model or provider can change.

**Due dates** (`services/dates.py`). After extraction, the follow-up's wording
("next week", "by Friday", "in two weeks") is turned into a date with a small
deterministic parser, relative to the phone's local date sent as `today`.
Language models are unreliable at calendar arithmetic, so the model only
supplies the words; unknown phrasing gives no date rather than a wrong one.

**Identity** (`services/identity.py`). Suggests "is this the Jason you met
before?" from normalized names, with company or school as supporting evidence.
Strong matches must be answered in the app; nothing merges automatically.

**Captures** (`services/captures.py`). Saves every confirmed person in one
transaction: create or update the contact, add a new interaction (history is
never overwritten), and add a follow-up if there is one.

**Search** (`services/search.py`, `repositories/search.py`). A question like
"Who did I meet at Cal Hacks last month?" is turned by the LLM into a
`SearchFilters` object (company, role, school, event, date range, open
follow-ups, keywords), validated by Pydantic. The repository turns those
filters into fixed, parameterized SQL; the model never writes SQL. Keywords use
PostgreSQL full-text search (so "designer" finds "designers") plus substring
matching for names. One- or two-word queries skip the LLM, and if the model is
down or returns invalid filters, search falls back to plain keywords. Each
result carries short reasons drawn from stored evidence ("Looking for designers").

**Users and security.** Every repository query filters by `user_id`, so ids from
other users return 404. Row Level Security in the migration protects the tables
if they're reached through Supabase's public API. Until Supabase Auth is wired
in, `core/auth.py` returns a fixed development user, so do not expose this
server publicly yet.

## Tests

```bash
pytest                                   # fast tests; database tests are skipped
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/nomi_test pytest
```

Database tests drop and recreate the schema in `TEST_DATABASE_URL`, so point it
at a throwaway database. Model calls are replaced with fakes; audio decoding is
real.

### Evaluating the model

`tests/extraction_cases.json` (at the repo root) covers single and multiple
people, uncertainty, corrections, slang, rambling, missing names, follow-ups,
events, repeat contacts and noisy transcripts. Against a running Ollama:

```bash
python -m scripts.eval_extraction          # all cases
python -m scripts.eval_extraction slang    # one case
```

Run this whenever you change the prompt, schema, or model (e.g. `qwen3:8b`).
