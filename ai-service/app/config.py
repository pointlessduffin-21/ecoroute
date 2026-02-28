from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    DATABASE_URL: str = "postgresql://ecoroute:ecoroute@localhost:5432/ecoroute"
    MODEL_PATH: str = "./models/lstm_model.pkl"
    PREDICTION_HORIZON_HOURS: int = 24
    THRESHOLD_PERCENT: float = 80.0
    GOOGLE_MAPS_API_KEY: Optional[str] = None

    # Training hyperparameters
    LSTM_HIDDEN_SIZE: int = 64
    LSTM_NUM_LAYERS: int = 2
    LSTM_SEQUENCE_LENGTH: int = 12
    TRAINING_EPOCHS: int = 50
    TRAINING_BATCH_SIZE: int = 32
    LEARNING_RATE: float = 0.001

    # Route optimization defaults
    DEFAULT_NUM_VEHICLES: int = 1
    DEFAULT_VEHICLE_CAPACITY: int = 1000
    AVG_SPEED_KMH: float = 30.0
    STOP_DURATION_MINUTES: float = 5.0

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
