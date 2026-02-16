import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../config/database";
import { smartBins, binTelemetry, fillPredictions } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createBinSchema = z.object({
  subdivisionId: z.string().uuid(),
  deviceCode: z.string().min(1).max(100),
  imei: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  capacityLiters: z.number().positive().default(120),
  thresholdPercent: z.number().min(0).max(100).default(80),
  installDate: z.string().datetime().optional(),
  firmwareVersion: z.string().max(50).optional(),
});

const updateBinSchema = z.object({
  subdivisionId: z.string().uuid().optional(),
  deviceCode: z.string().min(1).max(100).optional(),
  imei: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  capacityLiters: z.number().positive().optional(),
  thresholdPercent: z.number().min(0).max(100).optional(),
  status: z.enum(["active", "inactive", "maintenance", "offline"]).optional(),
  firmwareVersion: z.string().max(50).optional(),
});

// ─── GET / — List smart bins (filterable by subdivision, status) ────────────

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const subdivisionId = c.req.query("subdivisionId");
  const status = c.req.query("status") as
    | "active"
    | "inactive"
    | "maintenance"
    | "offline"
    | undefined;

  const db = getDb();

  const conditions = [];
  if (subdivisionId) {
    conditions.push(eq(smartBins.subdivisionId, subdivisionId));
  }
  if (status) {
    conditions.push(eq(smartBins.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(smartBins)
      .where(whereClause)
      .orderBy(desc(smartBins.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(smartBins)
      .where(whereClause),
  ]);

  return c.json({
    data: items,
    pagination: {
      total: countResult[0]!.count,
      limit,
      offset,
    },
  });
});

// ─── GET /:id — Get bin by ID with latest telemetry ────────────────────────

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const binResult = await db
    .select()
    .from(smartBins)
    .where(eq(smartBins.id, id))
    .limit(1);

  if (binResult.length === 0) {
    return c.json({ error: "Smart bin not found" }, 404);
  }

  // Get latest telemetry reading
  const latestTelemetry = await db
    .select()
    .from(binTelemetry)
    .where(eq(binTelemetry.deviceId, id))
    .orderBy(desc(binTelemetry.recordedAt))
    .limit(1);

  return c.json({
    data: {
      ...binResult[0],
      latestTelemetry: latestTelemetry[0] || null,
    },
  });
});

// ─── POST / — Register new bin ──────────────────────────────────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createBinSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [created] = await db
    .insert(smartBins)
    .values({
      subdivisionId: parsed.data.subdivisionId,
      deviceCode: parsed.data.deviceCode,
      imei: parsed.data.imei,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      capacityLiters: parsed.data.capacityLiters,
      thresholdPercent: parsed.data.thresholdPercent,
      installDate: parsed.data.installDate
        ? new Date(parsed.data.installDate)
        : undefined,
      firmwareVersion: parsed.data.firmwareVersion,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── PUT /:id — Update bin ──────────────────────────────────────────────────

app.put("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateBinSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [updated] = await db
    .update(smartBins)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(smartBins.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Smart bin not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── DELETE /:id — Set status to inactive ───────────────────────────────────

app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [updated] = await db
    .update(smartBins)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(smartBins.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Smart bin not found" }, 404);
  }

  return c.json({ data: updated, message: "Bin set to inactive" });
});

// ─── GET /:id/telemetry — Get telemetry history (paginated, date range) ────

app.get("/:id/telemetry", async (c) => {
  const { id } = c.req.param();
  const limit = Math.min(Number(c.req.query("limit") || "50"), 500);
  const offset = Number(c.req.query("offset") || "0");
  const from = c.req.query("from"); // ISO date string
  const to = c.req.query("to"); // ISO date string

  const db = getDb();

  // Verify bin exists
  const binExists = await db
    .select({ id: smartBins.id })
    .from(smartBins)
    .where(eq(smartBins.id, id))
    .limit(1);

  if (binExists.length === 0) {
    return c.json({ error: "Smart bin not found" }, 404);
  }

  const conditions = [eq(binTelemetry.deviceId, id)];
  if (from) {
    conditions.push(gte(binTelemetry.recordedAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(binTelemetry.recordedAt, new Date(to)));
  }

  const whereClause = and(...conditions);

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(binTelemetry)
      .where(whereClause)
      .orderBy(desc(binTelemetry.recordedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(binTelemetry)
      .where(whereClause),
  ]);

  return c.json({
    data: items,
    pagination: {
      total: countResult[0]!.count,
      limit,
      offset,
    },
  });
});

// ─── GET /:id/predictions — Get fill predictions ───────────────────────────

app.get("/:id/predictions", async (c) => {
  const { id } = c.req.param();
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");

  const db = getDb();

  // Verify bin exists
  const binExists = await db
    .select({ id: smartBins.id })
    .from(smartBins)
    .where(eq(smartBins.id, id))
    .limit(1);

  if (binExists.length === 0) {
    return c.json({ error: "Smart bin not found" }, 404);
  }

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(fillPredictions)
      .where(eq(fillPredictions.deviceId, id))
      .orderBy(desc(fillPredictions.predictedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(fillPredictions)
      .where(eq(fillPredictions.deviceId, id)),
  ]);

  return c.json({
    data: items,
    pagination: {
      total: countResult[0]!.count,
      limit,
      offset,
    },
  });
});

export default app;
