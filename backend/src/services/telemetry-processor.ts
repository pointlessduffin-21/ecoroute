import { z } from "zod";
import { getDb } from "../config/database";
import { smartBins, binTelemetry, alerts } from "../db/schema";
import { eq } from "drizzle-orm";
import { eventBus } from "./event-bus";

// ─── Shared validation schema for device telemetry ──────────────────────────

export const deviceTelemetrySchema = z.object({
  deviceCode: z.string().min(1).max(100),
  fillLevelPercent: z.number().min(0).max(100),
  distanceCm: z.number(),
  batteryVoltage: z.number().nonnegative(),
  signalStrength: z.number().int(),
  anomalyFlag: z.boolean().optional(),
});

export type DeviceTelemetryPayload = z.infer<typeof deviceTelemetrySchema>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determine whether the incoming distance_cm value is anomalous.
 * Negative values or readings greater than 300 cm are considered sensor anomalies.
 */
export function isDistanceAnomalous(distanceCm: number): boolean {
  return distanceCm < 0 || distanceCm > 300;
}

// ─── Processing result ──────────────────────────────────────────────────────

export interface ProcessingResult {
  success: boolean;
  telemetryId?: number;
  alertsCreated: string[];
  error?: string;
}

// ─── Core processing logic ──────────────────────────────────────────────────

/**
 * Process a telemetry reading from a device. Shared by both MQTT and HTTP ingestion paths.
 *
 * 1. Looks up the smart bin by device_code
 * 2. Inserts telemetry record
 * 3. Updates last_seen_at on the smart bin
 * 4. Evaluates thresholds and creates alerts (overflow, low_battery, sensor_anomaly)
 */
export async function processTelemetry(
  deviceCode: string,
  data: {
    fillLevelPercent: number;
    distanceCm: number;
    batteryVoltage: number;
    signalStrength: number;
    anomalyFlag?: boolean;
  }
): Promise<ProcessingResult> {
  const db = getDb();
  const alertsCreated: string[] = [];

  // Look up the smart bin by device_code
  const [bin] = await db
    .select()
    .from(smartBins)
    .where(eq(smartBins.deviceCode, deviceCode))
    .limit(1);

  if (!bin) {
    return { success: false, alertsCreated: [], error: `Unknown device_code: ${deviceCode}` };
  }

  const anomalyFlag = data.anomalyFlag ?? isDistanceAnomalous(data.distanceCm);

  // Insert telemetry record
  const [created] = await db
    .insert(binTelemetry)
    .values({
      deviceId: bin.id,
      fillLevelPercent: data.fillLevelPercent,
      distanceCm: data.distanceCm,
      batteryVoltage: data.batteryVoltage,
      signalStrength: data.signalStrength,
      anomalyFlag,
    })
    .returning();

  // Update last_seen_at on the smart bin
  await db
    .update(smartBins)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(smartBins.id, bin.id));

  // ── Threshold checks & alert creation ──────────────────────────────────

  // 1. Overflow alert: fill level >= bin threshold
  if (data.fillLevelPercent >= bin.thresholdPercent) {
    await db.insert(alerts).values({
      subdivisionId: bin.subdivisionId,
      deviceId: bin.id,
      alertType: "overflow",
      severity: data.fillLevelPercent >= 95 ? "critical" : "high",
      message: `Bin ${deviceCode} fill level at ${data.fillLevelPercent}% (threshold: ${bin.thresholdPercent}%)`,
    });
    alertsCreated.push("overflow");
    console.info(`[telemetry] Overflow alert created for ${deviceCode} (${data.fillLevelPercent}%)`);
  }

  // 2. Low battery alert: voltage below 3.3V
  if (data.batteryVoltage < 3.3) {
    await db.insert(alerts).values({
      subdivisionId: bin.subdivisionId,
      deviceId: bin.id,
      alertType: "low_battery",
      severity: data.batteryVoltage < 3.0 ? "critical" : "medium",
      message: `Bin ${deviceCode} battery low at ${data.batteryVoltage}V`,
    });
    alertsCreated.push("low_battery");
    console.info(`[telemetry] Low battery alert created for ${deviceCode} (${data.batteryVoltage}V)`);
  }

  // 3. Sensor anomaly alert: impossible distance readings
  if (anomalyFlag) {
    await db.insert(alerts).values({
      subdivisionId: bin.subdivisionId,
      deviceId: bin.id,
      alertType: "sensor_anomaly",
      severity: "medium",
      message: `Bin ${deviceCode} reported anomalous distance: ${data.distanceCm} cm`,
    });
    alertsCreated.push("sensor_anomaly");
    console.info(`[telemetry] Sensor anomaly alert created for ${deviceCode} (distance: ${data.distanceCm} cm)`);
  }

  // Emit real-time events
  eventBus.emit("sse", {
    type: "telemetry",
    data: {
      deviceId: bin.id,
      deviceCode,
      fillLevelPercent: data.fillLevelPercent,
      batteryVoltage: data.batteryVoltage,
      signalStrength: data.signalStrength,
      recordedAt: new Date().toISOString(),
    },
  });

  for (const alertType of alertsCreated) {
    eventBus.emit("sse", {
      type: "alert",
      data: {
        deviceId: bin.id,
        deviceCode,
        alertType,
        message: `Bin ${deviceCode}: ${alertType}`,
        createdAt: new Date().toISOString(),
      },
    });
  }

  return { success: true, telemetryId: created.id, alertsCreated };
}
