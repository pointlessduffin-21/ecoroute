import mqtt from "mqtt";
import { z } from "zod";
import { getDb } from "../config/database";
import { smartBins, binTelemetry, alerts } from "../db/schema";
import { eq } from "drizzle-orm";

// ─── Telemetry payload schema ────────────────────────────────────────────────

const telemetrySchema = z.object({
  fill_level_percent: z.number().min(0).max(100),
  distance_cm: z.number(),
  battery_voltage: z.number().nonnegative(),
  signal_strength: z.number().int(),
});

type TelemetryPayload = z.infer<typeof telemetrySchema>;

// ─── Module state ────────────────────────────────────────────────────────────

const TOPIC = "ecoroute/+/telemetry";

let client: mqtt.MqttClient | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the device_code from a topic string.
 * Topic format: ecoroute/<device_code>/telemetry
 */
function extractDeviceCode(topic: string): string | null {
  const segments = topic.split("/");
  if (segments.length === 3 && segments[0] === "ecoroute" && segments[2] === "telemetry") {
    return segments[1] ?? null;
  }
  return null;
}

/**
 * Determine whether the incoming distance_cm value is anomalous.
 * Simple heuristic: negative values or readings greater than 300 cm are
 * considered sensor anomalies.
 */
function isDistanceAnomalous(distanceCm: number): boolean {
  return distanceCm < 0 || distanceCm > 300;
}

// ─── Core processing logic ───────────────────────────────────────────────────

async function handleTelemetryMessage(topic: string, payload: Buffer): Promise<void> {
  const deviceCode = extractDeviceCode(topic);
  if (!deviceCode) {
    console.warn(`[mqtt] Could not extract device_code from topic: ${topic}`);
    return;
  }

  // Parse JSON
  let raw: unknown;
  try {
    raw = JSON.parse(payload.toString());
  } catch {
    console.warn(`[mqtt] Invalid JSON from device ${deviceCode}`);
    return;
  }

  // Validate with zod
  const result = telemetrySchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      `[mqtt] Validation failed for device ${deviceCode}: ${result.error.message}`
    );
    return;
  }

  const data: TelemetryPayload = result.data;
  const db = getDb();

  // Look up the smart bin by device_code
  const [bin] = await db
    .select()
    .from(smartBins)
    .where(eq(smartBins.deviceCode, deviceCode))
    .limit(1);

  if (!bin) {
    console.warn(`[mqtt] Unknown device_code: ${deviceCode}`);
    return;
  }

  const anomalyFlag = isDistanceAnomalous(data.distance_cm);

  // Insert telemetry record
  await db.insert(binTelemetry).values({
    deviceId: bin.id,
    fillLevelPercent: data.fill_level_percent,
    distanceCm: data.distance_cm,
    batteryVoltage: data.battery_voltage,
    signalStrength: data.signal_strength,
    anomalyFlag,
  });

  // Update last_seen_at on the smart bin
  await db
    .update(smartBins)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(smartBins.id, bin.id));

  // ── Threshold checks & alert creation ────────────────────────────────────

  // 1. Overflow alert: fill level >= bin threshold
  if (data.fill_level_percent >= bin.thresholdPercent) {
    await db.insert(alerts).values({
      subdivisionId: bin.subdivisionId,
      deviceId: bin.id,
      alertType: "overflow",
      severity: data.fill_level_percent >= 95 ? "critical" : "high",
      message: `Bin ${deviceCode} fill level at ${data.fill_level_percent}% (threshold: ${bin.thresholdPercent}%)`,
    });
    console.info(
      `[mqtt] Overflow alert created for ${deviceCode} (${data.fill_level_percent}%)`
    );
  }

  // 2. Low battery alert: voltage below 3.3V
  if (data.battery_voltage < 3.3) {
    await db.insert(alerts).values({
      subdivisionId: bin.subdivisionId,
      deviceId: bin.id,
      alertType: "low_battery",
      severity: data.battery_voltage < 3.0 ? "critical" : "medium",
      message: `Bin ${deviceCode} battery low at ${data.battery_voltage}V`,
    });
    console.info(
      `[mqtt] Low battery alert created for ${deviceCode} (${data.battery_voltage}V)`
    );
  }

  // 3. Sensor anomaly alert: impossible distance readings
  if (anomalyFlag) {
    await db.insert(alerts).values({
      subdivisionId: bin.subdivisionId,
      deviceId: bin.id,
      alertType: "sensor_anomaly",
      severity: "medium",
      message: `Bin ${deviceCode} reported anomalous distance: ${data.distance_cm} cm`,
    });
    console.info(
      `[mqtt] Sensor anomaly alert created for ${deviceCode} (distance: ${data.distance_cm} cm)`
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the MQTT telemetry ingestion service.
 * Connects to the broker, subscribes to the telemetry wildcard topic,
 * and processes incoming messages.
 */
export function start(): void {
  if (client) {
    console.warn("[mqtt] Service is already running");
    return;
  }

  const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
  const username = process.env.MQTT_USERNAME || "ecoroute";
  const password = process.env.MQTT_PASSWORD || "secret";

  client = mqtt.connect(brokerUrl, {
    username,
    password,
    clientId: `ecoroute-backend-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.info(`[mqtt] Connected to broker at ${brokerUrl}`);
    client!.subscribe(TOPIC, { qos: 1 }, (err, granted) => {
      if (err) {
        console.error("[mqtt] Subscription error:", err.message);
        return;
      }
      console.info(
        `[mqtt] Subscribed to ${granted!.map((g) => g.topic).join(", ")}`
      );
    });
  });

  client.on("message", (topic, payload) => {
    handleTelemetryMessage(topic, payload).catch((err) => {
      console.error(`[mqtt] Error processing message on ${topic}:`, err);
    });
  });

  client.on("error", (err) => {
    console.error("[mqtt] Connection error:", err.message);
  });

  client.on("reconnect", () => {
    console.info("[mqtt] Reconnecting to broker...");
  });

  client.on("offline", () => {
    console.warn("[mqtt] Client went offline");
  });
}

/**
 * Gracefully stop the MQTT service.
 * Unsubscribes from topics and closes the connection.
 */
export async function stop(): Promise<void> {
  if (!client) {
    console.warn("[mqtt] Service is not running");
    return;
  }

  return new Promise((resolve, reject) => {
    client!.unsubscribe(TOPIC, (err) => {
      if (err) {
        console.error("[mqtt] Unsubscribe error:", err.message);
      }

      client!.end(false, {}, (endErr) => {
        if (endErr) {
          console.error("[mqtt] Disconnect error:", endErr);
          reject(endErr);
          return;
        }

        console.info("[mqtt] Disconnected from broker");
        client = null;
        resolve();
      });
    });
  });
}
