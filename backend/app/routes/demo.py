"""The website's live demo: turn a spoken or typed sentence into a person.

Public (no account), so it's kept small and cheap: short text only, a tight
per-visitor rate limit, and nothing is stored. The demo page shows the
result in a sample network that lives only in the visitor's browser.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import StringConstraints

from app.core.rate_limit import RateLimiter
from app.schemas.base import ApiModel
from app.schemas.extraction import ContactExtractionResult
from app.services.extraction import ExtractionFailed, extract_people
from app.services.llm import LLMClient, LLMUnavailable, get_llm_client

router = APIRouter()

per_minute = RateLimiter(max_requests=6, per_seconds=60)
per_day = RateLimiter(max_requests=40, per_seconds=24 * 3600)


class DemoRequest(ApiModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=800)]
    today: date | None = None


def visitor(request: Request) -> str:
    # Behind Vercel or Cloud Run, the first X-Forwarded-For entry is the visitor.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.post("/demo/extract", response_model=ContactExtractionResult)
def demo_extract(
    body: DemoRequest, request: Request, llm: LLMClient = Depends(get_llm_client)
) -> ContactExtractionResult:
    who = visitor(request)
    per_minute.check(who)  # type: ignore[arg-type]
    per_day.check(who)  # type: ignore[arg-type]
    try:
        return extract_people(body.text, llm, body.today or date.today(), None)
    except (LLMUnavailable, ExtractionFailed) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The demo is busy. Try again in a moment.") from exc
