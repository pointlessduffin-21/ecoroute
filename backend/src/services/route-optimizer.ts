import { getDb } from "../config/database";
import { smartBins, collectionRoutes, routeStops } from "../db/schema";
import { eq, gte, and } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Coordinate {
  lat: number;
  lng: number;
}

interface OptimizedRouteResult {
  routeId: string;
  subdivisionId: string;
  bins: {
    id: string;
    deviceCode: string;
    latitude: number;
    longitude: number;
    fillLevelPercent: number | null;
  }[];
  totalBins: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  optimizationScore: number;
  note: string;
}

interface DistanceMatrixResult {
  origins: Coordinate[];
  destinations: Coordinate[];
  distances: number[][]; // metres
  durations: number[][]; // seconds
  note: string;
}

// ─── Route optimization ─────────────────────────────────────────────────────

/**
 * Generate an optimized collection route for all bins that are at or near
 * their fill threshold in a given subdivision.
 *
 * TODO: Integrate with a Google OR-Tools CVRP (Capacitated Vehicle Routing
 * Problem) solver running as a separate Python microservice. The current
 * implementation returns a naive ordering (sorted by fill level descending)
 * and placeholder distance/duration estimates. Once the microservice is
 * available, this function should:
 *   1. Fetch the distance matrix via `getDistanceMatrix()`
 *   2. POST the matrix + vehicle constraints to the Python solver endpoint
 *   3. Parse the optimized stop sequence from the solver response
 *   4. Persist the route and stops to the database
 */
export async function generateOptimizedRoute(
  subdivisionId: string,
  options?: { maxStops?: number }
): Promise<OptimizedRouteResult> {
  const db = getDb();
  const maxStops = options?.maxStops ?? 50;

  // Retrieve all active bins in the subdivision that are at or above 70% of
  // their threshold (i.e. approaching the configured threshold_percent).
  // We use a hard-coded 70 here as the "near threshold" lower bound; bins at
  // or above their individual threshold_percent will always be included.
  const bins = await db
    .select({
      id: smartBins.id,
      deviceCode: smartBins.deviceCode,
      latitude: smartBins.latitude,
      longitude: smartBins.longitude,
      thresholdPercent: smartBins.thresholdPercent,
      capacityLiters: smartBins.capacityLiters,
    })
    .from(smartBins)
    .where(
      and(
        eq(smartBins.subdivisionId, subdivisionId),
        eq(smartBins.status, "active")
      )
    );

  // For each bin, fetch the most recent telemetry fill level.
  // In a production system this would be a single joined/windowed query;
  // keeping it simple for the placeholder.
  const binsWithFill = await Promise.all(
    bins.map(async (bin) => {
      const [latest] = await db
        .select({ fillLevelPercent: smartBins.thresholdPercent })
        .from(smartBins)
        .where(eq(smartBins.id, bin.id))
        .limit(1);

      // Placeholder: we don't have a live fill level column on smart_bins,
      // so use threshold as a stand-in. Replace with actual latest telemetry.
      return {
        ...bin,
        fillLevelPercent: latest?.fillLevelPercent ?? null,
      };
    })
  );

  // Filter to bins that are at or near their threshold
  const eligibleBins = binsWithFill
    .filter((b) => b.fillLevelPercent !== null && b.fillLevelPercent >= b.thresholdPercent * 0.7)
    .sort((a, b) => (b.fillLevelPercent ?? 0) - (a.fillLevelPercent ?? 0))
    .slice(0, maxStops);

  // ── Placeholder distance/duration estimation ──────────────────────────────
  // Rough estimate: straight-line distances between consecutive points,
  // multiplied by a road-factor of 1.4. Replace with real Distance Matrix
  // API call once Google Maps integration is in place.
  const AVERAGE_SPEED_KMH = 25; // urban collection vehicle average speed
  const ROAD_FACTOR = 1.4;
  const SERVICE_TIME_PER_STOP_MIN = 3;

  let totalDistanceKm = 0;

  for (let i = 1; i < eligibleBins.length; i++) {
    const prev = eligibleBins[i - 1];
    const curr = eligibleBins[i];
    totalDistanceKm += haversineKm(prev!.latitude, prev!.longitude, curr!.latitude, curr!.longitude);
  }

  totalDistanceKm *= ROAD_FACTOR;

  const travelTimeMinutes = (totalDistanceKm / AVERAGE_SPEED_KMH) * 60;
  const serviceTimeMinutes = eligibleBins.length * SERVICE_TIME_PER_STOP_MIN;
  const estimatedDurationMinutes = Math.round(travelTimeMinutes + serviceTimeMinutes);
  const estimatedDistanceKm = Math.round(totalDistanceKm * 100) / 100;

  // Placeholder optimization score (0-100). In production this would come
  // from the OR-Tools solver comparing the optimized route against a naive
  // nearest-neighbor baseline.
  const optimizationScore = eligibleBins.length > 0 ? 65 : 0;

  // Persist the route
  const [route] = await db
    .insert(collectionRoutes)
    .values({
      subdivisionId,
      status: "planned",
      optimizationScore,
      estimatedDistanceKm,
      estimatedDurationMinutes,
    })
    .returning({ id: collectionRoutes.id });

  // Persist route stops
  if (eligibleBins.length > 0) {
    await db.insert(routeStops).values(
      eligibleBins.map((bin, index) => ({
        routeId: route!.id,
        deviceId: bin.id,
        sequenceOrder: index + 1,
        status: "pending" as const,
      }))
    );
  }

  return {
    routeId: route!.id,
    subdivisionId,
    bins: eligibleBins.map((b) => ({
      id: b.id,
      deviceCode: b.deviceCode,
      latitude: b.latitude,
      longitude: b.longitude,
      fillLevelPercent: b.fillLevelPercent,
    })),
    totalBins: eligibleBins.length,
    estimatedDistanceKm,
    estimatedDurationMinutes,
    optimizationScore,
    note: "Placeholder route using naive fill-level-descending ordering. Integrate with CVRP solver for production use.",
  };
}

