// @ts-nocheck — seed script
/**
 * Historical Telemetry Seeder
 *
 * Generates 60 days of realistic synthetic telemetry data for all active bins.
 * This bootstraps the ML model (LSTM/MLP) with enough training data for
 * meaningful fill-level predictions.
 *
 * Usage:  bun run src/db/seed-historical.ts
 *
 * Characteristics of generated data:
 *   - Fill level follows logistic growth curves (slow start, accelerates near full)
 *   - Weekly cycles: faster fill on weekdays (MWF peak), slower weekends
 *   - Time-of-day: fill increases during 6am-9pm, flat overnight
 *   - Collection events: bin emptied to ~5% when fill reaches threshold (2-3x/week)
 *   - Sensor noise: Gaussian jitter on all readings
 *   - Battery drain: gradual decline over weeks, simulating solar recharge cycles
 *   - Occasional anomalies: ~1% chance of sensor glitch per reading
 *
 * IMPORTANT: This script APPENDS data — it does NOT delete existing telemetry.
 */

import { getDb, closeDb } from "../config/database";
import { smartBins, binTelemetry, alerts } from "./schema";
import { eq } from "drizzle-orm";

// ─── Configuration ──────────────────────────────────────────────────────────

const DAYS_BACK = 60; // How far back to generate data
const READING_INTERVAL_MIN = 30; // One reading every 30 minutes
const BATCH_SIZE = 500; // Insert in batches to avoid memory issues

// ─── Randomness helpers ─────────────────────────────────────────────────────

/** Gaussian random using Box-Muller transform */
function gaussRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** Clamp a value between min and max */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Round to N decimal places */
function round(val: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(val * f) / f;
}

// ─── Bin behavior profiles ──────────────────────────────────────────────────

interface BinProfile {
  /** Average hours from empty to threshold — lower = busier location */
  hoursToFull: number;
  /** Weekday fill multiplier (Mon-Fri) */
  weekdayMultiplier: number;
  /** Weekend fill multiplier (Sat-Sun) */
  weekendMultiplier: number;
  /** Peak hour multiplier (6am-9pm) */
  peakMultiplier: number;
  /** Off-peak multiplier (9pm-6am) */
  offPeakMultiplier: number;
  /** Battery start voltage */
  batteryStart: number;
  /** Daily battery drain (volts) — negative */
  batteryDrainPerDay: number;
  /** Solar recharge amount per day (volts) */
  solarRechargePerDay: number;
  /** Base signal strength (dBm) */
  signalBase: number;
}

/**
 * Assign a profile to each bin based on its device code.
 * High-traffic bins fill faster, low-traffic fill slower.
 */
function getProfile(deviceCode: string, capacityLiters: number): BinProfile {
  // Use device code to deterministically vary behavior
  const hash = deviceCode.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = hash % 4; // 0-3

  const profiles: BinProfile[] = [
    // High traffic (residential entrance, common area)
    {
      hoursToFull: 36,
      weekdayMultiplier: 1.3,
      weekendMultiplier: 0.7,
      peakMultiplier: 1.5,
      offPeakMultiplier: 0.3,
      batteryStart: 4.2,
      batteryDrainPerDay: -0.015,
      solarRechargePerDay: 0.01,
      signalBase: -55,
    },
    // Medium traffic (residential street)
    {
      hoursToFull: 52,
      weekdayMultiplier: 1.1,
      weekendMultiplier: 0.9,
      peakMultiplier: 1.3,
      offPeakMultiplier: 0.5,
      batteryStart: 4.1,
      batteryDrainPerDay: -0.012,
      solarRechargePerDay: 0.008,
      signalBase: -62,
    },
    // Low traffic (back street, less populated area)
    {
      hoursToFull: 72,
      weekdayMultiplier: 1.0,
      weekendMultiplier: 1.0,
      peakMultiplier: 1.2,
      offPeakMultiplier: 0.6,
      batteryStart: 4.0,
      batteryDrainPerDay: -0.01,
      solarRechargePerDay: 0.008,
      signalBase: -70,
    },
    // Very busy (near commercial / market area)
    {
      hoursToFull: 24,
      weekdayMultiplier: 1.4,
      weekendMultiplier: 1.2,
      peakMultiplier: 1.6,
      offPeakMultiplier: 0.4,
      batteryStart: 4.2,
      batteryDrainPerDay: -0.018,
      solarRechargePerDay: 0.012,
      signalBase: -50,
    },
  ];

  return profiles[variant]!;
}

