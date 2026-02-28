import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.lstm_predictor import predictor
from app.services.data_service import check_db_connection

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    model_loaded: bool
    model_version: str
    database_connected: bool


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Service health check endpoint.

    Returns the overall service status, whether the LSTM model is loaded
    and trained, and whether the database connection is active.
    """
    db_connected = check_db_connection()
    model_loaded = predictor.is_trained and predictor.model is not None

    # Overall status: healthy only if core components are working
    if db_connected:
        status = "healthy"
    else:
        status = "degraded"

    return HealthResponse(
        status=status,
        service="EcoRoute AI Service",
        model_loaded=model_loaded,
        model_version=predictor.model_version,
        database_connected=db_connected,
    )