// ─── Distance Matrix placeholder ─────────────────────────────────────────────

/**
 * Compute a distance matrix between a set of origins and destinations.
 *
 * TODO: Integrate with the Google Maps Distance Matrix API.
 * This placeholder returns straight-line (Haversine) distances scaled
 * by a road factor and estimated travel durations at 25 km/h average speed.
 *
 * Required env: GOOGLE_MAPS_API_KEY
 */
export async function getDistanceMatrix(
  origins: Coordinate[],
  destinations: Coordinate[]
): Promise<DistanceMatrixResult> {
  // TODO: Replace with actual Google Maps Distance Matrix API call:
  //
  //   const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  //   const response = await fetch(
  //     `https://maps.googleapis.com/maps/api/distancematrix/json?...&key=${apiKey}`
  //   );
  //   const json = await response.json();
  //   // ... parse rows/elements ...

  const ROAD_FACTOR = 1.4;
  const AVERAGE_SPEED_MS = 25 / 3.6; // 25 km/h in m/s

  const distances: number[][] = [];
  const durations: number[][] = [];

  for (const origin of origins) {
    const distRow: number[] = [];
    const durRow: number[] = [];

    for (const dest of destinations) {
      const straightLineKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
      const roadDistanceM = straightLineKm * 1000 * ROAD_FACTOR;
      const travelTimeSec = roadDistanceM / AVERAGE_SPEED_MS;

      distRow.push(Math.round(roadDistanceM));
      durRow.push(Math.round(travelTimeSec));
    }

    distances.push(distRow);
    durations.push(durRow);
  }

  return {
    origins,
    destinations,
    distances,
    durations,
    note: "Placeholder: Haversine distances with road factor 1.4x. Replace with Google Maps Distance Matrix API.",
  };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Calculate the Haversine great-circle distance between two coordinates in km.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
