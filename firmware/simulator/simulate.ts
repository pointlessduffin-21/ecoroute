#!/usr/bin/env bun
/*
 * EcoRoute Firmware Simulator
 *
 * Simulates 7 virtual smart bins (ECO-BIN-1002 through ECO-BIN-1008)
 * sending HTTP telemetry to the backend. ECO-BIN-1001 is excluded because
 * it runs on a physical ESP32 with a real ultrasonic sensor.
 *
 * Usage:
 *   bun run firmware/simulator/simulate.ts
 *   bun run firmware/simulator/simulate.ts --interval 10
 *   bun run firmware/simulator/simulate.ts --once
 *
 * Environment:
 *   API_URL          Backend telemetry endpoint (default: http://localhost:3000/api/v1/device/telemetry)
 *   DEVICE_API_KEY   Device auth key (default: ecoroute-device-key-change-in-production)
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const API_URL = process.env.API_URL ?? "http://localhost:3000/api/v1/device/telemetry";
const API_KEY = process.env.DEVICE_API_KEY ?? "ecoroute-device-key-change-in-production";

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const REPORT_INTERVAL_SEC = parseInt(getArg("interval", "30"));
const ONCE = args.includes("--once");

// ECO-BIN-1001 is the physical ESP32 — skip it in simulation
const PHYSICAL_DEVICE = "ECO-BIN-1001";

// ─── Simulated bin state ─────────────────────────────────────────────────────

interface SimBin {
  deviceCode: string;
  binHeightCm: number;
  fillPercent: number;       // current fill level
  fillRate: number;          // % per report cycle (varies per bin)
  batteryVoltage: number;
  signalStrength: number;
  lastCollected: number;     // timestamp of last "collection"
}

// Predefined bin profiles for realistic, varied behavior
const BIN_PROFILES: Array<{ code: string; height: number; startFill: number; rate: number; rssi: number }> = [
  // ECO-BIN-1001 is physical — not listed here
  { code: "ECO-BIN-1002", height: 100, startFill: 35, rate: 2.5, rssi: -58 },  // moderate area
  { code: "ECO-BIN-1003", height:  90, startFill:  5, rate: 1.0, rssi: -72 },  // quiet residential
  { code: "ECO-BIN-1004", height: 100, startFill: 40, rate: 2.0, rssi: -65 },  // park area
  { code: "ECO-BIN-1005", height: 120, startFill: 68, rate: 4.5, rssi: -55 },  // busy commercial
  { code: "ECO-BIN-1006", height:  80, startFill: 25, rate: 3.0, rssi: -70 },  // school zone
  { code: "ECO-BIN-1007", height: 100, startFill: 38, rate: 2.8, rssi: -62 },  // market street
  { code: "ECO-BIN-1008", height: 110, startFill: 60, rate: 1.5, rssi: -48 },  // near gateway
];

function createBins(): SimBin[] {
  return BIN_PROFILES.map((p) => ({
    deviceCode: p.code,
    binHeightCm: p.height,
    fillPercent: p.startFill + (Math.random() * 10 - 5), // ±5% jitter
    fillRate: p.rate,
    batteryVoltage: 5.0,
    signalStrength: p.rssi,
    lastCollected: Date.now(),
  }));
}

// ─── Simulation logic ────────────────────────────────────────────────────────

function tickBin(bin: SimBin): void {
  // Fill increases each cycle
  bin.fillPercent += bin.fillRate * (0.7 + Math.random() * 0.6);

  // Simulate collection: when fill > 95%, 30% chance of being emptied
  if (bin.fillPercent >= 95 && Math.random() < 0.3) {
    bin.fillPercent = 2 + Math.random() * 8; // emptied to ~2–10%
    bin.lastCollected = Date.now();
    console.log(`  🗑️  ${bin.deviceCode} was collected! Reset to ${bin.fillPercent.toFixed(1)}%`);
  }

  bin.fillPercent = Math.min(100, Math.max(0, bin.fillPercent));

  // Small signal strength jitter
  bin.signalStrength += Math.floor(Math.random() * 7) - 3; // ±3 dBm
  bin.signalStrength = Math.max(-90, Math.min(-40, bin.signalStrength));
}

function buildPayload(bin: SimBin) {
  const distanceCm = bin.binHeightCm * (1 - bin.fillPercent / 100);
  const anomaly = distanceCm < 0 || distanceCm > 300;

  return {
    deviceCode: bin.deviceCode,
    fillLevelPercent: Math.round(bin.fillPercent * 10) / 10,
    distanceCm: Math.round(distanceCm * 10) / 10,
    batteryVoltage: Math.round(bin.batteryVoltage * 100) / 100,
    signalStrength: bin.signalStrength,
    anomalyFlag: anomaly,
  };
}

// ─── HTTP POST ───────────────────────────────────────────────────────────────

async function postTelemetry(payload: ReturnType<typeof buildPayload>): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-API-Key": API_KEY,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err: any) {
    return { ok: false, status: 0, body: err.message };
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function reportAll(bins: SimBin[]): Promise<void> {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n[${ timestamp }] ─── Reporting cycle ───────────────────────`);

  for (const bin of bins) {
    tickBin(bin);
    const payload = buildPayload(bin);
    const { ok, status, body } = await postTelemetry(payload);

    const icon = ok ? "✅" : "❌";
    const alerts = ok ? (() => {
      try { const j = JSON.parse(body); return j.alertsCreated ?? 0; } catch { return "?"; }
    })() : "";
    const alertStr = alerts ? ` (${alerts} alert${alerts === 1 ? "" : "s"})` : "";

    console.log(
      `  ${icon} ${payload.deviceCode}  fill=${payload.fillLevelPercent.toFixed(1).padStart(5)}%  ` +
      `dist=${payload.distanceCm.toFixed(1).padStart(6)}cm  ` +
      `rssi=${payload.signalStrength}dBm  ` +
      `→ ${status}${alertStr}`
    );
  }
}

async function main() {
  const bins = createBins();

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       EcoRoute Firmware Simulator v1.0.0        ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();
  console.log(`  API:       ${API_URL}`);
  console.log(`  API Key:   ${API_KEY.slice(0, 12)}...`);
  console.log(`  Physical:  ${PHYSICAL_DEVICE} (excluded from simulation)`);
  console.log(`  Simulated: ${bins.length} bins (${bins.map(b => b.deviceCode.replace("ECO-BIN-","")).join(", ")})`);
  console.log(`  Interval:  ${REPORT_INTERVAL_SEC}s`);
  console.log(`  Mode:      ${ONCE ? "single report" : "continuous"}`);
  console.log();

  if (ONCE) {
    await reportAll(bins);
    console.log("\nDone (single report mode).");
    return;
  }

  // Continuous mode
  console.log("Press Ctrl+C to stop.\n");
  await reportAll(bins);

  setInterval(async () => {
    await reportAll(bins);
  }, REPORT_INTERVAL_SEC * 1000);
}

main();
