# Backend

Minimal FastAPI backend for Milestone 2. Its only endpoint is `GET /health`.

## Setup and run

Use Python 3.12 or newer. From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The virtual environment keeps this backend's Python packages separate from
other projects. `.venv/` is ignored by Git. Stop the server with `Ctrl+C`.

`app.main:app` tells Uvicorn to import the `app` object from `app/main.py`.
`--reload` restarts the development server when Python files change.
`127.0.0.1` is this computer's local address, and `8000` is the server's port.

## Verify

With the server running, use another terminal:

```bash
curl -i http://127.0.0.1:8000/health
```

Expect HTTP `200 OK`, `content-type: application/json`, and this body:

```json
{"status":"ok"}
```

## How it works

[FastAPI](https://fastapi.tiangolo.com/tutorial/first-steps/) is a Python framework
for building HTTP APIs. Uvicorn accepts HTTP connections and runs the FastAPI app.

- `GET` is the HTTP method used to retrieve information.
- `/health` is the URL path identifying this endpoint.
- `@app.get("/health")` connects that method and path to the `health()` function.
- The function returns a Python dictionary; FastAPI sends it as JSON.

This response confirms that the backend is reachable and handling requests.
It does not check a database or an AI service.

`app/main.py` contains the app and route. `app/__init__.py` marks `app` as a Python
package. `requirements.txt` pins the tested versions of the two direct dependencies.

Automatic API documentation routes are disabled with `openapi_url=None` so only
the requested endpoint is exposed. This milestone includes no mobile integration,
audio processing, Whisper, Qwen, or database.
