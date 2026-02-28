import logging
from datetime import datetime
from typing import Optional
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from app.config import settings

logger = logging.getLogger(__name__)


@contextmanager
def get_db_connection():
    """Context manager for database connections with automatic cleanup."""
    conn = None
    try:
        conn = psycopg2.connect(settings.DATABASE_URL)
        yield conn
    except psycopg2.Error as e:
        logger.error("Database connection error: %s", str(e))
        raise
    finally:
        if conn is not None:
            conn.close()


def check_db_connection() -> bool:
    """
    Check if the database is reachable.

    Returns:
        True if connection succeeds, False otherwise.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                return True
    except Exception as e:
        logger.error("Database health check failed: %s", str(e))
        return False


def get_telemetry_for_device(device_id: str, limit: int = 100) -> list[dict]:
    """
    Fetch recent telemetry readings for a specific device.

    Args:
        device_id: The smart bin device identifier.
        limit: Maximum number of records to return.

    Returns:
        List of telemetry records sorted by recorded_at ascending (oldest first).
    """
    query = """
        SELECT
            device_id,
            fill_level_percent,
            distance_cm,
            battery_voltage,
            signal_strength,
            recorded_at
        FROM telemetry_readings
        WHERE device_id = %s
        ORDER BY recorded_at DESC
        LIMIT %s
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, (device_id, limit))
                rows = cur.fetchall()
                # Reverse to get ascending order (oldest first)
                records = [dict(row) for row in reversed(rows)]
                logger.info(
                    "Fetched %d telemetry records for device %s", len(records), device_id
                )
                return records
    except Exception as e:
        logger.error(
            "Failed to fetch telemetry for device %s: %s", device_id, str(e)
        )
        return []


def get_all_telemetry(limit: int = 10000) -> list[dict]:
    """
    Fetch all telemetry readings across all devices for model training.

    Args:
        limit: Maximum total records to return.

    Returns:
        List of telemetry records sorted by recorded_at ascending.
    """
    query = """
        SELECT
            device_id,
            fill_level_percent,
            distance_cm,
            battery_voltage,
            signal_strength,
            recorded_at
        FROM telemetry_readings
        ORDER BY recorded_at ASC
        LIMIT %s
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, (limit,))
                rows = cur.fetchall()
                records = [dict(row) for row in rows]
                logger.info("Fetched %d total telemetry records for training", len(records))
                return records
    except Exception as e:
        logger.error("Failed to fetch all telemetry: %s", str(e))
        return []


def get_all_bins() -> list[dict]:
    """
    Get all active smart bins with their latest telemetry reading.

    Returns:
        List of bin records with id, device_id, latitude, longitude,
        capacity_liters, and latest telemetry fields.
    """
    query = """
        SELECT DISTINCT ON (sb.id)
            sb.id,
            sb.device_id,
            sb.bin_name,
            sb.latitude,
            sb.longitude,
            sb.capacity_liters,
            sb.subdivision_id,
            sb.status,
            tr.fill_level_percent,
            tr.distance_cm,
            tr.battery_voltage,
            tr.signal_strength,
            tr.recorded_at
        FROM smart_bins sb
        LEFT JOIN telemetry_readings tr ON sb.device_id = tr.device_id
        WHERE sb.status = 'active'
        ORDER BY sb.id, tr.recorded_at DESC
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query)
                rows = cur.fetchall()
                records = [dict(row) for row in rows]
                logger.info("Fetched %d active bins", len(records))
                return records
    except Exception as e:
        logger.error("Failed to fetch all bins: %s", str(e))
        return []


