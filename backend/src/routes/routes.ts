import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../config/database";
import { collectionRoutes, routeStops, smartBins } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createRouteSchema = z.object({
  subdivisionId: z.string().uuid(),
  assignedDriverId: z.string().uuid().optional(),
  assignedVehicleId: z.string().max(100).optional(),
  scheduledDate: z.string().datetime().optional(),
  routeGeojson: z.string().optional(),
  estimatedDistanceKm: z.number().positive().optional(),
  estimatedDurationMinutes: z.number().positive().optional(),
  stops: z
    .array(
      z.object({
        deviceId: z.string().uuid(),
        sequenceOrder: z.number().int().positive(),
      })
    )
    .optional(),
});

const updateRouteSchema = z.object({
  assignedDriverId: z.string().uuid().nullable().optional(),
  assignedVehicleId: z.string().max(100).nullable().optional(),
  scheduledDate: z.string().datetime().nullable().optional(),
  routeGeojson: z.string().nullable().optional(),
  estimatedDistanceKm: z.number().positive().nullable().optional(),
  estimatedDurationMinutes: z.number().positive().nullable().optional(),
  optimizationScore: z.number().min(0).max(100).nullable().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
});

const updateStopStatusSchema = z.object({
  status: z.enum(["pending", "arrived", "serviced", "skipped"]),
  notes: z.string().optional(),
  photoProofUrl: z.string().url().optional(),
});

const generateRouteSchema = z.object({
  subdivisionId: z.string().uuid(),
  assignedDriverId: z.string().uuid().optional(),
  scheduledDate: z.string().datetime().optional(),
  maxStops: z.number().int().positive().default(30),
  fillThreshold: z.number().min(0).max(100).default(70),
});

