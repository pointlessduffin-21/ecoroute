import { getDb } from "../config/database";
import {
  smartBins,
  binTelemetry,
  collectionRoutes,
  routeStops,
  users,
  systemConfig,
} from "../db/schema";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import { optimizeRoute } from "./route-optimizer";

// ─── Configuration ──────────────────────────────────────────────────────────

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_FILL_THRESHOLD = 80; // percent

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

// ─── Types ──────────────────────────────────────────────────────────────────

interface BinWithTelemetry {
  id: string;
  deviceCode: string;
  subdivisionId: string;
  latitude: number;
  longitude: number;
  capacityLiters: number;
  fillLevelPercent: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read the fill threshold from system_config, falling back to default.
 */
async function getFillThreshold(): Promise<number> {
  try {
    const db = getDb();
    const rows = await db
      .select({ value: systemConfig.configValue })
      .from(systemConfig)
      .where(
        and(
          eq(systemConfig.configKey, "auto_route_fill_threshold"),
          sql`${systemConfig.subdivisionId} IS NULL`
        )
      )
      .limit(1);

    if (rows.length > 0) {
      const parsed = parseFloat(rows[0]!.value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn(
      "[route-scheduler] Could not read threshold from config, using default:",
      err instanceof Error ? err.message : err
    );
  }
  return DEFAULT_FILL_THRESHOLD;
}

/**
 * Get depot coordinates for a subdivision from system_config, or default to Manila.
 */
async function getDepotForSubdivision(
  subdivisionId: string
): Promise<{ latitude: number; longitude: number }> {
  const db = getDb();
  let depotLat = 14.5995;
  let depotLng = 120.9842;

  try {
    const depotConfigs = await db
      .select({
        key: systemConfig.configKey,
        value: systemConfig.configValue,
      })
      .from(systemConfig)
      .where(
        and(
          sql`${systemConfig.configKey} IN ('depot_latitude', 'depot_longitude')`,
          eq(systemConfig.subdivisionId, subdivisionId)
        )
      );

    for (const cfg of depotConfigs) {
      if (cfg.key === "depot_latitude") {
        depotLat = parseFloat(cfg.value) || depotLat;
      } else if (cfg.key === "depot_longitude") {
        depotLng = parseFloat(cfg.value) || depotLng;
      }
    }
  } catch {
    // Fall through to defaults
  }

  return { latitude: depotLat, longitude: depotLng };
}

/**
 * Find an available maintenance user in the given subdivision.
 * "Available" = active maintenance user not currently assigned to an in_progress route.
 */
async function findAvailableDriver(
  subdivisionId: string
): Promise<string | null> {
  const db = getDb();

  // Get all active maintenance users in this subdivision
  const maintenanceUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.subdivisionId, subdivisionId),
        eq(users.role, "maintenance"),
        eq(users.isActive, true)
      )
    );

  if (maintenanceUsers.length === 0) return null;

  // Find those NOT currently on an in-progress route
  const busyDriverIds = await db
    .select({ driverId: collectionRoutes.assignedDriverId })
    .from(collectionRoutes)
    .where(
      and(
        eq(collectionRoutes.subdivisionId, subdivisionId),
        eq(collectionRoutes.status, "in_progress")
      )
    );

  const busySet = new Set(
    busyDriverIds
      .map((r) => r.driverId)
      .filter((id): id is string => id !== null)
  );

  const available = maintenanceUsers.find((u) => !busySet.has(u.id));
  return available?.id ?? maintenanceUsers[0]!.id; // fallback to first user if all busy
}

/**
 * Create a collection_route and route_stop records for a set of bins.
 */
async function createRouteForSubdivision(
  subdivisionId: string,
  bins: BinWithTelemetry[]
): Promise<void> {
  const db = getDb();

  const depot = await getDepotForSubdivision(subdivisionId);
  const driverId = await findAvailableDriver(subdivisionId);

  const result = await optimizeRoute({
    subdivisionId,
    depot,
    bins: bins.map((b) => ({
      id: b.id,
      deviceCode: b.deviceCode,
      latitude: b.latitude,
      longitude: b.longitude,
      fillLevelPercent: b.fillLevelPercent,
      capacityLiters: b.capacityLiters,
    })),
  });

  // Create collection_route record
  const [route] = await db
    .insert(collectionRoutes)
    .values({
      subdivisionId,
      assignedDriverId: driverId,
      scheduledDate: new Date(),
      optimizationScore: result.optimizationScore,
      estimatedDistanceKm: result.totalDistanceKm,
      estimatedDurationMinutes: result.estimatedDurationMinutes,
      routeGeojson: result.routeGeojson ? JSON.stringify(result.routeGeojson) : null,
    })
    .returning();

  if (!route) {
    console.error(
      `[route-scheduler] Failed to create route for subdivision ${subdivisionId}`
    );
    return;
  }

  // Create route_stop records
  if (result.stops.length > 0) {
    await db.insert(routeStops).values(
      result.stops.map((stop) => ({
        routeId: route.id,
        deviceId: stop.deviceId,
        sequenceOrder: stop.sequence,
      }))
    );
  }

  console.info(
    `[route-scheduler] Created route ${route.id} for subdivision ${subdivisionId} ` +
      `with ${result.stops.length} stops (optimizedBy: ${result.optimizedBy}` +
      `${driverId ? `, assignedTo: ${driverId}` : ""})`
  );
}