def get_bins_above_threshold(
    threshold: float, subdivision_id: Optional[str] = None
) -> list[dict]:
    """
    Get bins whose latest fill level exceeds the given threshold.

    Args:
        threshold: Fill level percentage threshold.
        subdivision_id: Optional subdivision filter.

    Returns:
        List of bin records that need collection.
    """
    query = """
        SELECT DISTINCT ON (sb.id)
            sb.id,
            sb.device_id,
            sb.bin_name,
            sb.latitude,
            sb.longitude,
            sb.capacity_liters,
            sb.subdivision_id,
            tr.fill_level_percent,
            tr.recorded_at
        FROM smart_bins sb
        INNER JOIN telemetry_readings tr ON sb.device_id = tr.device_id
        WHERE sb.status = 'active'
          AND tr.fill_level_percent >= %s
    """
    params: list = [threshold]

    if subdivision_id:
        query += " AND sb.subdivision_id = %s"
        params.append(subdivision_id)

    query += " ORDER BY sb.id, tr.recorded_at DESC"

    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
                records = [dict(row) for row in rows]
                logger.info(
                    "Found %d bins above %.1f%% threshold", len(records), threshold
                )
                return records
    except Exception as e:
        logger.error("Failed to fetch bins above threshold: %s", str(e))
        return []


def get_bins_predicted_to_breach(
    threshold: float, subdivision_id: Optional[str] = None
) -> list[dict]:
    """
    Get bins whose predicted fill level will breach the threshold.

    Uses the most recent prediction for each device.

    Args:
        threshold: Fill level percentage threshold.
        subdivision_id: Optional subdivision filter.

    Returns:
        List of bin records predicted to exceed threshold.
    """
    query = """
        SELECT DISTINCT ON (sb.id)
            sb.id,
            sb.device_id,
            sb.bin_name,
            sb.latitude,
            sb.longitude,
            sb.capacity_liters,
            sb.subdivision_id,
            fp.predicted_fill_percent AS fill_level_percent,
            fp.predicted_at AS recorded_at
        FROM smart_bins sb
        INNER JOIN fill_predictions fp ON sb.device_id = fp.device_id
        WHERE sb.status = 'active'
          AND fp.predicted_fill_percent >= %s
    """
    params: list = [threshold]

    if subdivision_id:
        query += " AND sb.subdivision_id = %s"
        params.append(subdivision_id)

    query += " ORDER BY sb.id, fp.predicted_at DESC"

    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                rows = cur.fetchall()
                records = [dict(row) for row in rows]
                logger.info(
                    "Found %d bins predicted to breach %.1f%% threshold",
                    len(records),
                    threshold,
                )
                return records
    except Exception as e:
        logger.error("Failed to fetch predicted bins: %s", str(e))
        return []


def save_prediction(
    device_id: str,
    predicted_fill: float,
    time_to_threshold: float,
    confidence: float,
    model_version: str,
) -> bool:
    """
    Save a fill level prediction to the database.

    Args:
        device_id: The smart bin device identifier.
        predicted_fill: Predicted fill level percentage.
        time_to_threshold: Estimated minutes until threshold is reached.
        confidence: Confidence score (0.0-1.0).
        model_version: Version identifier of the model that made the prediction.

    Returns:
        True if saved successfully, False otherwise.
    """
    query = """
        INSERT INTO fill_predictions (
            device_id,
            predicted_fill_percent,
            time_to_threshold_minutes,
            confidence_score,
            model_version,
            predicted_at
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query,
                    (
                        device_id,
                        predicted_fill,
                        time_to_threshold,
                        confidence,
                        model_version,
                        datetime.utcnow(),
                    ),
                )
            conn.commit()
            logger.info("Saved prediction for device %s", device_id)
            return True
    except Exception as e:
        logger.error("Failed to save prediction for device %s: %s", device_id, str(e))
        return False


def get_latest_predictions(device_id: str, limit: int = 10) -> list[dict]:
    """
    Get the most recent predictions for a device.

    Args:
        device_id: The smart bin device identifier.
        limit: Maximum number of predictions to return.

    Returns:
        List of prediction records, newest first.
    """
    query = """
        SELECT
            id,
            device_id,
            predicted_fill_percent,
            time_to_threshold_minutes,
            confidence_score,
            model_version,
            predicted_at
        FROM fill_predictions
        WHERE device_id = %s
        ORDER BY predicted_at DESC
        LIMIT %s
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, (device_id, limit))
                rows = cur.fetchall()
                records = [dict(row) for row in rows]
                return records
    except Exception as e:
        logger.error(
            "Failed to fetch predictions for device %s: %s", device_id, str(e)
        )
        return []
