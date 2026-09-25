from app.schemas.base import ApiModel


class TranscriptionResponse(ApiModel):
    text: str
    language: str | None
    audio_seconds: float
    latency_ms: int
