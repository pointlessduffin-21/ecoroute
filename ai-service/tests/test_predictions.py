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
