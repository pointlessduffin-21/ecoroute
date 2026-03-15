import logging
import math
from typing import Optional

import numpy as np
from ortools.constraint_solver import routing_enums_pb2, pywrapcp
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Earth radius in kilometers
EARTH_RADIUS_KM = 6371.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth
    using the Haversine formula.

    Args:
        lat1, lon1: Latitude and longitude of point 1 in degrees.
        lat2, lon2: Latitude and longitude of point 2 in degrees.

    Returns:
        Distance in kilometers.
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_KM * c


async def compute_distance_matrix(
    depot: dict, bins: list[dict], avoid_features: list[str] | None = None
) -> list[list[int]]:
    """
    Compute a distance matrix between all locations (depot + bins).
    
    If ORS_API_KEY is configured, it uses the OpenRouteService API for realistic
    driving distances. Otherwise, it falls back to the Haversine formula.

    The distance values are stored as integers in meters for OR-Tools compatibility.

    Args:
        depot: Dictionary with 'lat' and 'lon' keys.
        bins: List of bin dicts with 'lat' and 'lon' keys.

    Returns:
        2D list of distances in meters. Index 0 is the depot.
    """
    locations = [{"lat": depot["lat"], "lon": depot["lon"]}]
    for b in bins:
        locations.append({"lat": b["lat"], "lon": b["lon"]})

    n = len(locations)
    
    # Use OpenRouteService if configured and we have valid points
    if settings.ORS_API_KEY and n > 1:
        try:
            # ORS requires [longitude, latitude] arrays
            coordinates = [[loc["lon"], loc["lat"]] for loc in locations]
            
            headers = {
                "Accept": "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
                "Authorization": settings.ORS_API_KEY,
                "Content-Type": "application/json; charset=utf-8"
            }
            body = {
                "locations": coordinates,
                "metrics": ["distance"],
                "units": "m"
            }
            if avoid_features:
                body["options"] = {"avoid_features": avoid_features}

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openrouteservice.org/v2/matrix/driving-car",
                    json=body,
                    headers=headers,
                    timeout=15.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    distances_float = data.get("distances", [])
                    
                    if len(distances_float) == n and len(distances_float[0]) == n:
                        # Convert all floats to integers
                        matrix = [[int(val or 0) for val in row] for row in distances_float]
                        logger.info(f"Successfully retrieved ORS driving matrix for {n} points")
                        return matrix
                    else:
                        logger.error("ORS returned malformed distance matrix dimensions")
                else:
                    logger.error(f"ORS API error {response.status_code}: {response.text}")
                    
        except Exception as e:
            logger.error(f"Failed to query ORS Matrix API: {str(e)}")
            
    # Fallback to Haversine if ORS isn't configured or failed
    logger.info("Falling back to Haversine formula for distance matrix")
    matrix = [[0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            dist_km = haversine_distance(
                locations[i]["lat"],
                locations[i]["lon"],
                locations[j]["lat"],
                locations[j]["lon"],
            )
            dist_meters = int(dist_km * 1000)
            matrix[i][j] = dist_meters
            matrix[j][i] = dist_meters

    return matrix


async def get_route_geometry(
    waypoints: list[dict], avoid_features: list[str] | None = None
) -> dict | None:
    """
    Call ORS Directions API (driving-car) for road-following GeoJSON geometry.

    Args:
        waypoints: List of dicts with 'lat' and 'lon' keys (depot first, then stops, depot last).
        avoid_features: Optional list of ORS avoid features e.g. ["highways", "tollways"].

    Returns:
        GeoJSON FeatureCollection dict, or None on failure (429, non-2xx, no API key, exception).
    """
    if not settings.ORS_API_KEY:
        return None

    if len(waypoints) < 2:
        return None

    # ORS requires [longitude, latitude]
    coordinates = [[wp["lon"], wp["lat"]] for wp in waypoints]

    body: dict = {"coordinates": coordinates}
    if avoid_features:
        body["options"] = {"avoid_features": avoid_features}

    headers = {
        "Authorization": settings.ORS_API_KEY,
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, application/geo+json",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
                json=body,
                headers=headers,
                timeout=15.0,
            )

        if response.status_code == 200:
            logger.info("ORS Directions geometry fetched for %d waypoints", len(waypoints))
            return response.json()
        else:
            logger.warning(
                "ORS Directions returned %d, skipping geometry", response.status_code
            )
            return None

    except Exception as e:
        logger.warning("get_route_geometry failed: %s", str(e))
        return None


def _calculate_naive_distance(
    depot: dict, bins: list[dict]
) -> float:
    """
    Calculate the total distance of visiting bins in their original order
    (naive route) for optimization score comparison.

    Args:
        depot: Depot location.
        bins: List of bins in original order.

    Returns:
        Total distance in kilometers for the naive route.
    """
    if not bins:
        return 0.0

    total = haversine_distance(depot["lat"], depot["lon"], bins[0]["lat"], bins[0]["lon"])

    for i in range(len(bins) - 1):
        total += haversine_distance(
            bins[i]["lat"], bins[i]["lon"], bins[i + 1]["lat"], bins[i + 1]["lon"]
        )

    # Return to depot
    total += haversine_distance(
        bins[-1]["lat"], bins[-1]["lon"], depot["lat"], depot["lon"]
    )

    return total


async def optimize_route(
    depot: dict,
    bins: list[dict],
    num_vehicles: int = 1,
    vehicle_capacity: int = 1000,
    avoid_features: list[str] | None = None,
    distance_matrix: Optional[list[list[int]]] = None,
) -> dict:
    """
    Solve the Capacitated Vehicle Routing Problem (CVRP) using Google OR-Tools.

    Finds the optimal route(s) for collection vehicles to visit bins that need
    emptying, subject to vehicle capacity constraints.

    Args:
        depot: Depot location with 'lat' and 'lon' keys.
        bins: List of bin dicts, each with:
            - id: Bin identifier
            - lat: Latitude
            - lon: Longitude
            - fill_level: Current fill level percentage
            - capacity: Bin capacity in liters
        num_vehicles: Number of collection vehicles available.
        vehicle_capacity: Maximum capacity per vehicle in liters.
        distance_matrix: Optional pre-computed distance matrix (meters).
            If None, computed using Haversine formula.

    Returns:
        Dictionary with:
            - routes: List of route sequences per vehicle
            - total_distance_km: Total distance across all routes
            - estimated_duration_minutes: Total estimated time
            - optimization_score: 0-100 score comparing optimized vs naive routing
            - num_bins_served: Total bins included in routes
            - status: "success" or "no_solution"
    """
    if not bins:
        return {
            "routes": [],
            "total_distance_km": 0.0,
            "estimated_duration_minutes": 0.0,
            "optimization_score": 100,
            "num_bins_served": 0,
            "status": "no_bins",
            "route_geojson": None,
        }

    # Compute distance matrix if not provided
    if distance_matrix is None:
        distance_matrix = await compute_distance_matrix(depot, bins, avoid_features=avoid_features)

    num_locations = len(bins) + 1  # +1 for depot

    # Demands: depot has 0 demand; each bin's demand is its estimated waste volume
    demands = [0]  # Depot
    for b in bins:
        fill_fraction = float(b.get("fill_level", 0)) / 100.0
        capacity_liters = float(b.get("capacity", 120))  # Default 120L bin
        demand = int(fill_fraction * capacity_liters)
        demands.append(max(demand, 1))  # At least 1 liter demand

    # Create the routing index manager
    manager = pywrapcp.RoutingIndexManager(
        num_locations,
        num_vehicles,
        0,  # Depot index
    )

    # Create the routing model
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Capacity constraint
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        return demands[from_node]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # No slack
        [vehicle_capacity] * num_vehicles,  # Vehicle capacities
        True,  # Start cumul at zero
        "Capacity",
    )

    # Search parameters
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.FromSeconds(30)

    # Allow dropping visits if capacity is exceeded
    # Add penalty for dropping nodes to encourage visiting all bins
    penalty = 100000  # High penalty for skipping a bin
    for node in range(1, num_locations):
        routing.AddDisjunction([manager.NodeToIndex(node)], penalty)

    # Solve
    solution = routing.SolveWithParameters(search_parameters)

    if not solution:
        logger.warning("OR-Tools could not find a solution for the given constraints.")
        return {
            "routes": [],
            "total_distance_km": 0.0,
            "estimated_duration_minutes": 0.0,
            "optimization_score": 0,
            "num_bins_served": 0,
            "status": "no_solution",
            "route_geojson": None,
        }

    # Extract solution
    routes = []
    total_distance_meters = 0
    total_bins_served = 0

    for vehicle_id in range(num_vehicles):
        route_stops = []
        index = routing.Start(vehicle_id)
        route_distance = 0
        sequence = 0

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node > 0:  # Skip depot
                bin_data = bins[node - 1]
                route_stops.append(
                    {
                        "bin_id": bin_data.get("id", f"bin_{node}"),
                        "sequence": sequence,
                        "lat": bin_data["lat"],
                        "lon": bin_data["lon"],
                        "fill_level": bin_data.get("fill_level", 0),
                        "bin_name": bin_data.get("bin_name", ""),
                    }
                )
                sequence += 1
                total_bins_served += 1

            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(
                previous_index, index, vehicle_id
            )

        total_distance_meters += route_distance

        if route_stops:
            routes.append(
                {
                    "vehicle_id": vehicle_id,
                    "stops": route_stops,
                    "distance_km": round(route_distance / 1000.0, 2),
                    "num_stops": len(route_stops),
                }
            )

    total_distance_km = total_distance_meters / 1000.0

    # Fetch road geometry for each vehicle route, sequentially to respect ORS rate limits
    all_features: list[dict] = []
    for vehicle_route in routes:
        waypoint_list = [{"lat": depot["lat"], "lon": depot["lon"]}]
        for stop in vehicle_route["stops"]:
            waypoint_list.append({"lat": stop["lat"], "lon": stop["lon"]})
        waypoint_list.append({"lat": depot["lat"], "lon": depot["lon"]})

        geometry = await get_route_geometry(waypoint_list, avoid_features=avoid_features)
        if geometry and geometry.get("features"):
            all_features.extend(geometry["features"])

    route_geojson: dict | None = None
    if all_features:
        route_geojson = {"type": "FeatureCollection", "features": all_features}

    # Estimated duration: travel time + stop time
    travel_time_hours = total_distance_km / settings.AVG_SPEED_KMH
    travel_time_minutes = travel_time_hours * 60.0
    stop_time_minutes = total_bins_served * settings.STOP_DURATION_MINUTES
    estimated_duration = travel_time_minutes + stop_time_minutes

    # Optimization score: compare with naive ordering
    naive_distance = _calculate_naive_distance(depot, bins)
    if naive_distance > 0:
        savings_ratio = 1.0 - (total_distance_km / naive_distance)
        # Score: 50 (no improvement) to 100 (maximum improvement)
        # Even 0% savings gets 50 since it means the optimizer confirmed the route
        optimization_score = int(50 + savings_ratio * 50)
        optimization_score = max(0, min(100, optimization_score))
    else:
        optimization_score = 100

    logger.info(
        "Route optimization complete: %d vehicles, %d bins, %.2f km, score %d",
        len(routes),
        total_bins_served,
        total_distance_km,
        optimization_score,
    )

    return {
        "routes": routes,
        "total_distance_km": round(total_distance_km, 2),
        "estimated_duration_minutes": round(estimated_duration, 1),
        "optimization_score": optimization_score,
        "num_bins_served": total_bins_served,
        "status": "success",
        "route_geojson": route_geojson,
    }
