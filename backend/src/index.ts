import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { serve } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";
import type { AppVariables } from "./types/context";

// Route imports
import authRoutes from "./routes/auth";
import subdivisionRoutes from "./routes/subdivisions";
import userRoutes from "./routes/users";
import binRoutes from "./routes/bins";
import telemetryRoutes from "./routes/telemetry";
import alertRoutes from "./routes/alerts";
import collectionRouteRoutes from "./routes/routes";
import serviceEventRoutes from "./routes/service-events";
import notificationRoutes from "./routes/notifications";
import analyticsRoutes from "./routes/analytics";
import systemConfigRoutes from "./routes/system-config";
import deviceRoutes from "./routes/device";
import aiRoutes from "./routes/ai";

// Services
import * as mqttService from "./services/mqtt";

// ─── App setup ────────────────────────────────────────────────────────────────

const app = new Hono<{ Variables: AppVariables }>();

// ─── Global middleware ────────────────────────────────────────────────────────

app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3001", "http://localhost", "http://localhost:80"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Device-API-Key"],
    credentials: true,
  })
);

// ─── Health check (no auth) ──────────────────────────────────────────────────

app.get("/", (c) => {
  return c.json({
    name: "EcoRoute API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Public routes (no auth) ─────────────────────────────────────────────────

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/device", deviceRoutes);

// ─── Protected routes (require auth) ─────────────────────────────────────────

const api = new Hono<{ Variables: AppVariables }>();
api.use("*", authMiddleware);
api.use("*", auditMiddleware);

api.route("/subdivisions", subdivisionRoutes);
api.route("/users", userRoutes);
api.route("/bins", binRoutes);
api.route("/telemetry", telemetryRoutes);
api.route("/alerts", alertRoutes);
api.route("/routes", collectionRouteRoutes);
api.route("/service-events", serviceEventRoutes);
api.route("/notifications", notificationRoutes);
api.route("/analytics", analyticsRoutes);
api.route("/system-config", systemConfigRoutes);
api.route("/ai", aiRoutes);

app.route("/api/v1", api);

// ─── 404 handler ──────────────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error(`[error] ${err.message}`, err.stack);
  return c.json(
    {
      error: "Internal Server Error",
      message:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    },
    500
  );
});

// ─── Start server ─────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3000;

console.log(`Starting EcoRoute Backend API on port ${port}...`);

// Start MQTT telemetry ingestion service
try {
  mqttService.start();
  console.log("MQTT telemetry ingestion service started");
} catch (err) {
  console.warn("MQTT service failed to start (non-fatal):", err);
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await mqttService.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down...");
  await mqttService.stop();
  process.exit(0);
});

// Node.js: start via @hono/node-server
// Bun: uses the default export below
const isBun = typeof globalThis.Bun !== "undefined";
if (!isBun) {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Server listening on http://localhost:${info.port}`);
  });
}

// Bun runtime uses this export
export default {
  port,
  fetch: app.fetch,
};
