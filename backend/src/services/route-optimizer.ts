import { env } from "../config/env";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OptimizationBin {
  id: string;
  deviceCode: string;
  latitude: number;
  longitude: number;
  fillLevelPercent: number;
  capacityLiters: number;
}

export interface OptimizationOptions {
  subdivisionId: string;
  depot: { latitude: number; longitude: number };
  bins: OptimizationBin[];
  numVehicles?: number;
  vehicleCapacityLiters?: number;
  thresholdPercent?: number;
  includePredicted?: boolean;
  avoidHighways?: boolean;
  avoidTolls?: boolean;
}

export interface OptimizedStop {
  deviceId: string;
  deviceCode?: string;
  latitude: number;
  longitude: number;
  sequence: number;
}

export interface OptimizationResult {
  stops: OptimizedStop[];
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  optimizationScore: number | null;
  routeGeojson: unknown | null;
  optimizedBy: "ai-service" | "fallback";
}

// ─── Main optimization function ─────────────────────────────────────────────

/**
 * Optimize a collection route by calling the Python AI service (CVRP via OR-Tools).
 * Falls back to nearest-neighbor ordering if the AI service is unavailable.
 */
export async function optimizeRoute(options: OptimizationOptions): Promise<OptimizationResult> {
  // Try AI service first
  const aiResult = await callAIService(options);
  if (aiResult) return aiResult;

  // Fallback: nearest-neighbor using Haversine
  return fallbackNearestNeighbor(options);
}

// ─── AI Service call ─────────────────────────────────────────────────────────

async function callAIService(options: OptimizationOptions): Promise<OptimizationResult | null> {
  const aiUrl = env.AI_SERVICE_URL;

  try {
    const response = await fetch(`${aiUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdivision_id: options.subdivisionId,
        depot: options.depot,
        bins: options.bins.map((b) => ({
          device_id: b.id,
          device_code: b.deviceCode,
          latitude: b.latitude,
          longitude: b.longitude,
          fill_level_percent: b.fillLevelPercent,
          capacity_liters: b.capacityLiters,
        })),
        num_vehicles: options.numVehicles ?? 1,
        vehicle_capacity_liters: options.vehicleCapacityLiters ?? 1000,
        threshold_percent: options.thresholdPercent ?? 80,
        include_predicted: options.includePredicted ?? true,
        avoid_highways: options.avoidHighways ?? false,
        avoid_tolls: options.avoidTolls ?? false,
      }),
    });

    if (!response.ok) {
      console.warn(`[route-optimizer] AI service returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;

    if (!data.routes || data.routes.length === 0 || data.routes[0].stops.length === 0) {
      console.warn("[route-optimizer] AI service returned empty routes");
      return null;
    }

    const aiRoute = data.routes[0];
    return {
      stops: aiRoute.stops.map((s: any) => ({
        deviceId: s.device_id,
        deviceCode: s.device_code,
        latitude: s.latitude ?? s.lat,
        longitude: s.longitude ?? s.lon,
        sequence: s.sequence,
      })),
      totalDistanceKm: aiRoute.distance_km ?? data.total_distance_km ?? 0,
      estimatedDurationMinutes:
        aiRoute.duration_minutes ?? data.estimated_duration_minutes ?? data.total_duration_minutes ?? 0,
      optimizationScore: data.optimization_score ?? null,
      routeGeojson: data.route_geojson ?? null,
      optimizedBy: "ai-service",
    };
  } catch (err) {
    console.warn(
      "[route-optimizer] AI service unavailable:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─── Fallback: Nearest-neighbor ordering ─────────────────────────────────────

function fallbackNearestNeighbor(options: OptimizationOptions): OptimizationResult {
  const { depot, bins } = options;
  if (bins.length === 0) {
    return {
      stops: [],
      totalDistanceKm: 0,
      estimatedDurationMinutes: 0,
      optimizationScore: null,
      routeGeojson: null,
      optimizedBy: "fallback",
    };
  }

  // Nearest-neighbor starting from depot
  const remaining = [...bins];
  const ordered: OptimizedStop[] = [];
  let current = { lat: depot.latitude, lng: depot.longitude };
  let totalDistanceKm = 0;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current.lat, current.lng, remaining[i]!.latitude, remaining[i]!.longitude);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0]!;
    totalDistanceKm += nearestDist;
    current = { lat: nearest.latitude, lng: nearest.longitude };

    ordered.push({
      deviceId: nearest.id,
      deviceCode: nearest.deviceCode,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      sequence: ordered.length + 1,
    });
  }

  // Add return to depot distance
  if (ordered.length > 0) {
    const last = ordered[ordered.length - 1]!;
    totalDistanceKm += haversineKm(last.latitude, last.longitude, depot.latitude, depot.longitude);
  }

  // Apply road factor (straight-line -> road distance)
  const ROAD_FACTOR = 1.4;
  const AVG_SPEED_KMH = 25;
  const STOP_DURATION_MIN = 5;

  totalDistanceKm *= ROAD_FACTOR;
  const travelMinutes = (totalDistanceKm / AVG_SPEED_KMH) * 60;
  const estimatedDurationMinutes = Math.round(travelMinutes + ordered.length * STOP_DURATION_MIN);

  return {
    stops: ordered,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    estimatedDurationMinutes,
    optimizationScore: null,
    routeGeojson: null,
    optimizedBy: "fallback",
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
