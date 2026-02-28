import { Hono } from "hono";
import { deviceTelemetrySchema, processTelemetry } from "../services/telemetry-processor";

const app = new Hono();

const DEVICE_API_KEY = process.env.DEVICE_API_KEY || "ecoroute-device-key-change-in-production";

// ─── POST /telemetry — Device telemetry ingestion (device-key auth) ────────

app.post("/telemetry", async (c) => {
  const apiKey = c.req.header("X-Device-API-Key");
  if (!apiKey || apiKey !== DEVICE_API_KEY) {
    return c.json({ error: "Invalid or missing device API key" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = deviceTelemetrySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const result = await processTelemetry(parsed.data.deviceCode, {
    fillLevelPercent: parsed.data.fillLevelPercent,
    distanceCm: parsed.data.distanceCm,
    batteryVoltage: parsed.data.batteryVoltage,
    signalStrength: parsed.data.signalStrength,
    anomalyFlag: parsed.data.anomalyFlag,
  });

  if (!result.success) {
    return c.json({ error: result.error }, 404);
  }

  console.info(
    `[device] Telemetry received from ${parsed.data.deviceCode}: fill=${parsed.data.fillLevelPercent}% battery=${parsed.data.batteryVoltage}V`
  );

  return c.json(
    {
      data: {
        telemetryId: result.telemetryId,
        alertsCreated: result.alertsCreated,
      },
    },
    201
  );
});

// ─── POST /heartbeat — Simple device connectivity check ────────────────────

app.post("/heartbeat", async (c) => {
  const apiKey = c.req.header("X-Device-API-Key");
  if (!apiKey || apiKey !== DEVICE_API_KEY) {
    return c.json({ error: "Invalid or missing device API key" }, 401);
  }

  return c.json({ status: "ok", serverTime: new Date().toISOString() });
});

export default app;
