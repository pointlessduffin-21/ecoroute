import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.lstm_predictor import predictor
from app.routers import health, predictions, routes

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="EcoRoute AI Service",
    description=(
        "AI/ML service for smart waste bin fill-level forecasting "
        "and optimized collection route planning."
    ),
    version="1.0.0",
)

# CORS middleware: allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(predictions.router)
app.include_router(routes.router)


@app.on_event("startup")
async def startup_event():
    """
    Initialize the AI service on startup.

    Attempts to load a previously trained LSTM model from disk. If no saved
    model exists, a fresh (untrained) model is initialized. The service will
    still function using linear extrapolation fallback until the model is
    trained via the /train endpoint.
    """
    logger.info("Starting EcoRoute AI Service...")

    # Attempt to load saved model
    loaded = predictor.load_model(settings.MODEL_PATH)
    if loaded:
        logger.info(
            "LSTM model loaded successfully (version: %s)", predictor.model_version
        )
    else:
        logger.info(
            "No pre-trained model found. Service will use linear extrapolation "
            "fallback until model is trained via POST /train."
        )

    logger.info("EcoRoute AI Service ready.")


@app.on_event("shutdown")
async def shutdown_event():
    """Save the model on graceful shutdown if trained."""
    if predictor.is_trained:
        predictor.save_model(settings.MODEL_PATH)
        logger.info("Model saved on shutdown.")
    logger.info("EcoRoute AI Service shutting down.")