// ─── Generate telemetry for one bin ─────────────────────────────────────────

interface TelemetryRecord {
  deviceId: string;
  fillLevelPercent: number;
  distanceCm: number;
  batteryVoltage: number;
  signalStrength: number;
  anomalyFlag: boolean;
  recordedAt: Date;
}

function generateBinTelemetry(
  binId: string,
  deviceCode: string,
  capacityLiters: number,
  thresholdPercent: number
): TelemetryRecord[] {
  const profile = getProfile(deviceCode, capacityLiters);
  const records: TelemetryRecord[] = [];

  const now = new Date();
  const startTime = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  const totalReadings = (DAYS_BACK * 24 * 60) / READING_INTERVAL_MIN;

  let fillLevel = gaussRandom(8, 3); // Start mostly empty
  fillLevel = clamp(fillLevel, 2, 20);

  let battery = profile.batteryStart;
  let daysSinceStart = 0;

  for (let i = 0; i < totalReadings; i++) {
    const timestamp = new Date(startTime.getTime() + i * READING_INTERVAL_MIN * 60 * 1000);
    const hour = timestamp.getHours();
    const dayOfWeek = timestamp.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPeak = hour >= 6 && hour <= 21;

    // ── Fill level change ──────────────────────────────────────────────

    // Base fill rate: how much % to add per 30-min interval
    const baseFillPerInterval = (thresholdPercent / profile.hoursToFull) * (READING_INTERVAL_MIN / 60);

    // Apply time-of-day and day-of-week multipliers
    let fillRate = baseFillPerInterval;
    fillRate *= isWeekend ? profile.weekendMultiplier : profile.weekdayMultiplier;
    fillRate *= isPeak ? profile.peakMultiplier : profile.offPeakMultiplier;

    // Add Wednesday/Friday spike (garbage day before collection)
    if (dayOfWeek === 3 || dayOfWeek === 5) {
      fillRate *= 1.15;
    }

    // Add Gaussian noise to fill increment
    const fillIncrement = gaussRandom(fillRate, fillRate * 0.25);
    fillLevel += Math.max(0, fillIncrement);

    // ── Collection event (bin emptied) ─────────────────────────────────
    // When fill reaches threshold, simulate a collection event
    if (fillLevel >= thresholdPercent) {
      // Add some randomness to when collection actually happens (0-6 hours delay)
      const delayReadings = Math.floor(Math.random() * 12); // 0-6 hours at 30-min intervals
      if (i % 48 > delayReadings || fillLevel >= 95) {
        // Bin collected! Reset to near-empty
        fillLevel = gaussRandom(5, 2);
        fillLevel = clamp(fillLevel, 2, 12);
      }
    }

    fillLevel = clamp(fillLevel, 0, 100);

    // ── Battery simulation ─────────────────────────────────────────────
    const currentDay = Math.floor(i / (24 * 60 / READING_INTERVAL_MIN));
    if (currentDay > daysSinceStart) {
      daysSinceStart = currentDay;
      // Daily drain + solar recharge
      battery += profile.batteryDrainPerDay + profile.solarRechargePerDay;
      // Occasional full recharge (simulating sunny day)
      if (Math.random() < 0.05) {
        battery = Math.min(battery + 0.1, profile.batteryStart);
      }
    }
    battery = clamp(battery, 2.8, 4.2);
    const batteryWithNoise = clamp(gaussRandom(battery, 0.02), 2.5, 4.3);

    // ── Distance sensor (inverse of fill) ──────────────────────────────
    // If bin is 100cm tall and 100% full → 0cm distance, 0% full → 100cm
    const maxDistance = capacityLiters <= 120 ? 60 : capacityLiters <= 240 ? 80 : 100;
    const distanceCm = maxDistance * (1 - fillLevel / 100);
    const distanceWithNoise = clamp(gaussRandom(distanceCm, 1.5), 0, maxDistance + 10);

    // ── Signal strength ────────────────────────────────────────────────
    const signalWithNoise = Math.round(gaussRandom(profile.signalBase, 4));

    // ── Anomaly flag (~1% chance) ──────────────────────────────────────
    const isAnomaly = Math.random() < 0.01;
    let finalDistance = round(distanceWithNoise, 1);
    if (isAnomaly) {
      // Anomalous reading: random spike
      finalDistance = Math.random() < 0.5 ? round(gaussRandom(350, 30), 1) : round(gaussRandom(-5, 2), 1);
    }

    records.push({
      deviceId: binId,
      fillLevelPercent: round(clamp(fillLevel, 0, 100), 1),
      distanceCm: finalDistance,
      batteryVoltage: round(batteryWithNoise, 2),
      signalStrength: clamp(signalWithNoise, -90, -30),
      anomalyFlag: isAnomaly,
      recordedAt: timestamp,
    });
  }

  return records;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function seedHistorical() {
  const db = getDb();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  EcoRoute Historical Telemetry Seeder");
  console.log(`  Generating ${DAYS_BACK} days of synthetic data`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  // 1. Fetch all active bins
  const bins = await db
    .select({
      id: smartBins.id,
      deviceCode: smartBins.deviceCode,
      capacityLiters: smartBins.capacityLiters,
      thresholdPercent: smartBins.thresholdPercent,
      subdivisionId: smartBins.subdivisionId,
    })
    .from(smartBins)
    .where(eq(smartBins.status, "active"));

  if (bins.length === 0) {
    console.error("No active bins found. Run `bun run db:seed` first.");
    await closeDb();
    process.exit(1);
  }

  console.log(`Found ${bins.length} active bins:`);
  for (const b of bins) {
    console.log(`  - ${b.deviceCode} (${b.capacityLiters}L, threshold: ${b.thresholdPercent}%)`);
  }
  console.log("");

  let totalInserted = 0;

  for (const bin of bins) {
    console.log(`Generating telemetry for ${bin.deviceCode}...`);

    const records = generateBinTelemetry(
      bin.id,
      bin.deviceCode,
      bin.capacityLiters,
      bin.thresholdPercent
    );

    console.log(`  Generated ${records.length} readings (${DAYS_BACK} days × 48/day)`);

    // Insert in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await db.insert(binTelemetry).values(batch);
    }

    totalInserted += records.length;
    console.log(`  Inserted ${records.length} records.`);
  }

  // 2. Generate some historical alerts based on the telemetry pattern
  console.log("");
  console.log("Generating historical alerts...");

  let alertCount = 0;
  for (const bin of bins) {
    // Generate ~2 overflow alerts per week per bin
    const alertsPerWeek = 2;
    const totalAlerts = Math.floor((DAYS_BACK / 7) * alertsPerWeek);

    for (let i = 0; i < totalAlerts; i++) {
      const daysBack = Math.floor(Math.random() * DAYS_BACK);
      const hour = 6 + Math.floor(Math.random() * 15); // 6am-9pm
      const alertTime = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      alertTime.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

      const fillAtAlert = round(gaussRandom(85, 5), 1);

      await db.insert(alerts).values({
        subdivisionId: bin.subdivisionId,
        deviceId: bin.id,
        alertType: "overflow",
        severity: fillAtAlert >= 95 ? "critical" : "high",
        message: `Bin ${bin.deviceCode} fill level at ${fillAtAlert}% (threshold: ${bin.thresholdPercent}%)`,
        isAcknowledged: Math.random() < 0.8, // 80% acknowledged
        createdAt: alertTime,
      });
      alertCount++;
    }

    // Generate ~1 low battery alert per 2 weeks
    const batteryAlerts = Math.floor(DAYS_BACK / 14);
    for (let i = 0; i < batteryAlerts; i++) {
      const daysBack = Math.floor(Math.random() * DAYS_BACK);
      const alertTime = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const voltage = round(gaussRandom(3.1, 0.15), 1);

      await db.insert(alerts).values({
        subdivisionId: bin.subdivisionId,
        deviceId: bin.id,
        alertType: "low_battery",
        severity: voltage < 3.0 ? "critical" : "medium",
        message: `Bin ${bin.deviceCode} battery low at ${voltage}V`,
        isAcknowledged: Math.random() < 0.9,
        createdAt: alertTime,
      });
      alertCount++;
    }
  }

  console.log(`  Inserted ${alertCount} historical alerts.`);

  // 3. Summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  DONE!");
  console.log(`  Total telemetry records: ${totalInserted.toLocaleString()}`);
  console.log(`  Total historical alerts: ${alertCount}`);
  console.log(`  Per-bin readings:        ~${Math.round(totalInserted / bins.length).toLocaleString()}`);
  console.log(`  Date range:              ${DAYS_BACK} days back → now`);
  console.log(`  Reading interval:        ${READING_INTERVAL_MIN} min`);
  console.log("");
  console.log("  You can now train the ML model:");
  console.log("    curl -X POST http://localhost:8000/train");
  console.log("═══════════════════════════════════════════════════════");

  await closeDb();
}

seedHistorical().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
