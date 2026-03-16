import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "../config/database";
import {
  collectionRoutes,
  routeStops,
  smartBins,
  systemConfig,
  serviceEvents,
  alerts,
  binTelemetry,
  shiftSchedules,
  subdivisions,
} from "../db/schema";
import { optimizeRoute } from "../services/route-optimizer";
import { requireRole } from "../middleware/rbac";
import type { AppVariables } from "../types/context";
import { mkdirSync, writeFileSync } from "fs";

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
  depotLat: z.number().optional(),
  depotLng: z.number().optional(),
  numVehicles: z.number().int().min(1).max(20).default(1),
  vehicleCapacityLiters: z.number().int().min(100).max(50000).default(1000),
  includePredicted: z.boolean().default(true),
  avoidHighways: z.boolean().default(false),
  avoidTolls: z.boolean().default(false),
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

  // 1. Resolve depot coordinates
  let depotLat = parsed.data.depotLat ?? 14.5995;
  let depotLng = parsed.data.depotLng ?? 120.9842;

  if (parsed.data.depotLat == null || parsed.data.depotLng == null) {
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
  }

  // 2. Fetch active bins with latest fill level
  const bins = await db
    .select({
      id: smartBins.id,
      deviceCode: smartBins.deviceCode,
      latitude: smartBins.latitude,
      longitude: smartBins.longitude,
      capacityLiters: smartBins.capacityLiters,
    })
    .from(smartBins)
    .where(
      and(
        eq(smartBins.subdivisionId, parsed.data.subdivisionId),
        eq(smartBins.status, "active")
      )
    )
    .limit(parsed.data.maxStops);

  // Get latest telemetry per bin
  const binIds = bins.map((b) => b.id);
  let telemetryMap: Record<string, number> = {};
  if (binIds.length > 0) {
    const telemetry = await db
      .select({
        deviceId: binTelemetry.deviceId,
        fillLevelPercent: binTelemetry.fillLevelPercent,
      })
      .from(binTelemetry)
      .where(inArray(binTelemetry.deviceId, binIds))
      .orderBy(desc(binTelemetry.recordedAt));

    for (const t of telemetry) {
      if (!(t.deviceId in telemetryMap)) {
        telemetryMap[t.deviceId] = t.fillLevelPercent;
      }
    }
  }

  const binsWithFill = bins.map((b) => ({
    ...b,
    fillLevelPercent: telemetryMap[b.id] ?? 0,
  }));

  // 3. Call unified optimizer (AI service with fallback)
  const result = await optimizeRoute({
    subdivisionId: parsed.data.subdivisionId,
    depot: { latitude: depotLat, longitude: depotLng },
    bins: binsWithFill,
    numVehicles: parsed.data.numVehicles,
    vehicleCapacityLiters: parsed.data.vehicleCapacityLiters,
    thresholdPercent: parsed.data.fillThreshold,
    includePredicted: parsed.data.includePredicted,
    avoidHighways: parsed.data.avoidHighways,
    avoidTolls: parsed.data.avoidTolls,
  });

  // 4. Persist route
  const routeGeojsonStr = result.routeGeojson ? JSON.stringify(result.routeGeojson) : null;

  const [route] = await db
    .insert(collectionRoutes)
    .values({
      subdivisionId: parsed.data.subdivisionId,
      assignedDriverId: parsed.data.assignedDriverId,
      scheduledDate: parsed.data.scheduledDate
        ? new Date(parsed.data.scheduledDate)
        : new Date(),
      optimizationScore: result.optimizationScore,
      estimatedDistanceKm: result.totalDistanceKm,
      estimatedDurationMinutes: result.estimatedDurationMinutes,
      routeGeojson: routeGeojsonStr,
    })
    .returning();

  // 5. Persist stops
  let createdStops: typeof routeStops.$inferSelect[] = [];
  if (result.stops.length > 0) {
    createdStops = await db
      .insert(routeStops)
      .values(
        result.stops.map((stop) => ({
          routeId: route!.id,
          deviceId: stop.deviceId,
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
          binsConsidered: binsWithFill.length,
          fillThreshold: parsed.data.fillThreshold,
          optimizedBy: result.optimizedBy,
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

// ─── POST /:id/stops/:stopId/photo — Upload before/after photo ──────────

app.post("/:id/stops/:stopId/photo", async (c) => {
  const { id, stopId } = c.req.param();
  const user = c.get("user");
  const db = getDb();

  // Verify route stop exists and belongs to this route
  const stopResult = await db
    .select({
      id: routeStops.id,
      routeId: routeStops.routeId,
      deviceId: routeStops.deviceId,
    })
    .from(routeStops)
    .where(and(eq(routeStops.id, stopId), eq(routeStops.routeId, id)))
    .limit(1);

  if (stopResult.length === 0) {
    return c.json({ error: "Route stop not found" }, 404);
  }

  const stop = stopResult[0]!;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid multipart form data" }, 400);
  }

  const photoFile = formData.get("photo");
  const photoType = formData.get("type") as string | null;

  if (!photoFile || !(photoFile instanceof File)) {
    return c.json({ error: "Missing 'photo' file in form data" }, 400);
  }

  if (!photoType || !["before", "after"].includes(photoType)) {
    return c.json(
      { error: "Missing or invalid 'type' field. Must be 'before' or 'after'" },
      400
    );
  }

  // Save file to uploads directory
  const timestamp = Date.now();
  const dir = `uploads/route-photos/${id}`;
  const filename = `${stopId}-${photoType}-${timestamp}.jpg`;
  const filePath = `${dir}/${filename}`;

  try {
    mkdirSync(dir, { recursive: true });
    const buffer = Buffer.from(await photoFile.arrayBuffer());
    writeFileSync(filePath, buffer);
  } catch (err) {
    console.error("[route-photo] Failed to save file:", err);
    return c.json({ error: "Failed to save photo" }, 500);
  }

  const photoUrl = `/${filePath}`;

  // Update the route stop with the photo URL (use the photoProofUrl field)
  if (photoType === "after") {
    await db
      .update(routeStops)
      .set({ photoProofUrl: photoUrl })
      .where(eq(routeStops.id, stopId));
  }

  // Create a service_event record for this photo
  await db.insert(serviceEvents).values({
    deviceId: stop.deviceId,
    driverId: user.id,
    routeId: id,
    eventType: `photo_${photoType}`,
    evidenceUrl: photoUrl,
    notes: `${photoType} collection photo uploaded`,
  });

  return c.json({ photoUrl }, 201);
});

// ─── POST /:id/stops/:stopId/report-issue — Report an issue at a stop ────

const reportIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(1).max(2000),
  photoUrl: z.string().optional(),
});

app.post("/:id/stops/:stopId/report-issue", async (c) => {
  const { id, stopId } = c.req.param();
  const db = getDb();

  const body = await c.req.json();
  const parsed = reportIssueSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  // Verify route stop exists and get the bin info
  const stopResult = await db
    .select({
      id: routeStops.id,
      routeId: routeStops.routeId,
      deviceId: routeStops.deviceId,
    })
    .from(routeStops)
    .where(and(eq(routeStops.id, stopId), eq(routeStops.routeId, id)))
    .limit(1);

  if (stopResult.length === 0) {
    return c.json({ error: "Route stop not found" }, 404);
  }

  const stop = stopResult[0]!;

  // Get the bin's subdivision for the alert
  const binResult = await db
    .select({ subdivisionId: smartBins.subdivisionId })
    .from(smartBins)
    .where(eq(smartBins.id, stop.deviceId))
    .limit(1);

  const subdivisionId = binResult[0]?.subdivisionId ?? null;

  // Create an alert record
  const [created] = await db
    .insert(alerts)
    .values({
      subdivisionId,
      deviceId: stop.deviceId,
      alertType: "sensor_anomaly",
      severity: parsed.data.severity,
      message: `Route issue reported: ${parsed.data.description}${
        parsed.data.photoUrl ? ` [Photo: ${parsed.data.photoUrl}]` : ""
      }`,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── GET /:id/report — Generate a route completion report ─────────────────

app.get("/:id/report", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  // 1. Get the route
  const routeResult = await db
    .select()
    .from(collectionRoutes)
    .where(eq(collectionRoutes.id, id))
    .limit(1);

  if (routeResult.length === 0) {
    return c.json({ error: "Route not found" }, 404);
  }

  const route = routeResult[0]!;

  // 2. Get all stops with bin info
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

  // 3. Get service events (photos) for this route
  const events = await db
    .select()
    .from(serviceEvents)
    .where(eq(serviceEvents.routeId, id));

  // Build a map of events per device for easy lookup
  const eventsByDevice = new Map<
    string,
    Array<typeof serviceEvents.$inferSelect>
  >();
  for (const event of events) {
    const list = eventsByDevice.get(event.deviceId) || [];
    list.push(event);
    eventsByDevice.set(event.deviceId, list);
  }

  // 4. Get alerts created during route execution for these bins
  const stopDeviceIds = stops.map((s) => s.deviceId);
  let routeAlerts: Array<typeof alerts.$inferSelect> = [];
  if (stopDeviceIds.length > 0 && route.startedAt) {
    routeAlerts = await db
      .select()
      .from(alerts)
      .where(
        and(
          inArray(alerts.deviceId, stopDeviceIds),
          gte(alerts.createdAt, route.startedAt)
        )
      );
  }

  const alertsByDevice = new Map<
    string,
    Array<typeof alerts.$inferSelect>
  >();
  for (const alert of routeAlerts) {
    if (alert.deviceId) {
      const list = alertsByDevice.get(alert.deviceId) || [];
      list.push(alert);
      alertsByDevice.set(alert.deviceId, list);
    }
  }

  // 5. Build per-stop summary
  const servicedCount = stops.filter((s) => s.status === "serviced").length;
  const skippedCount = stops.filter((s) => s.status === "skipped").length;

  // Calculate average time per stop (for stops that have both arrived and serviced timestamps)
  let totalServiceTimeMs = 0;
  let stopsWithTime = 0;
  for (const stop of stops) {
    if (stop.arrivedAt && stop.servicedAt) {
      totalServiceTimeMs +=
        new Date(stop.servicedAt).getTime() -
        new Date(stop.arrivedAt).getTime();
      stopsWithTime++;
    }
  }
  const avgTimePerStopMinutes =
    stopsWithTime > 0
      ? Math.round((totalServiceTimeMs / stopsWithTime / 60000) * 100) / 100
      : null;

  const stopSummaries = stops.map((stop) => {
    const deviceEvents = eventsByDevice.get(stop.deviceId) || [];
    const beforePhotos = deviceEvents
      .filter((e) => e.eventType === "photo_before")
      .map((e) => e.evidenceUrl);
    const afterPhotos = deviceEvents
      .filter((e) => e.eventType === "photo_after")
      .map((e) => e.evidenceUrl);
    const deviceAlerts = alertsByDevice.get(stop.deviceId) || [];

    return {
      stopId: stop.id,
      sequenceOrder: stop.sequenceOrder,
      deviceCode: stop.deviceCode,
      deviceId: stop.deviceId,
      status: stop.status,
      arrivedAt: stop.arrivedAt,
      servicedAt: stop.servicedAt,
      beforePhotos,
      afterPhotos,
      photoProofUrl: stop.photoProofUrl,
      notes: stop.notes,
      issues: deviceAlerts.map((a) => ({
        severity: a.severity,
        message: a.message,
        createdAt: a.createdAt,
      })),
    };
  });

  // 6. Build the full report
  const report = {
    route: {
      id: route.id,
      subdivisionId: route.subdivisionId,
      status: route.status,
      scheduledDate: route.scheduledDate,
      startedAt: route.startedAt,
      completedAt: route.completedAt,
      estimatedDistanceKm: route.estimatedDistanceKm,
      estimatedDurationMinutes: route.estimatedDurationMinutes,
      optimizationScore: route.optimizationScore,
      assignedDriverId: route.assignedDriverId,
    },
    stops: stopSummaries,
    stats: {
      totalBins: stops.length,
      servicedCount,
      skippedCount,
      pendingCount: stops.filter((s) => s.status === "pending").length,
      arrivedCount: stops.filter((s) => s.status === "arrived").length,
      avgTimePerStopMinutes,
      totalIssues: routeAlerts.length,
    },
  };

  return c.json({ data: report });
});

// ─── POST /override-generate — Dispatcher manually triggers route generation for a user/subdivision

app.post("/override-generate", requireRole("admin", "dispatcher"), async (c) => {
  const body = await c.req.json();
  const { userId, subdivisionId } = body;

  if (!subdivisionId) return c.json({ error: "subdivisionId is required" }, 400);

  const db = getDb();

  // Get bins above threshold in subdivision
  const subBins = await db.select().from(smartBins)
    .where(and(eq(smartBins.subdivisionId, subdivisionId), eq(smartBins.status, "active")));

  if (subBins.length === 0) return c.json({ error: "No active bins in this subdivision" }, 400);

  const binIds = subBins.map(b => b.id);
  const allTelemetry = await db.select().from(binTelemetry)
    .where(inArray(binTelemetry.deviceId, binIds))
    .orderBy(desc(binTelemetry.recordedAt));

  const telemetryMap: Record<string, number> = {};
  for (const t of allTelemetry) {
    if (!telemetryMap[t.deviceId]) telemetryMap[t.deviceId] = t.fillLevelPercent;
  }

  // Take ALL bins that need collection (above 50% for overrides)
  const hotBins = subBins.filter(b => (telemetryMap[b.id] ?? 0) >= 50);
  if (hotBins.length === 0) return c.json({ error: "No bins need collection at this time" }, 400);

  hotBins.sort((a, b) => (telemetryMap[b.id] ?? 0) - (telemetryMap[a.id] ?? 0));

  const assignTo = userId || c.get("user").id;

  const [route] = await db.insert(collectionRoutes).values({
    subdivisionId,
    status: "planned",
    estimatedDistanceKm: +(hotBins.length * 1.2).toFixed(1),
    estimatedDurationMinutes: +(hotBins.length * 8).toFixed(0),
    assignedDriverId: assignTo,
    scheduledDate: new Date(),
  }).returning();

  for (let i = 0; i < hotBins.length; i++) {
    await db.insert(routeStops).values({
      routeId: route!.id,
      deviceId: hotBins[i]!.id,
      sequenceOrder: i + 1,
      status: "pending",
    });
  }

  return c.json({
    data: route,
    message: `Override route created with ${hotBins.length} stops`,
    stopsCount: hotBins.length
  });
});

// ─── POST /simulate — Run full end-to-end route execution simulation ────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

app.post("/simulate", requireRole("admin", "dispatcher"), async (c) => {
  const db = getDb();
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const subdivisionId = (body as Record<string, unknown>).subdivisionId as string | undefined;
  const events: { step: number; action: string; detail: string; timestamp: string }[] = [];
  let simShift: typeof shiftSchedules.$inferSelect | undefined;

  function log(step: number, action: string, detail: string) {
    events.push({ step, action, detail, timestamp: new Date().toISOString() });
  }

  if (!subdivisionId) {
    return c.json({ success: false, error: "subdivisionId is required — select a subdivision to simulate" }, 400);
  }

  // Get subdivision name for logs
  const [subRecord] = await db.select({ name: subdivisions.name }).from(subdivisions).where(eq(subdivisions.id, subdivisionId)).limit(1);
  const subName = subRecord?.name ?? subdivisionId.slice(0, 8);

  try {
    // Step 1: Find bins above threshold in the selected subdivision
    const allBins = await db.select().from(smartBins).where(and(eq(smartBins.status, "active"), eq(smartBins.subdivisionId, subdivisionId)));
    const binIds = allBins.map(b => b.id);

    if (binIds.length === 0) {
      return c.json({ success: false, error: "No active bins found" }, 400);
    }

    // Get latest telemetry
    const allTelemetry = await db.select().from(binTelemetry)
      .where(inArray(binTelemetry.deviceId, binIds))
      .orderBy(desc(binTelemetry.recordedAt));

    const telemetryMap: Record<string, typeof binTelemetry.$inferSelect> = {};
    for (const t of allTelemetry) {
      if (!telemetryMap[t.deviceId]) telemetryMap[t.deviceId] = t;
    }

    // Find bins above 50% for simulation (lower threshold to ensure we get some)
    const hotBins = allBins.filter(b => {
      const t = telemetryMap[b.id];
      return t && t.fillLevelPercent >= 50;
    }).slice(0, 4); // Max 4 stops for simulation

    if (hotBins.length === 0) {
      // If no bins above 50%, just pick the first 3
      hotBins.push(...allBins.slice(0, 3));
    }

    log(1, "scan", `[${subName}] Found ${hotBins.length} bins for collection (${hotBins.map(b => b.deviceCode).join(", ")})`);

    // Step 2: Create shift schedule (simulated)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const endHour = Math.min(now.getHours() + 8, 23);
    const endTime = `${String(endHour).padStart(2, "0")}:00`;

    const [createdShift] = await db.insert(shiftSchedules).values({
      userId: user.id,
      subdivisionId: hotBins[0]!.subdivisionId!,
      dayOfWeek,
      startTime,
      endTime,
      isActive: true,
    }).returning();
    simShift = createdShift;

    log(2, "create_schedule", `[${subName}] Shift created: ${DAY_NAMES[dayOfWeek]} ${startTime}-${endTime} for ${user.fullName || user.email}`);

    // Step 3: Create route
    const routeSubId = hotBins[0]!.subdivisionId;
    const [route] = await db.insert(collectionRoutes).values({
      subdivisionId: routeSubId!,
      status: "planned",
      estimatedDistanceKm: +(hotBins.length * 1.2).toFixed(1),
      estimatedDurationMinutes: +(hotBins.length * 8).toFixed(0),
      assignedDriverId: user.id,
      scheduledDate: new Date(),
    }).returning();

    log(3, "create_route", `Route ${route!.id.slice(0, 8)}... created with ${hotBins.length} stops`);

    // Step 4: Create stops
    const stopRecords = [];
    for (let i = 0; i < hotBins.length; i++) {
      const [stop] = await db.insert(routeStops).values({
        routeId: route!.id,
        deviceId: hotBins[i]!.id,
        sequenceOrder: i + 1,
        status: "pending",
      }).returning();
      stopRecords.push(stop!);
    }
    log(4, "create_stops", `${stopRecords.length} stops created in sequence`);

    // Step 5: Start route
    await db.update(collectionRoutes).set({ status: "in_progress", startedAt: new Date() }).where(eq(collectionRoutes.id, route!.id));
    log(5, "start_route", "Route started — driver en route to first stop");

    // Step 6-N: Execute each stop
    for (let i = 0; i < stopRecords.length; i++) {
      const stop = stopRecords[i]!;
      const bin = hotBins[i]!;
      const fill = telemetryMap[bin.id]?.fillLevelPercent ?? 0;
      const stepBase = 6 + (i * 3);

      // Arrive
      await db.update(routeStops).set({ status: "arrived", arrivedAt: new Date() }).where(eq(routeStops.id, stop.id));
      log(stepBase, "arrive", `Arrived at Stop #${i + 1} — ${bin.deviceCode} (fill: ${fill}%)`);

      // Simulate different scenarios
      if (i === hotBins.length - 2 && hotBins.length > 2) {
        // Skip one stop (second to last) to make it realistic
        await db.update(routeStops).set({ status: "skipped", notes: "Simulation: road blocked, cannot access bin" }).where(eq(routeStops.id, stop.id));
        log(stepBase + 1, "skip", `Skipped Stop #${i + 1} — ${bin.deviceCode} (road blocked)`);
      } else if (i === 1 && hotBins.length > 1) {
        // Report issue on second stop
        await db.insert(alerts).values({
          subdivisionId: subdivisionId,
          deviceId: bin.id,
          alertType: "sensor_anomaly",
          severity: "medium",
          message: `Simulation: Bin ${bin.deviceCode} lid damaged, needs repair`,
        });
        log(stepBase + 1, "report_issue", `Issue reported at Stop #${i + 1} — ${bin.deviceCode}: lid damaged`);

        // Still service it
        await db.update(routeStops).set({
          status: "serviced",
          servicedAt: new Date(),
          notes: "Simulation: Collected waste, reported lid damage for maintenance",
          photoProofUrl: "/uploads/placeholders/before.svg|/uploads/placeholders/after.svg",
        }).where(eq(routeStops.id, stop.id));
        log(stepBase + 2, "service", `Serviced Stop #${i + 1} — ${bin.deviceCode} (with issue reported)`);
      } else {
        // Normal service
        await db.update(routeStops).set({
          status: "serviced",
          servicedAt: new Date(),
          notes: `Simulation: Normal collection, bin was at ${fill}%`,
          photoProofUrl: "/uploads/placeholders/before.svg|/uploads/placeholders/after.svg",
        }).where(eq(routeStops.id, stop.id));
        log(stepBase + 1, "service", `Serviced Stop #${i + 1} — ${bin.deviceCode} (${fill}% fill collected)`);
      }
    }

    // Complete route
    const completedAt = new Date();
    await db.update(collectionRoutes).set({ status: "completed", completedAt }).where(eq(collectionRoutes.id, route!.id));

    const finalStep = 6 + (stopRecords.length * 3);
    const servicedCount = stopRecords.length - (hotBins.length > 2 ? 1 : 0);
    const skippedCount = hotBins.length > 2 ? 1 : 0;
    log(finalStep, "complete", `Route completed! ${servicedCount} serviced, ${skippedCount} skipped`);

    // Cleanup: remove temp shift schedule
    if (simShift) {
      await db.delete(shiftSchedules).where(eq(shiftSchedules.id, simShift.id));
      log(finalStep + 1, "cleanup", "Temporary shift schedule removed");
    }

    return c.json({
      success: true,
      routeId: route!.id,
      events,
      summary: {
        totalStops: stopRecords.length,
        serviced: servicedCount,
        skipped: skippedCount,
        issues: hotBins.length > 1 ? 1 : 0,
      }
    });
  } catch (err: any) {
    // Cleanup: remove temp shift schedule even on error
    if (simShift) {
      try {
        await db.delete(shiftSchedules).where(eq(shiftSchedules.id, simShift.id));
      } catch { /* ignore cleanup errors */ }
    }
    return c.json({ success: false, error: err.message, events }, 500);
  }
});

export default app;
