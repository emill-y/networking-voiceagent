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

## Connect from a phone

Stop the local-only server first. From `backend/` with the virtual environment
activated, run:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`0.0.0.0` makes the server listen on all IPv4 interfaces, including Wi-Fi.
Set `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to your Mac's LAN IP and port
8000, for example `http://192.168.1.20:8000`, then reload Expo Go. Both devices
should be on the same local network. If the phone cannot connect, check macOS
firewall access for Python and whether the Wi-Fi network isolates devices.

For the Expo web preview, CORS allows GET requests from `http://localhost:8081`
and `http://127.0.0.1:8081`. If you change the web preview's port, update the
explicit origins in `app/main.py` too. Native apps do not need CORS.

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
the health endpoint is exposed. The Expo home screen uses it to display the
connection status. No audio processing, Whisper, Qwen, or database is included.
