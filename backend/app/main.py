from fastapi import FastAPI

# Disable generated documentation routes so /health is the only endpoint.
app = FastAPI(openapi_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
