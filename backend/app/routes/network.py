from uuid import UUID

from fastapi import APIRouter, Depends
from psycopg import Connection

from app.core.auth import get_current_user_id
from app.core.db import get_db
from app.schemas.network import NetworkResponse
from app.services.network import get_network

router = APIRouter()


@router.get("/network", response_model=NetworkResponse)
def network(
    conn: Connection = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
) -> NetworkResponse:
    """People and the evidence-based links between them, for the map."""
    return get_network(conn, user_id)
