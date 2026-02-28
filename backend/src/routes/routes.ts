import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../config/database";
import { collectionRoutes, routeStops, smartBins, systemConfig } from "../db/schema";
import { env } from "../config/env";
import { requireRole } from "../middleware/rbac";
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

// ─── POST / — Create route manually (admin/dispatcher only) ────────────────

app.post("/", requireRole("admin", "dispatcher"), async (c) => {
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

// ─── POST /generate — Generate optimized route (admin/dispatcher only) ──────

app.post("/generate", requireRole("admin", "dispatcher"), async (c) => {
  const body = await c.req.json();
  const parsed = generateRouteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  // 1. Get depot coordinates from system_config for this subdivision
  let depotLat = 14.5995; // Default: Manila
  let depotLng = 120.9842;

  const depotConfigs = await db
    .select({
      key: systemConfig.configKey,
      value: systemConfig.configValue,
    })
    .from(systemConfig)
    .where(
      and(
        sql`${systemConfig.configKey} IN ('depot_latitude', 'depot_longitude')`,
        eq(systemConfig.subdivisionId, parsed.data.subdivisionId)
      )
    );

  for (const cfg of depotConfigs) {
    if (cfg.key === "depot_latitude") {
      depotLat = parseFloat(cfg.value) || depotLat;
    } else if (cfg.key === "depot_longitude") {
      depotLng = parseFloat(cfg.value) || depotLng;
    }
  }

  // 2. Call the Python AI service for CVRP optimization
  const aiServiceUrl = env.AI_SERVICE_URL;

  let optimizationResult: {
    routes?: Array<{
      vehicle_id: number;
      stops: Array<{
        device_id: string;
        device_code?: string;
        latitude: number;
        longitude: number;
        sequence: number;
      }>;
      distance_km?: number;
      duration_minutes?: number;
    }>;
    total_distance_km?: number;
    total_duration_minutes?: number;
    optimization_score?: number;
    error?: string;
  } | null = null;

  let usedAIService = false;

  try {
    const optimizeResponse = await fetch(`${aiServiceUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdivision_id: parsed.data.subdivisionId,
        depot: {
          latitude: depotLat,
          longitude: depotLng,
        },
        num_vehicles: 1,
        vehicle_capacity: 1000,
        threshold_percent: parsed.data.fillThreshold,
      }),
    });

    if (optimizeResponse.ok) {
      optimizationResult = await optimizeResponse.json() as typeof optimizationResult;
      usedAIService = true;
    } else {
      console.warn(
        `[route-generate] AI service returned ${optimizeResponse.status}, falling back to naive ordering`
      );
    }
  } catch (err) {
    console.warn(
      "[route-generate] AI service unavailable, falling back to naive ordering:",
      err instanceof Error ? err.message : err
    );
  }

  // 3. If the AI service returned optimized routes, use them
  if (usedAIService && optimizationResult?.routes && optimizationResult.routes.length > 0) {
    const aiRoute = optimizationResult.routes[0]!;
    const aiStops = aiRoute.stops || [];

    // Create the collection_route record
    const [route] = await db
      .insert(collectionRoutes)
      .values({
        subdivisionId: parsed.data.subdivisionId,
        assignedDriverId: parsed.data.assignedDriverId,
        scheduledDate: parsed.data.scheduledDate
          ? new Date(parsed.data.scheduledDate)
          : new Date(),
        optimizationScore: optimizationResult.optimization_score ?? null,
        estimatedDistanceKm: aiRoute.distance_km ?? optimizationResult.total_distance_km ?? null,
        estimatedDurationMinutes: aiRoute.duration_minutes ?? optimizationResult.total_duration_minutes ?? null,
      })
      .returning();

    // Create route_stop records from the optimization result
    let createdStops: typeof routeStops.$inferSelect[] = [];
    if (aiStops.length > 0) {
      createdStops = await db
        .insert(routeStops)
        .values(
          aiStops.map((stop) => ({
            routeId: route!.id,
            deviceId: stop.device_id,
            sequenceOrder: stop.sequence,
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
            note: "Route generated via AI-powered CVRP optimization.",
            binsConsidered: aiStops.length,
            fillThreshold: parsed.data.fillThreshold,
            optimizedBy: "ai-service",
          },
        },
      },
      201
    );
  }

  // 4. Fallback: naive ordering when AI service is unavailable
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

  const [route] = await db
    .insert(collectionRoutes)
    .values({
      subdivisionId: parsed.data.subdivisionId,
      assignedDriverId: parsed.data.assignedDriverId,
      scheduledDate: parsed.data.scheduledDate
        ? new Date(parsed.data.scheduledDate)
        : new Date(),
      optimizationScore: null,
      estimatedDistanceKm: bins.length * 1.2,
      estimatedDurationMinutes: bins.length * 5,
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
          note: "Route generated with naive ordering. AI optimization service was unavailable.",
          binsConsidered: bins.length,
          fillThreshold: parsed.data.fillThreshold,
          optimizedBy: "fallback",
        },
      },
    },
    201
  );
});

// ─── PUT /:id — Update route (admin/dispatcher only) ───────────────────────

app.put("/:id", requireRole("admin", "dispatcher"), async (c) => {
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
