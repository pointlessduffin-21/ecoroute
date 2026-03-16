import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "../config/database";
import { smartBins, binTelemetry, fillPredictions } from "../db/schema";
import { requireRole } from "../middleware/rbac";
import type { AppVariables } from "../types/context";
import mqtt from "mqtt";

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
  photoUrl: z.string().url().optional(),
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

  // Fetch latest telemetry for each bin
  const binIds = items.map((b) => b.id);
  let telemetryMap: Record<string, typeof binTelemetry.$inferSelect> = {};

  if (binIds.length > 0) {
    // For each bin, get its latest telemetry row
    const allTelemetry = await db
      .select()
      .from(binTelemetry)
      .where(inArray(binTelemetry.deviceId, binIds))
      .orderBy(desc(binTelemetry.recordedAt));

    for (const row of allTelemetry) {
      if (!telemetryMap[row.deviceId]) {
        telemetryMap[row.deviceId] = row;
      }
    }
  }

  const binsWithTelemetry = items.map((bin) => ({
    ...bin,
    latestTelemetry: telemetryMap[bin.id] || null,
  }));

  return c.json({
    data: binsWithTelemetry,
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

// ─── POST / — Register new bin (admin/dispatcher only) ──────────────────────

app.post("/", requireRole("admin", "dispatcher"), async (c) => {
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

// ─── PUT /:id — Update bin (admin/dispatcher only) ──────────────────────────

app.put("/:id", requireRole("admin", "dispatcher"), async (c) => {
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

// ─── POST /:id/photo — Upload bin photo ─────────────────────────────────────

app.post("/:id/photo", requireRole("admin", "dispatcher"), async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  // Verify bin exists
  const [bin] = await db.select({ id: smartBins.id }).from(smartBins).where(eq(smartBins.id, id)).limit(1);
  if (!bin) return c.json({ error: "Bin not found" }, 404);

  const body = await c.req.parseBody();
  const file = body["photo"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No photo file provided" }, 400);
  }

  // Save to /app/uploads (Docker) or ./uploads (local)
  const fs = await import("fs/promises");
  const path = await import("path");
  const uploadsDir = path.join(process.cwd(), "uploads", "bins");
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${id}-${Date.now()}.${ext}`;
  const filepath = path.join(uploadsDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filepath, buffer);

  const photoUrl = `/uploads/bins/${filename}`;

  await db
    .update(smartBins)
    .set({ photoUrl, updatedAt: new Date() })
    .where(eq(smartBins.id, id));

  return c.json({ data: { photoUrl } });
});

// ─── DELETE /:id — Set status to inactive (admin/dispatcher only) ───────────

app.delete("/:id", requireRole("admin", "dispatcher"), async (c) => {
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

// ─── POST /mqtt-test — Test MQTT by listening for a message on a topic ──────

const mqttTestSchema = z.object({
  broker: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  topic: z.string().min(1),
});

app.post("/mqtt-test", requireRole("admin", "dispatcher"), async (c) => {
  const body = await c.req.json();
  const parsed = mqttTestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const { broker, port, topic } = parsed.data;
  const brokerUrl = `mqtt://${broker}:${port}`;

  return new Promise<Response>((resolve) => {
    const timeout = 15000; // 15 seconds
    let done = false;

    const testClient = mqtt.connect(brokerUrl, {
      clientId: `ecoroute-test-${Date.now()}`,
      clean: true,
      connectTimeout: 10000,
    });

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { testClient.end(true); } catch {}
      resolve(c.json({
        success: true,
        connected: true,
        message: null,
        info: `Connected to broker but no message received on "${topic}" within ${timeout / 1000}s`,
      }));
    }, timeout);

    testClient.on("connect", () => {
      testClient.subscribe(topic, { qos: 0 }, (err) => {
        if (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { testClient.end(true); } catch {}
          resolve(c.json({ success: false, error: `Subscribe failed: ${err.message}` }, 500));
        }
      });
    });

    testClient.on("message", (_msgTopic, payload) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        parsed = payload.toString();
      }

      try { testClient.end(true); } catch {}
      resolve(c.json({
        success: true,
        connected: true,
        topic: _msgTopic,
        message: parsed,
      }));
    });

    testClient.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { testClient.end(true); } catch {}
      resolve(c.json({ success: false, error: `Connection failed: ${err.message}` }, 500));
    });
  });
});

export default app;
