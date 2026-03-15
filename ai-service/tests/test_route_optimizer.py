import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from app.services.route_optimizer import (
    compute_distance_matrix,
    get_route_geometry,
    optimize_route,
)

# ─── get_route_geometry ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_route_geometry_returns_none_when_no_api_key():
    """With no ORS_API_KEY, get_route_geometry returns None gracefully."""
    waypoints = [
        {"lat": 14.5995, "lon": 120.9842},
        {"lat": 14.6100, "lon": 120.9900},
    ]
    with patch("app.services.route_optimizer.settings") as mock_settings:
        mock_settings.ORS_API_KEY = None
        result = await get_route_geometry(waypoints)
    assert result is None

@pytest.mark.asyncio
async def test_get_route_geometry_returns_none_on_429():
    """On ORS rate limit (429), get_route_geometry returns None."""
    waypoints = [
        {"lat": 14.5995, "lon": 120.9842},
        {"lat": 14.6100, "lon": 120.9900},
    ]
    mock_response = MagicMock()
    mock_response.status_code = 429

    with patch("app.services.route_optimizer.settings") as mock_settings, \
         patch("httpx.AsyncClient") as mock_client_cls:
        mock_settings.ORS_API_KEY = "test-key"
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await get_route_geometry(waypoints)
    assert result is None

@pytest.mark.asyncio
async def test_get_route_geometry_returns_geojson_on_success():
    """On 200 response, get_route_geometry returns parsed GeoJSON."""
    waypoints = [
        {"lat": 14.5995, "lon": 120.9842},
        {"lat": 14.6100, "lon": 120.9900},
    ]
    mock_geojson = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": {"type": "LineString", "coordinates": []}}],
    }
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json = MagicMock(return_value=mock_geojson)

    with patch("app.services.route_optimizer.settings") as mock_settings, \
         patch("httpx.AsyncClient") as mock_client_cls:
        mock_settings.ORS_API_KEY = "test-key"
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await get_route_geometry(waypoints)
    assert result == mock_geojson

# ─── avoid_features threading ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_optimize_route_passes_avoid_features_to_distance_matrix():
    """avoid_features list is threaded into compute_distance_matrix."""
    depot = {"lat": 14.5995, "lon": 120.9842}
    bins = [
        {"id": "b1", "lat": 14.601, "lon": 120.985, "fill_level": 85, "capacity": 120},
        {"id": "b2", "lat": 14.603, "lon": 120.987, "fill_level": 90, "capacity": 120},
    ]

    with patch(
        "app.services.route_optimizer.compute_distance_matrix",
        new_callable=AsyncMock,
    ) as mock_matrix, patch(
        "app.services.route_optimizer.get_route_geometry",
        new_callable=AsyncMock,
        return_value=None,
    ):
        mock_matrix.return_value = [[0, 500, 800], [500, 0, 400], [800, 400, 0]]
        await optimize_route(
            depot=depot,
            bins=bins,
            avoid_features=["highways"],
        )
        mock_matrix.assert_called_once()
        call_kwargs = mock_matrix.call_args
        assert call_kwargs.kwargs.get("avoid_features") == ["highways"] or \
               (len(call_kwargs.args) >= 3 and call_kwargs.args[2] == ["highways"])
