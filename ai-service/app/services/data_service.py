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
    """Check if the database is reachable."""
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
    device_id here is the smart_bin.id (UUID).
    """
    query = """
        SELECT
            bt.device_id,
            bt.fill_level_percent,
            bt.distance_cm,
            bt.battery_voltage,
            bt.signal_strength,
            bt.recorded_at
        FROM bin_telemetry bt
        WHERE bt.device_id = %s
        ORDER BY bt.recorded_at DESC
        LIMIT %s
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, (device_id, limit))
                rows = cur.fetchall()
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
    """Fetch all telemetry readings across all devices for model training.

    Orders by device_id first so that records for the same bin are contiguous,
    then by recorded_at within each device for correct time-series sequencing.
    """
    query = """
        SELECT
            bt.device_id,
            bt.fill_level_percent,
            bt.distance_cm,
            bt.battery_voltage,
            bt.signal_strength,
            bt.recorded_at
        FROM bin_telemetry bt
        ORDER BY bt.device_id, bt.recorded_at ASC
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
    """Get all active smart bins with their latest telemetry reading."""
    query = """
        SELECT DISTINCT ON (sb.id)
            sb.id,
            sb.id AS device_id,
            sb.device_code,
            sb.latitude,
            sb.longitude,
            sb.capacity_liters,
            sb.subdivision_id,
            sb.status,
            bt.fill_level_percent,
            bt.distance_cm,
            bt.battery_voltage,
            bt.signal_strength,
            bt.recorded_at
        FROM smart_bin sb
        LEFT JOIN bin_telemetry bt ON sb.id = bt.device_id
        WHERE sb.status = 'active'
        ORDER BY sb.id, bt.recorded_at DESC NULLS LAST
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
    """Get bins whose latest fill level exceeds the given threshold."""
    query = """
        SELECT DISTINCT ON (sb.id)
            sb.id,
            sb.id AS device_id,
            sb.device_code,
            sb.latitude,
            sb.longitude,
            sb.capacity_liters,
            sb.subdivision_id,
            bt.fill_level_percent,
            bt.recorded_at
        FROM smart_bin sb
        INNER JOIN bin_telemetry bt ON sb.id = bt.device_id
        WHERE sb.status = 'active'
          AND bt.fill_level_percent >= %s
    """
    params: list = [threshold]

    if subdivision_id:
        query += " AND sb.subdivision_id = %s"
        params.append(subdivision_id)

    query += " ORDER BY sb.id, bt.recorded_at DESC"

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
    """Get bins whose predicted fill level will breach the threshold."""
    query = """
        SELECT DISTINCT ON (sb.id)
            sb.id,
            sb.id AS device_id,
            sb.device_code,
            sb.latitude,
            sb.longitude,
            sb.capacity_liters,
            sb.subdivision_id,
            fp.predicted_fill_percent AS fill_level_percent,
            fp.predicted_at AS recorded_at
        FROM smart_bin sb
        INNER JOIN fill_prediction fp ON sb.id = fp.device_id
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
    """Save a fill level prediction to the database."""
    query = """
        INSERT INTO fill_prediction (
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


def get_prediction_accuracy(limit: int = 500) -> list[dict]:
    """
    Join fill_prediction with the nearest subsequent bin_telemetry reading
    to compare predicted vs actual fill levels.

    For each prediction, finds the closest actual telemetry reading that
    occurred within 2 hours after the prediction timestamp.
    """
    query = """
        SELECT
            fp.device_id,
            fp.predicted_fill_percent,
            fp.confidence_score,
            fp.model_version,
            fp.predicted_at,
            bt.fill_level_percent AS actual_fill_percent,
            bt.recorded_at AS actual_recorded_at,
            sb.device_code
        FROM fill_prediction fp
        INNER JOIN LATERAL (
            SELECT bt2.fill_level_percent, bt2.recorded_at
            FROM bin_telemetry bt2
            WHERE bt2.device_id = fp.device_id
              AND bt2.recorded_at > fp.predicted_at
              AND bt2.recorded_at <= fp.predicted_at + INTERVAL '2 hours'
            ORDER BY bt2.recorded_at ASC
            LIMIT 1
        ) bt ON true
        LEFT JOIN smart_bin sb ON sb.id = fp.device_id
        ORDER BY fp.predicted_at DESC
        LIMIT %s
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, (limit,))
                rows = cur.fetchall()
                records = [dict(row) for row in rows]
                logger.info(
                    "Fetched %d prediction-actual pairs for evaluation",
                    len(records),
                )
                return records
    except Exception as e:
        logger.error("Failed to fetch prediction accuracy data: %s", str(e))
        return []


def get_latest_predictions(device_id: str, limit: int = 10) -> list[dict]:
    """Get the most recent predictions for a device."""
    query = """
        SELECT
            id,
            device_id,
            predicted_fill_percent,
            time_to_threshold_minutes,
            confidence_score,
            model_version,
            predicted_at
        FROM fill_prediction
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