// ─── Main scheduler tick ────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (running) {
    console.warn("[route-scheduler] Previous tick still running, skipping");
    return;
  }

  running = true;
  console.info("[route-scheduler] Running scheduled route generation check...");

  try {
    const db = getDb();
    const threshold = await getFillThreshold();

    // 1. Get all active bins
    const activeBins = await db
      .select({
        id: smartBins.id,
        deviceCode: smartBins.deviceCode,
        subdivisionId: smartBins.subdivisionId,
        latitude: smartBins.latitude,
        longitude: smartBins.longitude,
        capacityLiters: smartBins.capacityLiters,
      })
      .from(smartBins)
      .where(eq(smartBins.status, "active"));

    if (activeBins.length === 0) {
      console.info("[route-scheduler] No active bins found, skipping");
      return;
    }

    const binIds = activeBins.map((b) => b.id);

    // 2. Get latest telemetry per bin
    const latestTelemetry = await db
      .select()
      .from(binTelemetry)
      .where(inArray(binTelemetry.deviceId, binIds))
      .orderBy(desc(binTelemetry.recordedAt));

    // Deduplicate: keep first (most recent) per deviceId
    const telemetryMap = new Map<
      string,
      typeof binTelemetry.$inferSelect
    >();
    for (const row of latestTelemetry) {
      if (!telemetryMap.has(row.deviceId)) {
        telemetryMap.set(row.deviceId, row);
      }
    }

    // 3. Filter bins above threshold
    const binsAboveThreshold: BinWithTelemetry[] = [];
    for (const bin of activeBins) {
      const telemetry = telemetryMap.get(bin.id);
      if (telemetry && telemetry.fillLevelPercent >= threshold) {
        binsAboveThreshold.push({
          ...bin,
          fillLevelPercent: telemetry.fillLevelPercent,
        });
      }
    }

    if (binsAboveThreshold.length === 0) {
      console.info(
        `[route-scheduler] No bins above ${threshold}% threshold, skipping`
      );
      return;
    }

    console.info(
      `[route-scheduler] Found ${binsAboveThreshold.length} bins above ${threshold}% threshold`
    );

    // 4. Group by subdivisionId
    const bySubdivision = new Map<string, BinWithTelemetry[]>();
    for (const bin of binsAboveThreshold) {
      const group = bySubdivision.get(bin.subdivisionId) || [];
      group.push(bin);
      bySubdivision.set(bin.subdivisionId, group);
    }

    // 5. Check for existing planned/in_progress routes per subdivision
    //    to avoid creating duplicate routes
    const subdivisionIds = Array.from(bySubdivision.keys());
    const existingRoutes = await db
      .select({
        subdivisionId: collectionRoutes.subdivisionId,
        id: collectionRoutes.id,
      })
      .from(collectionRoutes)
      .where(
        and(
          inArray(collectionRoutes.subdivisionId, subdivisionIds),
          sql`${collectionRoutes.status} IN ('planned', 'in_progress')`,
          // Only consider routes created within the last 2 hours
          gte(
            collectionRoutes.createdAt,
            new Date(Date.now() - 2 * 60 * 60 * 1000)
          )
        )
      );

    const subdivisionsWithActiveRoutes = new Set(
      existingRoutes.map((r) => r.subdivisionId)
    );

    // 6. Create routes for each subdivision without active routes
    for (const [subdivisionId, bins] of bySubdivision) {
      if (subdivisionsWithActiveRoutes.has(subdivisionId)) {
        console.info(
          `[route-scheduler] Skipping subdivision ${subdivisionId} — active route already exists`
        );
        continue;
      }

      try {
        await createRouteForSubdivision(subdivisionId, bins);
      } catch (err) {
        console.error(
          `[route-scheduler] Error creating route for subdivision ${subdivisionId}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.info("[route-scheduler] Tick completed successfully");
  } catch (err) {
    console.error(
      "[route-scheduler] Tick failed:",
      err instanceof Error ? err.message : err
    );
  } finally {
    running = false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the auto-route generation scheduler.
 * Runs immediately on start, then every 30 minutes.
 */
export function start(): void {
  if (intervalHandle) {
    console.warn("[route-scheduler] Scheduler is already running");
    return;
  }

  console.info(
    `[route-scheduler] Starting auto-route scheduler (interval: ${INTERVAL_MS / 1000}s)`
  );

  // Run first tick after a short delay to let the DB connection initialize
  setTimeout(() => {
    tick().catch((err) => {
      console.error("[route-scheduler] Initial tick error:", err);
    });
  }, 5000);

  // Schedule recurring ticks
  intervalHandle = setInterval(() => {
    tick().catch((err) => {
      console.error("[route-scheduler] Scheduled tick error:", err);
    });
  }, INTERVAL_MS);
}

/**
 * Stop the auto-route generation scheduler.
 */
export function stop(): void {
  if (!intervalHandle) {
    console.warn("[route-scheduler] Scheduler is not running");
    return;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;
  console.info("[route-scheduler] Scheduler stopped");
}
