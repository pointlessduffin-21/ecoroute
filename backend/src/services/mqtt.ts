import mqtt from "mqtt";
import { z } from "zod";
import { processTelemetry } from "./telemetry-processor";

// ─── MQTT telemetry payload schema (snake_case from IoT devices) ────────────

const telemetrySchema = z.object({
  fill_level_percent: z.number().min(0).max(100),
  distance_cm: z.number(),
  battery_voltage: z.number().nonnegative(),
  signal_strength: z.number().int(),
});

// ─── Module state ────────────────────────────────────────────────────────────

const TOPIC = "ecoroute/trash_can/+";

let client: mqtt.MqttClient | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the device_code from a topic string.
 * Topic format: ecoroute/trash_can/<device_code>
 */
function extractDeviceCode(topic: string): string | null {
  const segments = topic.split("/");
  if (segments.length === 3 && segments[0] === "ecoroute" && segments[1] === "trash_can") {
    return segments[2] ?? null;
  }
  return null;
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

  const data = result.data;

  // Delegate to shared telemetry processor
  const processingResult = await processTelemetry(deviceCode, {
    fillLevelPercent: data.fill_level_percent,
    distanceCm: data.distance_cm,
    batteryVoltage: data.battery_voltage,
    signalStrength: data.signal_strength,
  });

  if (!processingResult.success) {
    console.warn(`[mqtt] ${processingResult.error}`);
    return;
  }

  if (processingResult.alertsCreated.length > 0) {
    console.info(
      `[mqtt] Telemetry processed for ${deviceCode}, alerts: ${processingResult.alertsCreated.join(", ")}`
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

  const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://109.123.238.215:1883";
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
