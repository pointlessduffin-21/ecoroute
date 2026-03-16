import { getDb } from "../config/database";
import { shiftSchedules, smartBins, binTelemetry, collectionRoutes, routeStops, users, subdivisions, systemConfig } from "../db/schema";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";

let intervalId: ReturnType<typeof setInterval> | null = null;
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const triggeredToday = new Set<string>(); // Track shifts already triggered today
let lastResetDay = -1;

export function start() {
  console.log(`[route-scheduler] Starting shift-driven route scheduler (check every ${CHECK_INTERVAL / 1000}s)`);

  // First check after 10s to let DB init
  setTimeout(() => tick(), 10000);
  intervalId = setInterval(() => tick(), CHECK_INTERVAL);
}

export function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log("[route-scheduler] Stopped");
}

async function tick() {
  try {
    const now = new Date();
    const today = now.getDay(); // 0-6

    // Reset triggered set at midnight
    if (today !== lastResetDay) {
      triggeredToday.clear();
      lastResetDay = today;
    }

    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const db = getDb();

    // Get today's active shifts
    const todayShifts = await db.select({
      id: shiftSchedules.id,
      userId: shiftSchedules.userId,
      subdivisionId: shiftSchedules.subdivisionId,
      startTime: shiftSchedules.startTime,
      endTime: shiftSchedules.endTime,
      userName: users.fullName,
    })
    .from(shiftSchedules)
    .leftJoin(users, eq(shiftSchedules.userId, users.id))
    .where(and(
      eq(shiftSchedules.dayOfWeek, today),
      eq(shiftSchedules.isActive, true)
    ));

    if (todayShifts.length === 0) return;

    // Get threshold from config
    let threshold = 80;
    try {
      const [config] = await db.select().from(systemConfig)
        .where(eq(systemConfig.configKey, "auto_route_fill_threshold")).limit(1);
      if (config) threshold = parseInt(config.configValue, 10) || 80;
    } catch {}

    for (const shift of todayShifts) {
      // Skip if already triggered today
      if (triggeredToday.has(shift.id)) continue;

      // Skip if shift hasn't started yet
      if (currentTime < shift.startTime) continue;

      // Skip if shift already ended
      if (currentTime > shift.endTime) {
        triggeredToday.add(shift.id); // Mark as done so we don't check again
        continue;
      }

      // Check if a route already exists for this user+subdivision today
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const existingRoutes = await db.select({ id: collectionRoutes.id })
        .from(collectionRoutes)
        .where(and(
          eq(collectionRoutes.assignedDriverId, shift.userId),
          eq(collectionRoutes.subdivisionId, shift.subdivisionId),
          gte(collectionRoutes.createdAt, todayStart)
        ))
        .limit(1);

      if (existingRoutes.length > 0) {
        triggeredToday.add(shift.id);
        continue;
      }

      // Find bins above threshold in this subdivision
      const subBins = await db.select().from(smartBins)
        .where(and(
          eq(smartBins.subdivisionId, shift.subdivisionId),
          eq(smartBins.status, "active")
        ));

      if (subBins.length === 0) {
        triggeredToday.add(shift.id);
        continue;
      }

      const binIds = subBins.map(b => b.id);
      const allTelemetry = await db.select().from(binTelemetry)
        .where(inArray(binTelemetry.deviceId, binIds))
        .orderBy(desc(binTelemetry.recordedAt));

      const telemetryMap: Record<string, number> = {};
      for (const t of allTelemetry) {
        if (!telemetryMap[t.deviceId]) telemetryMap[t.deviceId] = t.fillLevelPercent;
      }

      const hotBins = subBins.filter(b => (telemetryMap[b.id] ?? 0) >= threshold);

      if (hotBins.length === 0) {
        // No bins above threshold — don't trigger yet, check again next interval
        continue;
      }

      // Sort by fill level descending
      hotBins.sort((a, b) => (telemetryMap[b.id] ?? 0) - (telemetryMap[a.id] ?? 0));

      // Try AI optimization
      let optimizedBy = "fallback";
      let orderedBins = hotBins;

      try {
        const aiUrl = process.env.AI_SERVICE_URL || "http://ai-service:8000";
        const depot = { lat: hotBins[0]!.latitude, lon: hotBins[0]!.longitude };
        const response = await fetch(`${aiUrl}/optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subdivision_id: shift.subdivisionId,
            depot,
            num_vehicles: 1,
            vehicle_capacity_liters: 1000,
            threshold_percent: threshold,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          const data = await response.json() as { routes?: { stops?: { bin_id: string }[] }[] };
          if (data.routes?.[0]?.stops) {
            const stopOrder = data.routes[0].stops.map((s) => s.bin_id);
            const binMap = new Map(hotBins.map(b => [b.id, b]));
            const reordered = stopOrder.map((id: string) => binMap.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
            if (reordered.length > 0) {
              orderedBins = reordered;
              optimizedBy = "ai";
            }
          }
        }
      } catch {}

      // Create route
      const totalDist = orderedBins.length * 1.2;
      const totalDur = orderedBins.length * 8;

      const [route] = await db.insert(collectionRoutes).values({
        subdivisionId: shift.subdivisionId,
        status: "planned",
        estimatedDistanceKm: +totalDist.toFixed(1),
        estimatedDurationMinutes: +totalDur.toFixed(0),
        assignedDriverId: shift.userId,
        scheduledDate: now,
      }).returning();

      for (let i = 0; i < orderedBins.length; i++) {
        await db.insert(routeStops).values({
          routeId: route!.id,
          deviceId: orderedBins[i]!.id,
          sequenceOrder: i + 1,
          status: "pending",
        });
      }

      triggeredToday.add(shift.id);
      console.log(`[route-scheduler] Shift-triggered route ${route!.id.slice(0, 8)}... for ${shift.userName} in subdivision ${shift.subdivisionId.slice(0, 8)}... with ${orderedBins.length} stops (${optimizedBy})`);
    }
  } catch (err) {
    console.error("[route-scheduler] Error:", err);
  }
}
