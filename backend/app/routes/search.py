from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.core.rate_limit import limit_ai_requests
from app.core.db import get_db
from app.schemas.search import SearchRequest, SearchResponse
from app.services.llm import LLMClient, get_llm_client
from app.services.search import answer

router = APIRouter()


@router.post("/search", response_model=SearchResponse)
def search(
    body: SearchRequest,
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(limit_ai_requests),
    llm: LLMClient = Depends(get_llm_client),
) -> SearchResponse:
    return answer(conn, user_id, body.query, llm, body.today or date.today())
