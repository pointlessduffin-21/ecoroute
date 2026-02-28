import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.services import data_service
from app.services.route_optimizer import optimize_route

logger = logging.getLogger(__name__)

router = APIRouter(tags=["routes"])


class DepotLocation(BaseModel):
    latitude: float
    longitude: float


class OptimizeRequest(BaseModel):
    subdivision_id: Optional[str] = None
    depot: DepotLocation
    num_vehicles: int = Field(default=1, ge=1, le=20)
    vehicle_capacity_liters: int = Field(default=1000, ge=100, le=50000)
    threshold_percent: float = Field(default=80.0, ge=0.0, le=100.0)
    include_predicted: bool = True


class RouteStop(BaseModel):
    bin_id: str
    sequence: int
    lat: float
    lon: float
    fill_level: float = 0.0
    bin_name: str = ""


class VehicleRoute(BaseModel):
    vehicle_id: int
    stops: list[RouteStop]
    distance_km: float
    num_stops: int


class OptimizeResponse(BaseModel):
    routes: list[VehicleRoute]
    total_distance_km: float
    estimated_duration_minutes: float
    optimization_score: int
    num_bins_served: int
    status: str


@router.post("/optimize", response_model=OptimizeResponse)
async def optimize_collection_route(request: OptimizeRequest):
    """
    Generate an optimized waste collection route.

    Finds all bins above the fill threshold (and optionally those predicted
    to breach the threshold), then uses Google OR-Tools CVRP solver to
    compute the optimal collection route.

    The response includes per-vehicle stop sequences, total distance,
    estimated duration, and an optimization score.
    """
    try:
        # Get bins currently above threshold
        bins_above = data_service.get_bins_above_threshold(
            threshold=request.threshold_percent,
            subdivision_id=request.subdivision_id,
        )

        # Optionally include bins predicted to breach threshold
        if request.include_predicted:
            predicted_bins = data_service.get_bins_predicted_to_breach(
                threshold=request.threshold_percent,
                subdivision_id=request.subdivision_id,
            )
            # Merge, avoiding duplicates by device_id
            existing_ids = {b.get("device_id") for b in bins_above}
            for pb in predicted_bins:
                if pb.get("device_id") not in existing_ids:
                    bins_above.append(pb)
                    existing_ids.add(pb.get("device_id"))

        if not bins_above:
            return OptimizeResponse(
                routes=[],
                total_distance_km=0.0,
                estimated_duration_minutes=0.0,
                optimization_score=100,
                num_bins_served=0,
                status="no_bins_to_collect",
            )

        # Prepare bin data for the optimizer
        optimizer_bins = []
        for b in bins_above:
            lat = b.get("latitude")
            lon = b.get("longitude")
            if lat is None or lon is None:
                logger.warning(
                    "Bin %s has no coordinates, skipping.", b.get("id", "unknown")
                )
                continue

            optimizer_bins.append(
                {
                    "id": str(b.get("id", "")),
                    "lat": float(lat),
                    "lon": float(lon),
                    "fill_level": float(b.get("fill_level_percent", 0)),
                    "capacity": float(b.get("capacity_liters", 120)),
                    "bin_name": b.get("bin_name", ""),
                }
            )

        if not optimizer_bins:
            return OptimizeResponse(
                routes=[],
                total_distance_km=0.0,
                estimated_duration_minutes=0.0,
                optimization_score=100,
                num_bins_served=0,
                status="no_valid_bins",
            )

        depot = {
            "lat": request.depot.latitude,
            "lon": request.depot.longitude,
        }

        # Run the CVRP optimizer
        result = optimize_route(
            depot=depot,
            bins=optimizer_bins,
            num_vehicles=request.num_vehicles,
            vehicle_capacity=request.vehicle_capacity_liters,
        )

        # Convert to response model
        response_routes = []
        for route in result.get("routes", []):
            stops = [
                RouteStop(
                    bin_id=str(s.get("bin_id", "")),
                    sequence=s.get("sequence", 0),
                    lat=s.get("lat", 0.0),
                    lon=s.get("lon", 0.0),
                    fill_level=s.get("fill_level", 0.0),
                    bin_name=s.get("bin_name", ""),
                )
                for s in route.get("stops", [])
            ]
            response_routes.append(
                VehicleRoute(
                    vehicle_id=route.get("vehicle_id", 0),
                    stops=stops,
                    distance_km=route.get("distance_km", 0.0),
                    num_stops=route.get("num_stops", len(stops)),
                )
            )

        return OptimizeResponse(
            routes=response_routes,
            total_distance_km=result.get("total_distance_km", 0.0),
            estimated_duration_minutes=result.get("estimated_duration_minutes", 0.0),
            optimization_score=result.get("optimization_score", 0),
            num_bins_served=result.get("num_bins_served", 0),
            status=result.get("status", "success"),
        )

    except Exception as e:
        logger.error("Route optimization failed: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Route optimization failed: {str(e)}",
        )
