import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Import the FastAPI application
from app.main import app
from app.models.lstm_predictor import predictor

# Use TestClient for testing the endpoints
client = TestClient(app)

# Sample mock readings to be used across tests
MOCK_DEVICE_ID = "ECO-BIN-1002"
MOCK_READINGS = [
    {"recorded_at": "2026-03-10T10:00:00Z", "fill_level_percent": 10},
    {"recorded_at": "2026-03-10T11:00:00Z", "fill_level_percent": 25},
    {"recorded_at": "2026-03-10T12:00:00Z", "fill_level_percent": 45},
    {"recorded_at": "2026-03-10T13:00:00Z", "fill_level_percent": 60},
    {"recorded_at": "2026-03-10T14:00:00Z", "fill_level_percent": 75},
]

MOCK_ALL_TELEMETRY = [
    {"device_id": MOCK_DEVICE_ID, **MOCK_READINGS[0]},
    {"device_id": MOCK_DEVICE_ID, **MOCK_READINGS[1]},
    {"device_id": MOCK_DEVICE_ID, **MOCK_READINGS[2]},
    {"device_id": MOCK_DEVICE_ID, **MOCK_READINGS[3]},
    {"device_id": MOCK_DEVICE_ID, **MOCK_READINGS[4]},
]


def test_predictor_logic():
    """
    Test that the base LSTM predictor can successfully process raw timeseries 
    data and return a dictionary with the expected prediction schema bounds.
    """
    result = predictor.predict_fill_level(MOCK_DEVICE_ID, MOCK_READINGS)
    
    assert "predicted_fill_percent" in result
    assert "time_to_threshold_minutes" in result
    assert "confidence_score" in result
    
    assert 0 <= result["predicted_fill_percent"] <= 100
    assert result["time_to_threshold_minutes"] >= 0
    assert 0 <= result["confidence_score"] <= 1.0


@patch("app.routers.predictions.data_service.get_telemetry_for_device")
@patch("app.routers.predictions.data_service.save_prediction")
def test_predict_single_bin_success(mock_save, mock_get_telemetry):
    """
    Test the POST /predict/{device_id} endpoint returns HTTP 200 
    and correct JSON payload structure.
    """
    # Configure mock to return telemetry data
    mock_get_telemetry.return_value = MOCK_READINGS
    
    response = client.post(f"/predict/{MOCK_DEVICE_ID}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["device_id"] == MOCK_DEVICE_ID
    assert "predicted_fill_percent" in data
    assert "time_to_threshold_minutes" in data
    
    mock_get_telemetry.assert_called_once_with(MOCK_DEVICE_ID, limit=100)
    mock_save.assert_called_once()


@patch("app.routers.predictions.data_service.get_telemetry_for_device")
def test_predict_single_bin_not_found(mock_get_telemetry):
    """
    Test the POST /predict/{device_id} endpoint returns an HTTP 404 
    if no telemetry is found for the given device ID.
    """
    mock_get_telemetry.return_value = []
    
    response = client.post("/predict/UNKNOWN-BIN")
    
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "No telemetry data found" in data["detail"]


@patch("app.routers.predictions.data_service.get_all_telemetry")
def test_train_model_with_data(mock_get_all_telemetry):
    """
    Test POST /train triggers training and returns model loss metrics.
    """
    mock_get_all_telemetry.return_value = MOCK_ALL_TELEMETRY
    
    # We patch the predictor.train_model so we don't do real slow training in tests
    with patch("app.models.lstm_predictor.predictor.train_model") as mock_train:
        mock_train.return_value = {
            "status": "success",
            "loss": 0.05,
            "best_loss": 0.04,
            "epochs": 10,
            "num_samples": 5,
            "model_version": "v_test",
        }
        
        response = client.post("/train")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["loss"] == 0.05
        assert data["epochs"] == 10


@patch("app.routers.predictions.data_service.get_all_telemetry")
def test_train_model_no_data(mock_get_all_telemetry):
    """
    Test POST /train skipping training elegantly if the database is empty.
    """
    mock_get_all_telemetry.return_value = []
    
    response = client.post("/train")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "skipped"
    assert "No telemetry data" in data["reason"]


# --- Evaluate endpoint tests ---

MOCK_PREDICTION_PAIRS = [
    {
        "device_id": "uuid-1",
        "predicted_fill_percent": 60.0,
        "actual_fill_percent": 58.0,
        "confidence_score": 0.85,
        "model_version": "v1.0",
        "predicted_at": "2026-03-15T10:00:00Z",
        "actual_recorded_at": "2026-03-15T10:30:00Z",
        "device_code": "ECO-BIN-1001",
    },
    {
        "device_id": "uuid-1",
        "predicted_fill_percent": 72.0,
        "actual_fill_percent": 70.0,
        "confidence_score": 0.90,
        "model_version": "v1.0",
        "predicted_at": "2026-03-15T11:00:00Z",
        "actual_recorded_at": "2026-03-15T11:25:00Z",
        "device_code": "ECO-BIN-1001",
    },
    {
        "device_id": "uuid-2",
        "predicted_fill_percent": 45.0,
        "actual_fill_percent": 50.0,
        "confidence_score": 0.80,
        "model_version": "v1.0",
        "predicted_at": "2026-03-15T10:00:00Z",
        "actual_recorded_at": "2026-03-15T10:45:00Z",
        "device_code": "ECO-BIN-1002",
    },
]


@patch("app.routers.predictions.data_service.get_prediction_accuracy")
def test_evaluate_model_success(mock_get_accuracy):
    """
    Test GET /evaluate returns correct MAE, RMSE, and per-device metrics
    when prediction-actual pairs are available.
    """
    mock_get_accuracy.return_value = MOCK_PREDICTION_PAIRS

    response = client.get("/evaluate")

    assert response.status_code == 200
    data = response.json()

    # Errors: |60-58|=2, |72-70|=2, |45-50|=5 => MAE = 9/3 = 3.0
    assert data["mae"] == 3.0
    # RMSE: sqrt((4+4+25)/3) = sqrt(11) ≈ 3.32
    assert data["rmse"] == 3.32
    assert data["total_predictions"] == 3
    assert data["matched_predictions"] == 3
    assert data["model_version"] == "v1.0"

    # Per-device breakdown
    assert len(data["per_device"]) == 2
    device_map = {d["device"]: d for d in data["per_device"]}
    assert "ECO-BIN-1001" in device_map
    assert "ECO-BIN-1002" in device_map
    assert device_map["ECO-BIN-1001"]["mae"] == 2.0
    assert device_map["ECO-BIN-1001"]["samples"] == 2
    assert device_map["ECO-BIN-1002"]["mae"] == 5.0
    assert device_map["ECO-BIN-1002"]["samples"] == 1


@patch("app.routers.predictions.data_service.get_prediction_accuracy")
def test_evaluate_model_no_pairs(mock_get_accuracy):
    """
    Test GET /evaluate returns 404 when no matched prediction-actual pairs exist.
    """
    mock_get_accuracy.return_value = []

    response = client.get("/evaluate")

    assert response.status_code == 404
    data = response.json()
    assert "No matched prediction-actual pairs found" in data["detail"]
