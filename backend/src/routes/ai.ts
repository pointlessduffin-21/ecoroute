import { Hono } from "hono";
import { z } from "zod";
import { generateInsight } from "../services/ai-insights";
import { env } from "../config/env";
import { requireRole } from "../middleware/rbac";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// AI features accessible by admin and dispatcher only
app.use("/*", requireRole("admin", "dispatcher"));

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const insightSchema = z.object({
  type: z.enum(["general", "hotspots", "peak_days", "staffing", "efficiency"]),
  subdivisionId: z.string().uuid().optional(),
  dateRange: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});

const predictSchema = z.object({
  deviceId: z.string().uuid(),
});

const optimizeRouteSchema = z.object({
  subdivisionId: z.string().uuid(),
  depot: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  numVehicles: z.number().int().positive().default(1),
  vehicleCapacity: z.number().int().positive().default(1000),
  thresholdPercent: z.number().min(0).max(100).default(70),
});

// ─── POST /insights — Generate AI insight ────────────────────────────────────

app.post("/insights", async (c) => {
  const body = await c.req.json();
  const parsed = insightSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  try {
    const result = await generateInsight(parsed.data);
    return c.json({ data: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate insight";
    console.error("[ai-insights] Error:", message);
    return c.json({ error: message }, 500);
  }
});

// ─── POST /predict — Proxy to Python AI service for LSTM prediction ─────────

app.post("/predict", async (c) => {
  const body = await c.req.json();
  const parsed = predictSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(
      `${aiServiceUrl}/predict/${parsed.data.deviceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service prediction failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-predict] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── POST /predict/all — Proxy to Python AI service for all predictions ─────

app.post("/predict/all", async (c) => {
  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/predict/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service bulk prediction failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-predict-all] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── POST /train — Trigger model training ───────────────────────────────────

app.post("/train", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service training failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-train] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── POST /optimize-route — Proxy to Python AI service for route optimization

app.post("/optimize-route", async (c) => {
  const body = await c.req.json();
  const parsed = optimizeRouteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdivision_id: parsed.data.subdivisionId,
        depot: {
          latitude: parsed.data.depot.latitude,
          longitude: parsed.data.depot.longitude,
        },
        num_vehicles: parsed.data.numVehicles,
        vehicle_capacity: parsed.data.vehicleCapacity,
        threshold_percent: parsed.data.thresholdPercent,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service route optimization failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-optimize-route] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

export default app;
