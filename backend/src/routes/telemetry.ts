import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { binTelemetry, smartBins } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const ingestTelemetrySchema = z.object({
  deviceId: z.string().uuid(),
  fillLevelPercent: z.number().min(0).max(100),
  distanceCm: z.number().positive().optional(),
  batteryVoltage: z.number().positive().optional(),
  signalStrength: z.number().int().optional(),
  anomalyFlag: z.boolean().default(false),
  recordedAt: z.string().datetime().optional(),
});

// ─── POST / — Ingest telemetry data point ───────────────────────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = ingestTelemetrySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  // Verify the device exists
  const device = await db
    .select({ id: smartBins.id })
    .from(smartBins)
    .where(eq(smartBins.id, parsed.data.deviceId))
    .limit(1);

  if (device.length === 0) {
    return c.json({ error: "Device not found" }, 404);
  }

  // Insert telemetry record
  const [created] = await db
    .insert(binTelemetry)
    .values({
      deviceId: parsed.data.deviceId,
      fillLevelPercent: parsed.data.fillLevelPercent,
      distanceCm: parsed.data.distanceCm,
      batteryVoltage: parsed.data.batteryVoltage,
      signalStrength: parsed.data.signalStrength,
      anomalyFlag: parsed.data.anomalyFlag,
      recordedAt: parsed.data.recordedAt
        ? new Date(parsed.data.recordedAt)
        : new Date(),
    })
    .returning();

  // Update last_seen_at on the device
  await db
    .update(smartBins)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(smartBins.id, parsed.data.deviceId));

  return c.json({ data: created }, 201);
});

// ─── GET / — List telemetry records (paginated) ─────────────────────────────

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "50"), 500);
  const offset = Number(c.req.query("offset") || "0");

  const db = getDb();

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(binTelemetry)
      .orderBy(desc(binTelemetry.recordedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(binTelemetry),
  ]);

  return c.json({
    data: items,
    pagination: { total: countResult[0]!.count, limit, offset },
  });
});

// ─── GET /latest — Get latest telemetry for all bins in a subdivision ───────

app.get("/latest", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");

  if (!subdivisionId) {
    return c.json({ error: "subdivisionId query parameter is required" }, 400);
  }

  const db = getDb();

  // Use a lateral join / distinct on to get the latest telemetry per device
  const result = await db.execute(sql`
    SELECT DISTINCT ON (bt.device_id)
      bt.*,
      sb.device_code,
      sb.latitude,
      sb.longitude,
      sb.status as bin_status,
      sb.capacity_liters
    FROM bin_telemetry bt
    JOIN smart_bin sb ON sb.id = bt.device_id
    WHERE sb.subdivision_id = ${subdivisionId}
    ORDER BY bt.device_id, bt.recorded_at DESC
  `);

  return c.json({ data: result });
});

// ─── GET /stats — Get aggregated telemetry stats ────────────────────────────

app.get("/stats", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");
  const hours = Number(c.req.query("hours") || "24");

  const db = getDb();

  const subdivisionFilter = subdivisionId
    ? sql`AND sb.subdivision_id = ${subdivisionId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT bt.device_id)::int AS active_devices,
      ROUND(AVG(bt.fill_level_percent)::numeric, 2)::real AS avg_fill_level,
      MAX(bt.fill_level_percent)::real AS max_fill_level,
      MIN(bt.fill_level_percent)::real AS min_fill_level,
      ROUND(AVG(bt.battery_voltage)::numeric, 2)::real AS avg_battery_voltage,
      COUNT(*)::int AS total_readings,
      COUNT(CASE WHEN bt.anomaly_flag = true THEN 1 END)::int AS anomaly_count
    FROM bin_telemetry bt
    JOIN smart_bin sb ON sb.id = bt.device_id
    WHERE bt.recorded_at >= NOW() - ${hours + ' hours'}::interval
    ${subdivisionFilter}
  `);

  return c.json({ data: result[0] || {} });
});

export default app;
