import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { alerts } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createAlertSchema = z.object({
  subdivisionId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  alertType: z.enum(["overflow", "low_battery", "sensor_anomaly", "offline"]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  message: z.string().optional(),
});

// ─── GET / — List alerts (filterable by type, severity, acknowledged) ───────

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const alertType = c.req.query("alertType") as
    | "overflow"
    | "low_battery"
    | "sensor_anomaly"
    | "offline"
    | undefined;
  const severity = c.req.query("severity") as
    | "low"
    | "medium"
    | "high"
    | "critical"
    | undefined;
  const acknowledged = c.req.query("acknowledged"); // "true" or "false"
  const subdivisionId = c.req.query("subdivisionId");

  const db = getDb();

  const conditions = [];
  if (alertType) {
    conditions.push(eq(alerts.alertType, alertType));
  }
  if (severity) {
    conditions.push(eq(alerts.severity, severity));
  }
  if (acknowledged !== undefined && acknowledged !== "") {
    conditions.push(eq(alerts.isAcknowledged, acknowledged === "true"));
  }
  if (subdivisionId) {
    conditions.push(eq(alerts.subdivisionId, subdivisionId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(alerts)
      .where(whereClause)
      .orderBy(desc(alerts.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(alerts)
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

// ─── GET /:id — Get alert by ID ────────────────────────────────────────────

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const result = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Alert not found" }, 404);
  }

  return c.json({ data: result[0] });
});

// ─── POST / — Create alert ─────────────────────────────────────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createAlertSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [created] = await db
    .insert(alerts)
    .values({
      subdivisionId: parsed.data.subdivisionId,
      deviceId: parsed.data.deviceId,
      alertType: parsed.data.alertType,
      severity: parsed.data.severity,
      message: parsed.data.message,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── PATCH /:id/acknowledge — Acknowledge an alert ─────────────────────────

app.patch("/:id/acknowledge", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = getDb();

  const [updated] = await db
    .update(alerts)
    .set({
      isAcknowledged: true,
      acknowledgedBy: user.id,
      acknowledgedAt: new Date(),
    })
    .where(eq(alerts.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Alert not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── DELETE /:id — Delete alert ─────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [deleted] = await db
    .delete(alerts)
    .where(eq(alerts.id, id))
    .returning();

  if (!deleted) {
    return c.json({ error: "Alert not found" }, 404);
  }

  return c.json({ message: "Alert deleted" });
});

export default app;
