import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { serviceEvents, smartBins, users, collectionRoutes } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createServiceEventSchema = z.object({
  deviceId: z.string().uuid(),
  driverId: z.string().uuid(),
  routeId: z.string().uuid().optional(),
  eventType: z.string().min(1).max(50),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  evidenceUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// ─── GET / — List service events (paginated, filterable) ────────────────────

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const deviceId = c.req.query("deviceId");
  const driverId = c.req.query("driverId");
  const routeId = c.req.query("routeId");

  const db = getDb();

  const conditions = [];
  if (deviceId) {
    conditions.push(eq(serviceEvents.deviceId, deviceId));
  }
  if (driverId) {
    conditions.push(eq(serviceEvents.driverId, driverId));
  }
  if (routeId) {
    conditions.push(eq(serviceEvents.routeId, routeId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: serviceEvents.id,
        deviceId: serviceEvents.deviceId,
        driverId: serviceEvents.driverId,
        routeId: serviceEvents.routeId,
        eventType: serviceEvents.eventType,
        latitude: serviceEvents.latitude,
        longitude: serviceEvents.longitude,
        evidenceUrl: serviceEvents.evidenceUrl,
        notes: serviceEvents.notes,
        createdAt: serviceEvents.createdAt,
        deviceCode: smartBins.deviceCode,
        driverName: users.fullName,
      })
      .from(serviceEvents)
      .leftJoin(smartBins, eq(serviceEvents.deviceId, smartBins.id))
      .leftJoin(users, eq(serviceEvents.driverId, users.id))
      .where(whereClause)
      .orderBy(desc(serviceEvents.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(serviceEvents)
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

// ─── POST / — Create service event (proof of service) ──────────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createServiceEventSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  // Verify device exists
  const device = await db
    .select({ id: smartBins.id })
    .from(smartBins)
    .where(eq(smartBins.id, parsed.data.deviceId))
    .limit(1);

  if (device.length === 0) {
    return c.json({ error: "Device not found" }, 404);
  }

  // Verify driver exists
  const driver = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, parsed.data.driverId))
    .limit(1);

  if (driver.length === 0) {
    return c.json({ error: "Driver not found" }, 404);
  }

  // Verify route exists if provided
  if (parsed.data.routeId) {
    const route = await db
      .select({ id: collectionRoutes.id })
      .from(collectionRoutes)
      .where(eq(collectionRoutes.id, parsed.data.routeId))
      .limit(1);

    if (route.length === 0) {
      return c.json({ error: "Route not found" }, 404);
    }
  }

  const [created] = await db
    .insert(serviceEvents)
    .values({
      deviceId: parsed.data.deviceId,
      driverId: parsed.data.driverId,
      routeId: parsed.data.routeId,
      eventType: parsed.data.eventType,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      evidenceUrl: parsed.data.evidenceUrl,
      notes: parsed.data.notes,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── GET /:id — Get service event by ID ────────────────────────────────────

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const result = await db
    .select({
      id: serviceEvents.id,
      deviceId: serviceEvents.deviceId,
      driverId: serviceEvents.driverId,
      routeId: serviceEvents.routeId,
      eventType: serviceEvents.eventType,
      latitude: serviceEvents.latitude,
      longitude: serviceEvents.longitude,
      evidenceUrl: serviceEvents.evidenceUrl,
      notes: serviceEvents.notes,
      createdAt: serviceEvents.createdAt,
      deviceCode: smartBins.deviceCode,
      driverName: users.fullName,
    })
    .from(serviceEvents)
    .leftJoin(smartBins, eq(serviceEvents.deviceId, smartBins.id))
    .leftJoin(users, eq(serviceEvents.driverId, users.id))
    .where(eq(serviceEvents.id, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Service event not found" }, 404);
  }

  return c.json({ data: result[0] });
});

export default app;
