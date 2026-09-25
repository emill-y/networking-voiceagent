from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.extraction import ContactExtractionResult, ExtractionRequest
from app.services.extraction import ExtractionFailed, extract_people
from app.services.llm import LLMClient, LLMUnavailable, get_llm_client

router = APIRouter()


@router.post("/extract", response_model=ContactExtractionResult)
def extract(
    body: ExtractionRequest,
    llm: LLMClient = Depends(get_llm_client),
) -> ContactExtractionResult:
    try:
        return extract_people(body.transcript, llm)
    except LLMUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ExtractionFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
