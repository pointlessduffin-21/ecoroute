import os
import logging
import pickle
from datetime import datetime
from typing import Optional

import numpy as np
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import MinMaxScaler

from app.config import settings

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = ["fill_level_percent", "distance_cm", "battery_voltage", "signal_strength"]
INPUT_SIZE = len(FEATURE_COLUMNS)


class LSTMPredictor:
    """
    Time-series fill-level predictor using scikit-learn MLPRegressor.

    Uses a sliding window approach: each input sample is a flattened window of
    (sequence_length × num_features) values, and the target is the next fill level.
    Falls back to linear extrapolation when insufficient data is available.
    """

    def __init__(self):
        self.model: Optional[MLPRegressor] = None
        self.scaler: MinMaxScaler = MinMaxScaler()
        self.is_trained: bool = False
        self.model_version: str = "untrained"
        self.sequence_length: int = settings.LSTM_SEQUENCE_LENGTH

    def _initialize_model(self) -> None:
        """Create a fresh MLPRegressor instance."""
        self.model = MLPRegressor(
            hidden_layer_sizes=(settings.LSTM_HIDDEN_SIZE, 32),
            activation="relu",
            solver="adam",
            learning_rate_init=settings.LEARNING_RATE,
            max_iter=settings.TRAINING_EPOCHS,
            batch_size=min(settings.TRAINING_BATCH_SIZE, 200),
            early_stopping=True,
            validation_fraction=0.15,
            n_iter_no_change=10,
            random_state=42,
            verbose=False,
        )

    def _extract_features(self, records: list[dict]) -> np.ndarray:
        """Extract feature matrix from telemetry records.

        Uses FEATURE_COLUMNS to guarantee consistent column ordering
        between training and prediction. Handles NULL DB values safely.
        """
        features = []
        for record in records:
            row = [float(record.get(col) or 0.0) for col in FEATURE_COLUMNS]
            features.append(row)
        return np.array(features, dtype=np.float32)

    def _create_sequences(
        self, data: np.ndarray, seq_length: int
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Create sliding-window samples for training.

        Each sample is a flattened window of (seq_length × features) and the
        target is the normalized fill_level_percent at the next time step.
        """
        X_list = []
        y_list = []
        for i in range(len(data) - seq_length):
            window = data[i : i + seq_length].flatten()
            target = data[i + seq_length, 0]  # fill_level_percent column
            X_list.append(window)
            y_list.append(target)
        return np.array(X_list), np.array(y_list)

    def train_model(self, telemetry_data: list[dict]) -> dict:
        """
        Train the MLP model on historical telemetry data.

        Returns a dictionary with training metrics.
        """
        min_required = self.sequence_length + 10
        if len(telemetry_data) < min_required:
            logger.warning(
                "Insufficient training data: %d records (need at least %d). "
                "Model will use linear extrapolation fallback.",
                len(telemetry_data),
                min_required,
            )
            return {
                "status": "skipped",
                "reason": f"Insufficient data: {len(telemetry_data)} records, need {min_required}",
                "loss": None,
                "epochs": 0,
                "num_samples": len(telemetry_data),
                "model_version": self.model_version,
            }

        features = self._extract_features(telemetry_data)

        # Guard against NaN values from bad sensor data
        if np.isnan(features).any():
            nan_count = int(np.isnan(features).sum())
            logger.warning("Found %d NaN values in features, replacing with 0", nan_count)
            features = np.nan_to_num(features, nan=0.0)

        self.scaler.fit(features)
        normalized = self.scaler.transform(features)

        # Group sequences by device_id to avoid cross-device sliding windows.
        # Without this, a window could span the last readings of bin A and
        # the first readings of bin B, creating impossible state transitions.
        X_all: list[np.ndarray] = []
        y_all: list[np.ndarray] = []

        device_groups: dict[str, list[int]] = {}
        for i, record in enumerate(telemetry_data):
            device_id = record.get("device_id", "unknown")
            device_groups.setdefault(device_id, []).append(i)

        for device_id, indices in device_groups.items():
            if len(indices) < self.sequence_length + 1:
                continue
            device_data = normalized[indices]
            X_dev, y_dev = self._create_sequences(device_data, self.sequence_length)
            if len(X_dev) > 0:
                X_all.append(X_dev)
                y_all.append(y_dev)

        if not X_all:
            return {
                "status": "skipped",
                "reason": "Could not create any training sequences",
                "loss": None,
                "epochs": 0,
                "num_samples": len(telemetry_data),
                "model_version": self.model_version,
            }

        X = np.concatenate(X_all)
        y = np.concatenate(y_all)

        self._initialize_model()

        logger.info(
            "Training MLP on %d sequences from %d devices (window=%d, features=%d, input_dim=%d)",
            len(X), len(device_groups), self.sequence_length, INPUT_SIZE, X.shape[1],
        )

        self.model.fit(X, y)

        final_loss = float(self.model.loss_)
        best_loss = float(min(self.model.loss_curve_)) if self.model.loss_curve_ else final_loss
        epochs = self.model.n_iter_

        self.is_trained = True
        self.model_version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        self.save_model(settings.MODEL_PATH)

        logger.info(
            "Training complete. Final loss: %.6f, Best loss: %.6f, Epochs: %d, Version: %s",
            final_loss, best_loss, epochs, self.model_version,
        )

        return {
            "status": "completed",
            "loss": round(final_loss, 6),
            "best_loss": round(best_loss, 6),
            "epochs": epochs,
            "num_samples": len(telemetry_data),
            "num_sequences": len(X),
            "model_version": self.model_version,
        }

    def predict_fill_level(self, device_id: str, recent_readings: list[dict]) -> dict:
        """
        Predict the next fill level for a device.

        Uses the MLP model if trained and sufficient data exists, otherwise
        falls back to linear extrapolation.
        """
        now = datetime.utcnow()

        if (
            self.is_trained
            and self.model is not None
            and len(recent_readings) >= self.sequence_length
        ):
            return self._predict_mlp(device_id, recent_readings, now)
        else:
            return self._predict_linear(device_id, recent_readings, now)

    def _predict_mlp(self, device_id: str, readings: list[dict], now: datetime) -> dict:
        """Predict using the trained MLP model."""
        recent = readings[-self.sequence_length :]
        features = self._extract_features(recent)

        try:
            normalized = self.scaler.transform(features)
        except Exception:
            logger.warning("Scaler transform failed, falling back to linear extrapolation.")
            return self._predict_linear(device_id, readings, now)

        input_vector = normalized.flatten().reshape(1, -1)
        predicted_normalized = float(self.model.predict(input_vector)[0])

        # Denormalize: manually reverse MinMaxScaler for the fill_level column only.
        # This avoids the fragile dummy-array approach that depends on inverse_transform
        # being column-independent.
        fill_min = float(self.scaler.data_min_[0])
        fill_max = float(self.scaler.data_max_[0])
        predicted_fill = float(np.clip(
            predicted_normalized * (fill_max - fill_min) + fill_min, 0.0, 100.0
        ))

        time_to_threshold = self._calculate_time_to_threshold(readings, predicted_fill)
        confidence = self._calculate_confidence(readings, predicted_fill)

        return {
            "device_id": device_id,
            "predicted_fill_percent": round(predicted_fill, 2),
            "time_to_threshold_minutes": round(time_to_threshold, 1),
            "confidence_score": round(confidence, 3),
            "prediction_method": "lstm",
            "model_version": self.model_version,
            "predicted_at": now.isoformat(),
        }

    def _predict_linear(self, device_id: str, readings: list[dict], now: datetime) -> dict:
        """Fallback prediction using simple linear extrapolation."""
        if len(readings) < 2:
            current_fill = float(readings[0].get("fill_level_percent", 0.0)) if readings else 0.0
            return {
                "device_id": device_id,
                "predicted_fill_percent": round(current_fill, 2),
                "time_to_threshold_minutes": -1.0,
                "confidence_score": 0.1,
                "prediction_method": "linear_extrapolation",
                "model_version": self.model_version,
                "predicted_at": now.isoformat(),
            }

        fill_levels = []
        timestamps = []
        for r in readings:
            fill_levels.append(float(r.get("fill_level_percent", 0.0)))
            recorded_at = r.get("recorded_at")
            if isinstance(recorded_at, str):
                try:
                    recorded_at = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
                except ValueError:
                    recorded_at = now
            if isinstance(recorded_at, datetime):
                timestamps.append(recorded_at)
            else:
                timestamps.append(now)

        if len(timestamps) >= 2:
            total_time_minutes = max(
                (timestamps[-1] - timestamps[0]).total_seconds() / 60.0, 1.0
            )
            total_fill_change = fill_levels[-1] - fill_levels[0]
            fill_rate_per_minute = total_fill_change / total_time_minutes
        else:
            fill_rate_per_minute = 0.0

        current_fill = fill_levels[-1]

        if len(timestamps) >= 2:
            # Use the last interval to project forward — more accurate than
            # the average when reading frequency varies (e.g. catch-up reads).
            last_interval_minutes = max(
                (timestamps[-1] - timestamps[-2]).total_seconds() / 60.0, 1.0
            )
        else:
            last_interval_minutes = 15.0

        predicted_fill = current_fill + fill_rate_per_minute * last_interval_minutes
        predicted_fill = float(np.clip(predicted_fill, 0.0, 100.0))

        time_to_threshold = self._calculate_time_to_threshold_linear(
            current_fill, fill_rate_per_minute
        )

        data_points_factor = min(len(readings) / 20.0, 1.0)
        confidence = 0.3 * data_points_factor

        return {
            "device_id": device_id,
            "predicted_fill_percent": round(predicted_fill, 2),
            "time_to_threshold_minutes": round(time_to_threshold, 1),
            "confidence_score": round(confidence, 3),
            "prediction_method": "linear_extrapolation",
            "model_version": self.model_version,
            "predicted_at": now.isoformat(),
        }

    def _calculate_time_to_threshold(
        self, readings: list[dict], predicted_fill: float
    ) -> float:
        """Estimate minutes until the bin reaches the threshold fill level."""
        threshold = settings.THRESHOLD_PERCENT

        if predicted_fill >= threshold:
            return 0.0

        if len(readings) >= 2:
            first_fill = float(readings[0].get("fill_level_percent", 0.0))
            last_fill = float(readings[-1].get("fill_level_percent", 0.0))

            first_time = readings[0].get("recorded_at")
            last_time = readings[-1].get("recorded_at")

            if isinstance(first_time, str):
                try:
                    first_time = datetime.fromisoformat(first_time.replace("Z", "+00:00"))
                except ValueError:
                    first_time = None
            if isinstance(last_time, str):
                try:
                    last_time = datetime.fromisoformat(last_time.replace("Z", "+00:00"))
                except ValueError:
                    last_time = None

            if first_time and last_time:
                elapsed_minutes = max(
                    (last_time - first_time).total_seconds() / 60.0, 1.0
                )
                fill_rate = (last_fill - first_fill) / elapsed_minutes
            else:
                fill_rate = 0.0
        else:
            fill_rate = 0.0

        if fill_rate <= 0:
            return -1.0

        remaining = threshold - predicted_fill
        minutes_to_threshold = remaining / fill_rate
        return max(minutes_to_threshold, 0.0)

    def _calculate_time_to_threshold_linear(
        self, current_fill: float, fill_rate_per_minute: float
    ) -> float:
        """Calculate time to threshold from current fill and fill rate."""
        threshold = settings.THRESHOLD_PERCENT

        if current_fill >= threshold:
            return 0.0

        if fill_rate_per_minute <= 0:
            return -1.0

        remaining = threshold - current_fill
        return remaining / fill_rate_per_minute

    def _calculate_confidence(self, readings: list[dict], predicted_fill: float) -> float:
        """Calculate confidence score based on data quality and prediction plausibility."""
        data_factor = min(len(readings) / (self.sequence_length * 3), 1.0)

        recent_fills = [
            float(r.get("fill_level_percent", 0.0)) for r in readings[-self.sequence_length :]
        ]
        if len(recent_fills) > 1:
            variance = float(np.var(recent_fills))
            variance_factor = 1.0 / (1.0 + variance / 100.0)
        else:
            variance_factor = 0.5

        if recent_fills:
            last_fill = recent_fills[-1]
            deviation = abs(predicted_fill - last_fill)
            plausibility_factor = 1.0 / (1.0 + deviation / 20.0)
        else:
            plausibility_factor = 0.5

        confidence = 0.4 * data_factor + 0.3 * variance_factor + 0.3 * plausibility_factor
        return float(np.clip(confidence, 0.05, 0.99))

    def save_model(self, path: str) -> None:
        """Save the trained model and scaler to disk using pickle."""
        if self.model is None:
            logger.warning("No model to save.")
            return

        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)

        checkpoint = {
            "model": self.model,
            "scaler": self.scaler,
            "is_trained": self.is_trained,
            "model_version": self.model_version,
            "sequence_length": self.sequence_length,
        }

        with open(path, "wb") as f:
            pickle.dump(checkpoint, f)

        logger.info("Model saved to %s (version: %s)", path, self.model_version)

    def load_model(self, path: str) -> bool:
        """Load a previously trained model from disk."""
        if not os.path.exists(path):
            logger.info("No saved model found at %s", path)
            return False

        try:
            with open(path, "rb") as f:
                checkpoint = pickle.load(f)

            self.model = checkpoint["model"]
            self.scaler = checkpoint["scaler"]
            self.is_trained = checkpoint.get("is_trained", True)
            self.model_version = checkpoint.get("model_version", "loaded")
            self.sequence_length = checkpoint.get("sequence_length", settings.LSTM_SEQUENCE_LENGTH)

            logger.info("Model loaded from %s (version: %s)", path, self.model_version)
            return True

        except Exception as e:
            logger.error("Failed to load model from %s: %s", path, str(e))
            self._initialize_model()
            return False


# Global predictor instance
predictor = LSTMPredictor()
