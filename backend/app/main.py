from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Disable generated documentation routes so /health is the only endpoint.
app = FastAPI(openapi_url=None)

# Allow the Expo web preview to read the health response in a browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081", "http://127.0.0.1:8081"],
    allow_methods=["GET"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
