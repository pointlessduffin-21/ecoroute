import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.lstm_predictor import predictor
from app.services import data_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["predictions"])


class PredictionResponse(BaseModel):
    device_id: str
    predicted_fill_percent: float
    time_to_threshold_minutes: float
    confidence_score: float
    prediction_method: str
    model_version: str
    predicted_at: str


class AllPredictionsResponse(BaseModel):
    predictions: list[PredictionResponse]
    total: int
    errors: int


class TrainingRequest(BaseModel):
    limit: Optional[int] = 10000


class TrainingResponse(BaseModel):
    status: str
    loss: Optional[float] = None
    best_loss: Optional[float] = None
    epochs: int
    num_samples: int
    num_sequences: Optional[int] = None
    model_version: str
    reason: Optional[str] = None


class StoredPrediction(BaseModel):
    id: Optional[int] = None
    device_id: str
    predicted_fill_percent: float
    time_to_threshold_minutes: float
    confidence_score: float
    model_version: str
    predicted_at: Optional[str] = None


@router.post("/predict/all", response_model=AllPredictionsResponse)
async def predict_all_bins():
    """
    Generate fill level predictions for all active bins.

    Iterates over every active bin, fetches its recent telemetry, and runs
    the prediction model. Saves each prediction to the database.
    """
    bins = data_service.get_all_bins()

    if not bins:
        return AllPredictionsResponse(predictions=[], total=0, errors=0)

    predictions = []
    errors = 0

    for bin_record in bins:
        device_id = bin_record.get("device_id")
        if not device_id:
            errors += 1
            continue

        try:
            readings = data_service.get_telemetry_for_device(device_id, limit=100)

            if not readings:
                logger.warning("No telemetry data for device %s, skipping.", device_id)
                errors += 1
                continue

            result = predictor.predict_fill_level(device_id, readings)

            # Save prediction to database
            data_service.save_prediction(
                device_id=device_id,
                predicted_fill=result["predicted_fill_percent"],
                time_to_threshold=result["time_to_threshold_minutes"],
                confidence=result["confidence_score"],
                model_version=result["model_version"],
            )

            predictions.append(PredictionResponse(**result))

        except Exception as e:
            logger.error("Prediction failed for device %s: %s", device_id, str(e))
            errors += 1

    return AllPredictionsResponse(
        predictions=predictions, total=len(predictions), errors=errors
    )


@router.post("/predict/{device_id}", response_model=PredictionResponse)
async def predict_single_bin(device_id: str):
    """
    Generate a fill level prediction for a single bin.

    Fetches recent telemetry for the specified device, runs the prediction
    model, saves the result, and returns it.
    """
    readings = data_service.get_telemetry_for_device(device_id, limit=100)

    if not readings:
        raise HTTPException(
            status_code=404,
            detail=f"No telemetry data found for device {device_id}",
        )

    try:
        result = predictor.predict_fill_level(device_id, readings)

        # Save prediction to database
        data_service.save_prediction(
            device_id=device_id,
            predicted_fill=result["predicted_fill_percent"],
            time_to_threshold=result["time_to_threshold_minutes"],
            confidence=result["confidence_score"],
            model_version=result["model_version"],
        )

        return PredictionResponse(**result)

    except Exception as e:
        logger.error("Prediction failed for device %s: %s", device_id, str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}",
        )


@router.post("/train", response_model=TrainingResponse)
async def train_model(request: TrainingRequest = TrainingRequest()):
    """
    Trigger LSTM model training on historical telemetry data.

    Fetches all available telemetry from the database and trains the model.
    Returns training metrics including loss and number of epochs.
    """
    try:
        telemetry = data_service.get_all_telemetry(limit=request.limit)

        if not telemetry:
            return TrainingResponse(
                status="skipped",
                reason="No telemetry data available in database",
                epochs=0,
                num_samples=0,
                model_version=predictor.model_version,
            )

        metrics = predictor.train_model(telemetry)
        return TrainingResponse(**metrics)

    except Exception as e:
        logger.error("Training failed: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Training failed: {str(e)}",
        )


@router.get("/predictions/{device_id}", response_model=list[StoredPrediction])
async def get_predictions(device_id: str, limit: int = 10):
    """
    Retrieve the most recent stored predictions for a device.

    Args:
        device_id: The smart bin device identifier.
        limit: Maximum number of predictions to return (default 10).
    """
    predictions = data_service.get_latest_predictions(device_id, limit=limit)

    if not predictions:
        raise HTTPException(
            status_code=404,
            detail=f"No predictions found for device {device_id}",
        )

    results = []
    for p in predictions:
        results.append(
            StoredPrediction(
                id=p.get("id"),
                device_id=p.get("device_id", device_id),
                predicted_fill_percent=float(p.get("predicted_fill_percent", 0)),
                time_to_threshold_minutes=float(p.get("time_to_threshold_minutes", 0)),
                confidence_score=float(p.get("confidence_score", 0)),
                model_version=p.get("model_version", "unknown"),
                predicted_at=str(p.get("predicted_at", "")),
            )
        )

    return results