// ─── GET / — List collection routes (filterable by status, date, driver) ────

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const status = c.req.query("status") as
    | "planned"
    | "in_progress"
    | "completed"
    | "cancelled"
    | undefined;
  const driverId = c.req.query("driverId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const subdivisionId = c.req.query("subdivisionId");

  const db = getDb();

  const conditions = [];
  if (status) {
    conditions.push(eq(collectionRoutes.status, status));
  }
  if (driverId) {
    conditions.push(eq(collectionRoutes.assignedDriverId, driverId));
  }
  if (subdivisionId) {
    conditions.push(eq(collectionRoutes.subdivisionId, subdivisionId));
  }
  if (from) {
    conditions.push(gte(collectionRoutes.scheduledDate, new Date(from)));
  }
  if (to) {
    conditions.push(lte(collectionRoutes.scheduledDate, new Date(to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(collectionRoutes)
      .where(whereClause)
      .orderBy(desc(collectionRoutes.scheduledDate))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(collectionRoutes)
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

// ─── GET /:id — Get route by ID with stops ─────────────────────────────────

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const routeResult = await db
    .select()
    .from(collectionRoutes)
    .where(eq(collectionRoutes.id, id))
    .limit(1);

  if (routeResult.length === 0) {
    return c.json({ error: "Route not found" }, 404);
  }

  const stops = await db
    .select({
      id: routeStops.id,
      routeId: routeStops.routeId,
      deviceId: routeStops.deviceId,
      sequenceOrder: routeStops.sequenceOrder,
      status: routeStops.status,
      arrivedAt: routeStops.arrivedAt,
      servicedAt: routeStops.servicedAt,
      photoProofUrl: routeStops.photoProofUrl,
      notes: routeStops.notes,
      deviceCode: smartBins.deviceCode,
      latitude: smartBins.latitude,
      longitude: smartBins.longitude,
    })
    .from(routeStops)
    .leftJoin(smartBins, eq(routeStops.deviceId, smartBins.id))
    .where(eq(routeStops.routeId, id))
    .orderBy(routeStops.sequenceOrder);

  return c.json({
    data: {
      ...routeResult[0],
      stops,
    },
  });
});

// ─── POST / — Create route manually ────────────────────────────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createRouteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const { stops, ...routeData } = parsed.data;

  // Create the route
  const [created] = await db
    .insert(collectionRoutes)
    .values({
      subdivisionId: routeData.subdivisionId,
      assignedDriverId: routeData.assignedDriverId,
      assignedVehicleId: routeData.assignedVehicleId,
      scheduledDate: routeData.scheduledDate
        ? new Date(routeData.scheduledDate)
        : undefined,
      routeGeojson: routeData.routeGeojson,
      estimatedDistanceKm: routeData.estimatedDistanceKm,
      estimatedDurationMinutes: routeData.estimatedDurationMinutes,
    })
    .returning();

  // Create stops if provided
  let createdStops: typeof routeStops.$inferSelect[] = [];
  if (stops && stops.length > 0) {
    createdStops = await db
      .insert(routeStops)
      .values(
        stops.map((stop) => ({
          routeId: created!.id,
          deviceId: stop.deviceId,
          sequenceOrder: stop.sequenceOrder,
        }))
      )
      .returning();
  }

  return c.json(
    {
      data: {
        ...created,
        stops: createdStops,
      },
    },
    201
  );
});

// ─── POST /generate — Generate optimized route (placeholder) ────────────────

app.post("/generate", async (c) => {
  const body = await c.req.json();
  const parsed = generateRouteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  // Fetch bins that are above the fill threshold in the subdivision
  const bins = await db
    .select({
      id: smartBins.id,
      deviceCode: smartBins.deviceCode,
      latitude: smartBins.latitude,
      longitude: smartBins.longitude,
    })
    .from(smartBins)
    .where(
      and(
        eq(smartBins.subdivisionId, parsed.data.subdivisionId),
        eq(smartBins.status, "active")
      )
    )
    .limit(parsed.data.maxStops);

  // Placeholder: create route with stops in the order returned
  // In production, this would call OR-Tools or a routing optimization service
  const [route] = await db
    .insert(collectionRoutes)
    .values({
      subdivisionId: parsed.data.subdivisionId,
      assignedDriverId: parsed.data.assignedDriverId,
      scheduledDate: parsed.data.scheduledDate
        ? new Date(parsed.data.scheduledDate)
        : new Date(),
      optimizationScore: 78.5, // Mock score
      estimatedDistanceKm: bins.length * 1.2, // Mock estimate
      estimatedDurationMinutes: bins.length * 5, // Mock estimate
    })
    .returning();

  let createdStops: typeof routeStops.$inferSelect[] = [];
  if (bins.length > 0) {
    createdStops = await db
      .insert(routeStops)
      .values(
        bins.map((bin, index) => ({
          routeId: route!.id,
          deviceId: bin.id,
          sequenceOrder: index + 1,
        }))
      )
      .returning();
  }

  return c.json(
    {
      data: {
        ...route,
        stops: createdStops,
        _meta: {
          note: "Route generated with placeholder optimization. OR-Tools integration pending.",
          binsConsidered: bins.length,
          fillThreshold: parsed.data.fillThreshold,
        },
      },
    },
    201
  );
});

// ─── PUT /:id — Update route ───────────────────────────────────────────────

app.put("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateRouteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const updateValues: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  // Convert scheduledDate string to Date if present
  if (parsed.data.scheduledDate) {
    updateValues.scheduledDate = new Date(parsed.data.scheduledDate);
  }

  const [updated] = await db
    .update(collectionRoutes)
    .set(updateValues)
    .where(eq(collectionRoutes.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Route not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── PATCH /:id/status — Update route status ───────────────────────────────

app.patch("/:id/status", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateStatusSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const updateValues: Record<string, unknown> = {
    status: parsed.data.status,
    updatedAt: new Date(),
  };

  // Set timestamp fields based on status transition
  if (parsed.data.status === "in_progress") {
    updateValues.startedAt = new Date();
  } else if (parsed.data.status === "completed") {
    updateValues.completedAt = new Date();
  }

  const [updated] = await db
    .update(collectionRoutes)
    .set(updateValues)
    .where(eq(collectionRoutes.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Route not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── GET /:id/stops — Get route stops ──────────────────────────────────────

app.get("/:id/stops", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  // Verify route exists
  const routeExists = await db
    .select({ id: collectionRoutes.id })
    .from(collectionRoutes)
    .where(eq(collectionRoutes.id, id))
    .limit(1);

  if (routeExists.length === 0) {
    return c.json({ error: "Route not found" }, 404);
  }

  const stops = await db
    .select({
      id: routeStops.id,
      routeId: routeStops.routeId,
      deviceId: routeStops.deviceId,
      sequenceOrder: routeStops.sequenceOrder,
      status: routeStops.status,
      arrivedAt: routeStops.arrivedAt,
      servicedAt: routeStops.servicedAt,
      photoProofUrl: routeStops.photoProofUrl,
      notes: routeStops.notes,
      deviceCode: smartBins.deviceCode,
      latitude: smartBins.latitude,
      longitude: smartBins.longitude,
    })
    .from(routeStops)
    .leftJoin(smartBins, eq(routeStops.deviceId, smartBins.id))
    .where(eq(routeStops.routeId, id))
    .orderBy(routeStops.sequenceOrder);

  return c.json({ data: stops });
});

// ─── PATCH /:id/stops/:stopId — Update stop status ─────────────────────────

app.patch("/:id/stops/:stopId", async (c) => {
  const { id, stopId } = c.req.param();
  const body = await c.req.json();
  const parsed = updateStopStatusSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const updateValues: Record<string, unknown> = {
    status: parsed.data.status,
  };

  if (parsed.data.notes !== undefined) {
    updateValues.notes = parsed.data.notes;
  }
  if (parsed.data.photoProofUrl !== undefined) {
    updateValues.photoProofUrl = parsed.data.photoProofUrl;
  }

  // Set timestamp based on status
  if (parsed.data.status === "arrived") {
    updateValues.arrivedAt = new Date();
  } else if (parsed.data.status === "serviced") {
    updateValues.servicedAt = new Date();
  }

  const [updated] = await db
    .update(routeStops)
    .set(updateValues)
    .where(and(eq(routeStops.id, stopId), eq(routeStops.routeId, id)))
    .returning();

  if (!updated) {
    return c.json({ error: "Route stop not found" }, 404);
  }

  return c.json({ data: updated });
});

export default app;
