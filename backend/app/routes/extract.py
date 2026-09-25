from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user_id
from app.schemas.extraction import ContactExtractionResult, ExtractionRequest
from app.services.extraction import ExtractionFailed, extract_people
from app.services.llm import LLMClient, LLMUnavailable, get_llm_client

router = APIRouter()


@router.post("/extract", response_model=ContactExtractionResult)
def extract(
    body: ExtractionRequest,
    llm: LLMClient = Depends(get_llm_client),
    _user_id: UUID = Depends(get_current_user_id),
) -> ContactExtractionResult:
    try:
        return extract_people(body.transcript, llm, body.today)
    except LLMUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ExtractionFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
