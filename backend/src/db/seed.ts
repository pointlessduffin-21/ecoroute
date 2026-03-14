// @ts-nocheck — seed script; all array accesses are safe since we just inserted the data
import { getDb, closeDb } from "../config/database";
import {
  subdivisions,
  users,
  smartBins,
  binTelemetry,
  alerts,
  collectionRoutes,
  routeStops,
  serviceEvents,
  notifications,
  systemConfig,
  fillPredictions,
  auditLogs,
} from "./schema";
import { hashPassword } from "../utils/password";

function must<T>(val: T | undefined, label = "value"): T {
  if (val === undefined) throw new Error(`Seed error: ${label} is undefined`);
  return val;
}

async function seed() {
  const db = getDb();

  console.log("--- EcoRoute Database Seed ---");
  console.log("");

  // ── Clear tables in reverse FK order ────────────────────────────────────────
  console.log("Clearing existing data...");
  await db.delete(systemConfig);
  await db.delete(notifications);
  await db.delete(auditLogs);
  await db.delete(serviceEvents);
  await db.delete(routeStops);
  await db.delete(collectionRoutes);
  await db.delete(alerts);
  await db.delete(fillPredictions);
  await db.delete(binTelemetry);
  await db.delete(smartBins);
  await db.delete(users);
  await db.delete(subdivisions);
  console.log("  All tables cleared.");
  console.log("");

  // ── Helper: generate timestamps relative to now ─────────────────────────────
  const now = new Date();
  function hoursAgo(h: number): Date {
    return new Date(now.getTime() - h * 60 * 60 * 1000);
  }
  function daysAgo(d: number): Date {
    return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  }
  function hoursFromNow(h: number): Date {
    return new Date(now.getTime() + h * 60 * 60 * 1000);
  }

  // ── 1. Subdivisions ─────────────────────────────────────────────────────────
  console.log("1. Inserting subdivisions...");
  const insertedSubdivisions = await db
    .insert(subdivisions)
    .values([
      {
        name: "Greenfield Estate",
        code: "GFE",
        address: "Barangay Lahug, Cebu City, Cebu 6000",
        contactEmail: "hoa@greenfieldestate.ph",
        contactPhone: "+63-32-123-4567",
        isActive: true,
        geofence: JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [123.883, 10.318],
              [123.889, 10.318],
              [123.889, 10.313],
              [123.883, 10.313],
              [123.883, 10.318],
            ],
          ],
        }),
      },
      {
        name: "Maple Heights",
        code: "MPH",
        address: "Barangay Subangdaku, Mandaue City, Cebu 6014",
        contactEmail: "admin@mapleheights.ph",
        contactPhone: "+63-32-765-4321",
        isActive: true,
        geofence: JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [123.928, 10.335],
              [123.935, 10.335],
              [123.935, 10.329],
              [123.928, 10.329],
              [123.928, 10.335],
            ],
          ],
        }),
      },
    ])
    .returning();

  const gfe = must(insertedSubdivisions[0], "gfe");
  const mph = must(insertedSubdivisions[1], "mph");
  console.log(`  Inserted ${insertedSubdivisions.length} subdivisions.`);
  console.log(`    - ${gfe.name} (${gfe.id})`);
  console.log(`    - ${mph.name} (${mph.id})`);
  console.log("");

  // ── 2. Users ────────────────────────────────────────────────────────────────
  console.log("2. Inserting users...");
  const defaultPwHash = await hashPassword("password123");
  const insertedUsers = await db
    .insert(users)
    .values([
      {
        email: "admin@ecoroute.io",
        fullName: "Sarah Johnson",
        role: "admin" as const,
        phone: "+63-917-111-0001",
        isActive: true,
        subdivisionId: gfe.id,
        passwordHash: defaultPwHash,
      },
      {
        email: "mike.dispatcher@ecoroute.io",
        fullName: "Mike Chen",
        role: "dispatcher" as const,
        phone: "+63-917-222-0002",
        isActive: true,
        subdivisionId: gfe.id,
        passwordHash: defaultPwHash,
      },
      {
        email: "juan.driver@ecoroute.io",
        fullName: "Juan dela Cruz",
        role: "driver" as const,
        phone: "+63-917-333-0003",
        isActive: true,
        subdivisionId: gfe.id,
        passwordHash: defaultPwHash,
      },
      {
        email: "maria.driver@ecoroute.io",
        fullName: "Maria Santos",
        role: "driver" as const,
        phone: "+63-917-444-0004",
        isActive: true,
        subdivisionId: mph.id,
        passwordHash: defaultPwHash,
      },
      {
        email: "jane.dispatcher@ecoroute.io",
        fullName: "Jane Cooper",
        role: "dispatcher" as const,
        phone: "+63-917-555-0005",
        isActive: false,
        subdivisionId: mph.id,
        passwordHash: defaultPwHash,
      },
    ])
    .returning();

  const adminUser = must(insertedUsers[0], "adminUser");
  const dispatcherMike = must(insertedUsers[1], "dispatcherMike");
  const driverJuan = must(insertedUsers[2], "driverJuan");
  const driverMaria = must(insertedUsers[3], "driverMaria");
  const dispatcherJane = must(insertedUsers[4], "dispatcherJane");

  console.log(`  Inserted ${insertedUsers.length} users.`);
  for (const u of insertedUsers) {
    console.log(`    - ${u.fullName} (${u.role}, ${u.isActive ? "active" : "inactive"})`);
  }
  console.log("");

  // ── 3. Smart Bins ───────────────────────────────────────────────────────────
  console.log("3. Inserting smart bins...");
  const insertedBins = await db
    .insert(smartBins)
    .values([
      {
        subdivisionId: gfe.id,
        deviceCode: "ECO-BIN-1001",
        imei: "356938035643801",
        latitude: 10.3160,
        longitude: 123.8845,
        capacityLiters: 240,
        thresholdPercent: 80,
        status: "active" as const,
        installDate: daysAgo(90),
        lastSeenAt: hoursAgo(1),
        firmwareVersion: "v2.1.0",
      },
      {
        subdivisionId: gfe.id,
        deviceCode: "ECO-BIN-1002",
        imei: "356938035643802",
        latitude: 10.3155,
        longitude: 123.8852,
        capacityLiters: 120,
        thresholdPercent: 80,
        status: "active" as const,
        installDate: daysAgo(85),
        lastSeenAt: hoursAgo(2),
        firmwareVersion: "v2.1.0",
      },
      {
        subdivisionId: gfe.id,
        deviceCode: "ECO-BIN-1003",
        imei: "356938035643803",
        latitude: 10.3148,
        longitude: 123.8860,
        capacityLiters: 360,
        thresholdPercent: 85,
        status: "active" as const,
        installDate: daysAgo(60),
        lastSeenAt: hoursAgo(1),
        firmwareVersion: "v2.2.0",
      },
      {
        subdivisionId: gfe.id,
        deviceCode: "ECO-BIN-1004",
        imei: "356938035643804",
        latitude: 10.3163,
        longitude: 123.8838,
        capacityLiters: 240,
        thresholdPercent: 80,
        status: "maintenance" as const,
        installDate: daysAgo(120),
        lastSeenAt: daysAgo(3),
        firmwareVersion: "v2.0.1",
      },
      {
        subdivisionId: mph.id,
        deviceCode: "ECO-BIN-1005",
        imei: "356938035643805",
        latitude: 10.3340,
        longitude: 123.9300,
        capacityLiters: 240,
        thresholdPercent: 80,
        status: "active" as const,
        installDate: daysAgo(45),
        lastSeenAt: hoursAgo(1),
        firmwareVersion: "v2.2.0",
      },
      {
        subdivisionId: mph.id,
        deviceCode: "ECO-BIN-1006",
        imei: "356938035643806",
        latitude: 10.3332,
        longitude: 123.9310,
        capacityLiters: 120,
        thresholdPercent: 80,
        status: "active" as const,
        installDate: daysAgo(45),
        lastSeenAt: hoursAgo(3),
        firmwareVersion: "v2.2.0",
      },
      {
        subdivisionId: mph.id,
        deviceCode: "ECO-BIN-1007",
        imei: "356938035643807",
        latitude: 10.3337,
        longitude: 123.9295,
        capacityLiters: 360,
        thresholdPercent: 85,
        status: "active" as const,
        installDate: daysAgo(30),
        lastSeenAt: hoursAgo(2),
        firmwareVersion: "v2.2.0",
      },
      {
        subdivisionId: mph.id,
        deviceCode: "ECO-BIN-1008",
        imei: "356938035643808",
        latitude: 10.3345,
        longitude: 123.9285,
        capacityLiters: 120,
        thresholdPercent: 80,
        status: "offline" as const,
        installDate: daysAgo(100),
        lastSeenAt: daysAgo(7),
        firmwareVersion: "v1.9.5",
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedBins.length} smart bins.`);
  for (const b of insertedBins) {
    console.log(`    - ${b.deviceCode} (${b.capacityLiters}L, ${b.status})`);
  }
  console.log("");

  // ── 4. Bin Telemetry (~40 records, 5 per bin) ──────────────────────────────
  console.log("4. Inserting bin telemetry...");

  // Define fill-level profiles for each bin:
  // Bins 1001, 1005 => near-full (>85%)
  // Bins 1002, 1006, 1007 => mid-range (40-70%)
  // Bins 1003 => empty (<20%)
  // Bins 1004 => maintenance, mid fill
  // Bins 1008 => offline, stale data
  const fillProfiles: Record<string, number[]> = {
    "ECO-BIN-1001": [72, 78, 84, 89, 93],
    "ECO-BIN-1002": [35, 42, 48, 55, 60],
    "ECO-BIN-1003": [5, 8, 10, 14, 18],
    "ECO-BIN-1004": [40, 44, 47, 50, 53],
    "ECO-BIN-1005": [68, 74, 80, 86, 91],
    "ECO-BIN-1006": [25, 32, 40, 48, 55],
    "ECO-BIN-1007": [38, 45, 52, 58, 65],
    "ECO-BIN-1008": [60, 62, 64, 65, 66],
  };

  const batteryProfiles: Record<string, number[]> = {
    "ECO-BIN-1001": [4.1, 4.0, 3.9, 3.9, 3.8],
    "ECO-BIN-1002": [3.7, 3.6, 3.6, 3.5, 3.5],
    "ECO-BIN-1003": [4.2, 4.1, 4.1, 4.0, 4.0],
    "ECO-BIN-1004": [3.0, 2.9, 2.9, 2.8, 2.8],
    "ECO-BIN-1005": [3.9, 3.8, 3.8, 3.7, 3.7],
    "ECO-BIN-1006": [3.5, 3.4, 3.4, 3.3, 3.3],
    "ECO-BIN-1007": [4.0, 3.9, 3.9, 3.8, 3.8],
    "ECO-BIN-1008": [3.2, 3.1, 3.0, 2.9, 2.9],
  };

  const signalProfiles: Record<string, number[]> = {
    "ECO-BIN-1001": [-62, -65, -63, -68, -60],
    "ECO-BIN-1002": [-70, -72, -75, -71, -69],
    "ECO-BIN-1003": [-65, -67, -64, -66, -63],
    "ECO-BIN-1004": [-80, -82, -85, -88, -90],
    "ECO-BIN-1005": [-60, -63, -62, -65, -61],
    "ECO-BIN-1006": [-73, -76, -74, -78, -72],
    "ECO-BIN-1007": [-68, -70, -67, -71, -66],
    "ECO-BIN-1008": [-88, -90, -92, -95, -93],
  };

  const telemetryValues: {
    deviceId: string;
    fillLevelPercent: number;
    distanceCm: number;
    batteryVoltage: number;
    signalStrength: number;
    anomalyFlag: boolean;
    recordedAt: Date;
  }[] = [];

  for (const bin of insertedBins) {
    const fills = fillProfiles[bin.deviceCode];
    const batts = batteryProfiles[bin.deviceCode];
    const sigs = signalProfiles[bin.deviceCode];

    for (let i = 0; i < 5; i++) {
      // Spread readings over the past 24 hours (roughly every ~5 hours)
      const recordTime = hoursAgo(24 - i * 5);
      const fillPct = fills[i];
      // distanceCm is inversely related to fill level (e.g., 120L bin is ~80cm tall)
      const maxHeightCm = bin.capacityLiters === 120 ? 80 : bin.capacityLiters === 240 ? 100 : 120;
      const distanceCm = maxHeightCm * (1 - fillPct / 100);

      telemetryValues.push({
        deviceId: bin.id,
        fillLevelPercent: fillPct,
        distanceCm: parseFloat(distanceCm.toFixed(1)),
        batteryVoltage: batts[i],
        signalStrength: sigs[i],
        anomalyFlag: bin.deviceCode === "ECO-BIN-1004" && i === 4, // one anomaly on maintenance bin
        recordedAt: recordTime,
      });
    }
  }

  await db.insert(binTelemetry).values(telemetryValues);
  console.log(`  Inserted ${telemetryValues.length} telemetry records.`);
  console.log("");

  // ── 5. Alerts ───────────────────────────────────────────────────────────────
  console.log("5. Inserting alerts...");
  const insertedAlerts = await db
    .insert(alerts)
    .values([
      {
        subdivisionId: gfe.id,
        deviceId: insertedBins[0].id, // ECO-BIN-1001, near-full
        alertType: "overflow" as const,
        severity: "high" as const,
        message: "Bin ECO-BIN-1001 has reached 93% fill level, exceeding the 80% threshold.",
        isAcknowledged: false,
        createdAt: hoursAgo(1),
      },
      {
        subdivisionId: gfe.id,
        deviceId: insertedBins[3].id, // ECO-BIN-1004, maintenance
        alertType: "low_battery" as const,
        severity: "critical" as const,
        message: "Bin ECO-BIN-1004 battery voltage dropped to 2.8V. Immediate replacement required.",
        isAcknowledged: true,
        acknowledgedBy: adminUser.id,
        acknowledgedAt: hoursAgo(2),
        createdAt: hoursAgo(6),
      },
      {
        subdivisionId: gfe.id,
        deviceId: insertedBins[3].id, // ECO-BIN-1004, maintenance
        alertType: "sensor_anomaly" as const,
        severity: "medium" as const,
        message: "Anomalous sensor reading detected on ECO-BIN-1004. Fill level data may be unreliable.",
        isAcknowledged: false,
        createdAt: hoursAgo(3),
      },
      {
        subdivisionId: mph.id,
        deviceId: insertedBins[7].id, // ECO-BIN-1008, offline
        alertType: "offline" as const,
        severity: "high" as const,
        message: "Bin ECO-BIN-1008 has been offline for 7 days. Check device connectivity.",
        isAcknowledged: false,
        createdAt: daysAgo(6),
      },
      {
        subdivisionId: mph.id,
        deviceId: insertedBins[4].id, // ECO-BIN-1005, near-full
        alertType: "overflow" as const,
        severity: "high" as const,
        message: "Bin ECO-BIN-1005 has reached 91% fill level, exceeding the 80% threshold.",
        isAcknowledged: false,
        createdAt: hoursAgo(2),
      },
      {
        subdivisionId: gfe.id,
        deviceId: insertedBins[1].id, // ECO-BIN-1002
        alertType: "low_battery" as const,
        severity: "medium" as const,
        message: "Bin ECO-BIN-1002 battery at 3.5V. Schedule replacement within the next week.",
        isAcknowledged: true,
        acknowledgedBy: dispatcherMike.id,
        acknowledgedAt: hoursAgo(10),
        createdAt: daysAgo(1),
      },
      {
        subdivisionId: mph.id,
        deviceId: insertedBins[7].id, // ECO-BIN-1008, offline
        alertType: "low_battery" as const,
        severity: "critical" as const,
        message: "Bin ECO-BIN-1008 last reported battery at 2.9V before going offline.",
        isAcknowledged: true,
        acknowledgedBy: adminUser.id,
        acknowledgedAt: daysAgo(5),
        createdAt: daysAgo(7),
      },
      {
        subdivisionId: mph.id,
        deviceId: insertedBins[6].id, // ECO-BIN-1007
        alertType: "sensor_anomaly" as const,
        severity: "low" as const,
        message: "Minor fluctuation detected in ECO-BIN-1007 ultrasonic sensor. Monitoring.",
        isAcknowledged: false,
        createdAt: hoursAgo(12),
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedAlerts.length} alerts.`);
  for (const a of insertedAlerts) {
    console.log(
      `    - [${a.severity}] ${a.alertType}: ${a.isAcknowledged ? "acknowledged" : "pending"}`
    );
  }
  console.log("");

  // ── 6. Collection Routes ────────────────────────────────────────────────────
  console.log("6. Inserting collection routes...");
  const insertedRoutes = await db
    .insert(collectionRoutes)
    .values([
      {
        // Route 1: Completed yesterday (GFE, Juan)
        subdivisionId: gfe.id,
        status: "completed" as const,
        optimizationScore: 87.5,
        estimatedDistanceKm: 4.2,
        estimatedDurationMinutes: 45,
        assignedDriverId: driverJuan.id,
        assignedVehicleId: "TRK-001",
        scheduledDate: daysAgo(1),
        startedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000), // 6am yesterday
        completedAt: new Date(daysAgo(1).getTime() + 7 * 60 * 60 * 1000), // 7am yesterday
      },
      {
        // Route 2: Completed 2 days ago (MPH, Maria)
        subdivisionId: mph.id,
        status: "completed" as const,
        optimizationScore: 92.1,
        estimatedDistanceKm: 3.8,
        estimatedDurationMinutes: 40,
        assignedDriverId: driverMaria.id,
        assignedVehicleId: "TRK-002",
        scheduledDate: daysAgo(2),
        startedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000),
        completedAt: new Date(daysAgo(2).getTime() + 8 * 60 * 60 * 1000),
      },
      {
        // Route 3: In progress now (GFE, Juan)
        subdivisionId: gfe.id,
        status: "in_progress" as const,
        optimizationScore: 85.0,
        estimatedDistanceKm: 5.1,
        estimatedDurationMinutes: 55,
        assignedDriverId: driverJuan.id,
        assignedVehicleId: "TRK-001",
        scheduledDate: now,
        startedAt: hoursAgo(1),
        completedAt: null,
      },
      {
        // Route 4: Planned for tomorrow (MPH, Maria)
        subdivisionId: mph.id,
        status: "planned" as const,
        optimizationScore: 88.3,
        estimatedDistanceKm: 4.5,
        estimatedDurationMinutes: 50,
        assignedDriverId: driverMaria.id,
        assignedVehicleId: "TRK-002",
        scheduledDate: hoursFromNow(24),
        startedAt: null,
        completedAt: null,
      },
      {
        // Route 5: Cancelled (GFE, was for Juan)
        subdivisionId: gfe.id,
        status: "cancelled" as const,
        optimizationScore: null,
        estimatedDistanceKm: 3.5,
        estimatedDurationMinutes: 35,
        assignedDriverId: driverJuan.id,
        assignedVehicleId: "TRK-001",
        scheduledDate: daysAgo(3),
        startedAt: null,
        completedAt: null,
      },
    ])
    .returning();

  const route1 = must(insertedRoutes[0], "route1");
  const route2 = must(insertedRoutes[1], "route2");
  const route3 = must(insertedRoutes[2], "route3");
  const route4 = must(insertedRoutes[3], "route4");
  const route5 = must(insertedRoutes[4], "route5");

  console.log(`  Inserted ${insertedRoutes.length} collection routes.`);
  for (const r of insertedRoutes) {
    console.log(`    - Route ${r.id.slice(0, 8)}... (${r.status})`);
  }
  console.log("");

  // ── 7. Route Stops ──────────────────────────────────────────────────────────
  console.log("7. Inserting route stops...");
  const insertedStops = await db
    .insert(routeStops)
    .values([
      // Route 1 (completed, GFE) - 4 stops, all serviced
      {
        routeId: route1.id,
        deviceId: insertedBins[0].id, // ECO-BIN-1001
        sequenceOrder: 1,
        status: "serviced" as const,
        arrivedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 5 * 60 * 1000),
        servicedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 10 * 60 * 1000),
        notes: "Bin was nearly full. Emptied completely.",
      },
      {
        routeId: route1.id,
        deviceId: insertedBins[1].id, // ECO-BIN-1002
        sequenceOrder: 2,
        status: "serviced" as const,
        arrivedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 18 * 60 * 1000),
        servicedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 22 * 60 * 1000),
        notes: null,
      },
      {
        routeId: route1.id,
        deviceId: insertedBins[2].id, // ECO-BIN-1003
        sequenceOrder: 3,
        status: "serviced" as const,
        arrivedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 30 * 60 * 1000),
        servicedAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 35 * 60 * 1000),
        notes: "Low fill level but serviced as part of route.",
      },
      {
        routeId: route1.id,
        deviceId: insertedBins[3].id, // ECO-BIN-1004
        sequenceOrder: 4,
        status: "skipped" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: "Skipped - bin under maintenance, sensor issue reported.",
      },

      // Route 2 (completed, MPH) - 4 stops, all serviced
      {
        routeId: route2.id,
        deviceId: insertedBins[4].id, // ECO-BIN-1005
        sequenceOrder: 1,
        status: "serviced" as const,
        arrivedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 5 * 60 * 1000),
        servicedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 12 * 60 * 1000),
        notes: null,
      },
      {
        routeId: route2.id,
        deviceId: insertedBins[5].id, // ECO-BIN-1006
        sequenceOrder: 2,
        status: "serviced" as const,
        arrivedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 20 * 60 * 1000),
        servicedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 25 * 60 * 1000),
        notes: null,
      },
      {
        routeId: route2.id,
        deviceId: insertedBins[6].id, // ECO-BIN-1007
        sequenceOrder: 3,
        status: "serviced" as const,
        arrivedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 33 * 60 * 1000),
        servicedAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 38 * 60 * 1000),
        notes: "Moderate fill. Routine collection.",
      },
      {
        routeId: route2.id,
        deviceId: insertedBins[7].id, // ECO-BIN-1008
        sequenceOrder: 4,
        status: "skipped" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: "Skipped - bin offline, could not confirm status.",
      },

      // Route 3 (in_progress, GFE) - 4 stops, mixed statuses
      {
        routeId: route3.id,
        deviceId: insertedBins[0].id, // ECO-BIN-1001
        sequenceOrder: 1,
        status: "serviced" as const,
        arrivedAt: hoursAgo(1),
        servicedAt: new Date(hoursAgo(1).getTime() + 8 * 60 * 1000),
        notes: "First stop completed.",
      },
      {
        routeId: route3.id,
        deviceId: insertedBins[1].id, // ECO-BIN-1002
        sequenceOrder: 2,
        status: "arrived" as const,
        arrivedAt: new Date(hoursAgo(1).getTime() + 20 * 60 * 1000),
        servicedAt: null,
        notes: "Driver currently at this stop.",
      },
      {
        routeId: route3.id,
        deviceId: insertedBins[2].id, // ECO-BIN-1003
        sequenceOrder: 3,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: null,
      },
      {
        routeId: route3.id,
        deviceId: insertedBins[3].id, // ECO-BIN-1004
        sequenceOrder: 4,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: null,
      },

      // Route 4 (planned, MPH) - 4 stops, all pending
      {
        routeId: route4.id,
        deviceId: insertedBins[4].id, // ECO-BIN-1005
        sequenceOrder: 1,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: null,
      },
      {
        routeId: route4.id,
        deviceId: insertedBins[5].id, // ECO-BIN-1006
        sequenceOrder: 2,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: null,
      },
      {
        routeId: route4.id,
        deviceId: insertedBins[6].id, // ECO-BIN-1007
        sequenceOrder: 3,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: null,
      },
      {
        routeId: route4.id,
        deviceId: insertedBins[7].id, // ECO-BIN-1008
        sequenceOrder: 4,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: null,
      },

      // Route 5 (cancelled, GFE) - 2 stops that were planned
      {
        routeId: route5.id,
        deviceId: insertedBins[0].id, // ECO-BIN-1001
        sequenceOrder: 1,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: "Route was cancelled due to vehicle breakdown.",
      },
      {
        routeId: route5.id,
        deviceId: insertedBins[2].id, // ECO-BIN-1003
        sequenceOrder: 2,
        status: "pending" as const,
        arrivedAt: null,
        servicedAt: null,
        notes: "Route was cancelled due to vehicle breakdown.",
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedStops.length} route stops.`);
  console.log(
    `    - Route 1 (completed): ${insertedStops.filter((s) => s.routeId === route1.id).length} stops`
  );
  console.log(
    `    - Route 2 (completed): ${insertedStops.filter((s) => s.routeId === route2.id).length} stops`
  );
  console.log(
    `    - Route 3 (in_progress): ${insertedStops.filter((s) => s.routeId === route3.id).length} stops`
  );
  console.log(
    `    - Route 4 (planned): ${insertedStops.filter((s) => s.routeId === route4.id).length} stops`
  );
  console.log(
    `    - Route 5 (cancelled): ${insertedStops.filter((s) => s.routeId === route5.id).length} stops`
  );
  console.log("");

  // ── 8. Service Events ───────────────────────────────────────────────────────
  console.log("8. Inserting service events...");
  const insertedEvents = await db
    .insert(serviceEvents)
    .values([
      {
        deviceId: insertedBins[0].id, // ECO-BIN-1001
        driverId: driverJuan.id,
        routeId: route1.id,
        eventType: "collection",
        latitude: 10.3160,
        longitude: 123.8845,
        evidenceUrl: "https://storage.ecoroute.io/evidence/route1-stop1-20260211.jpg",
        notes: "Bin emptied successfully. Area clean.",
        createdAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 10 * 60 * 1000),
      },
      {
        deviceId: insertedBins[1].id, // ECO-BIN-1002
        driverId: driverJuan.id,
        routeId: route1.id,
        eventType: "collection",
        latitude: 10.3155,
        longitude: 123.8852,
        evidenceUrl: "https://storage.ecoroute.io/evidence/route1-stop2-20260211.jpg",
        notes: "Regular collection. No issues.",
        createdAt: new Date(daysAgo(1).getTime() + 6 * 60 * 60 * 1000 + 22 * 60 * 1000),
      },
      {
        deviceId: insertedBins[4].id, // ECO-BIN-1005
        driverId: driverMaria.id,
        routeId: route2.id,
        eventType: "collection",
        latitude: 10.3340,
        longitude: 123.9300,
        evidenceUrl: "https://storage.ecoroute.io/evidence/route2-stop1-20260210.jpg",
        notes: "Collected. Bin was overflowing slightly.",
        createdAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 12 * 60 * 1000),
      },
      {
        deviceId: insertedBins[5].id, // ECO-BIN-1006
        driverId: driverMaria.id,
        routeId: route2.id,
        eventType: "collection",
        latitude: 10.3332,
        longitude: 123.9310,
        evidenceUrl: null,
        notes: "Standard pickup. Photo not taken due to camera issue.",
        createdAt: new Date(daysAgo(2).getTime() + 7 * 60 * 60 * 1000 + 25 * 60 * 1000),
      },
      {
        deviceId: insertedBins[0].id, // ECO-BIN-1001
        driverId: driverJuan.id,
        routeId: route3.id,
        eventType: "collection",
        latitude: 10.3160,
        longitude: 123.8845,
        evidenceUrl: "https://storage.ecoroute.io/evidence/route3-stop1-20260212.jpg",
        notes: "Bin was 93% full. Emptied on current route.",
        createdAt: new Date(hoursAgo(1).getTime() + 8 * 60 * 1000),
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedEvents.length} service events.`);
  for (const e of insertedEvents) {
    console.log(`    - ${e.eventType} on bin ${e.deviceId.slice(0, 8)}... by driver ${e.driverId.slice(0, 8)}...`);
  }
  console.log("");

  // ── 9. Notifications ────────────────────────────────────────────────────────
  console.log("9. Inserting notifications...");
  const insertedNotifications = await db
    .insert(notifications)
    .values([
      {
        userId: adminUser.id,
        channel: "in_app" as const,
        title: "Critical Alert: Low Battery",
        body: "Bin ECO-BIN-1004 battery has dropped to critical level (2.8V). Immediate attention required.",
        isRead: true,
        metadata: { alertId: insertedAlerts[1].id, binDeviceCode: "ECO-BIN-1004" },
        createdAt: hoursAgo(6),
      },
      {
        userId: adminUser.id,
        channel: "in_app" as const,
        title: "Overflow Warning",
        body: "Bin ECO-BIN-1001 in Greenfield Estate has exceeded the 80% fill threshold. Current level: 93%.",
        isRead: false,
        metadata: { alertId: insertedAlerts[0].id, binDeviceCode: "ECO-BIN-1001" },
        createdAt: hoursAgo(1),
      },
      {
        userId: adminUser.id,
        channel: "in_app" as const,
        title: "Route Completed",
        body: "Route in Maple Heights has been completed by Maria Santos. 3 of 4 bins serviced.",
        isRead: true,
        metadata: { routeId: route2.id, driverName: "Maria Santos" },
        createdAt: daysAgo(2),
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedNotifications.length} notifications.`);
  for (const n of insertedNotifications) {
    console.log(`    - "${n.title}" (${n.isRead ? "read" : "unread"})`);
  }
  console.log("");

  // ── 10. System Config ───────────────────────────────────────────────────────
  console.log("10. Inserting system config...");
  const insertedConfig = await db
    .insert(systemConfig)
    .values([
      {
        subdivisionId: gfe.id,
        configKey: "subdivision_name",
        configValue: "Greenfield Estate",
        description: "Display name for the Greenfield Estate subdivision.",
      },
      {
        subdivisionId: gfe.id,
        configKey: "depot_address",
        configValue: "123 Depot Road, Barangay Lahug, Cebu City, Cebu 6000",
        description: "Address of the collection vehicle depot for Greenfield Estate.",
      },
      {
        subdivisionId: null,
        configKey: "default_fill_threshold",
        configValue: "80",
        description:
          "Default fill level percentage threshold that triggers an overflow alert. Applied globally unless overridden per bin.",
      },
      {
        subdivisionId: null,
        configKey: "low_battery_voltage",
        configValue: "3.2",
        description:
          "Battery voltage level (in volts) below which a low-battery alert is triggered.",
      },
      {
        subdivisionId: null,
        configKey: "email_alerts_enabled",
        configValue: "true",
        description:
          "Whether email notifications are sent for critical alerts. Set to 'true' or 'false'.",
      },
    ])
    .returning();

  console.log(`  Inserted ${insertedConfig.length} system config entries.`);
  for (const c of insertedConfig) {
    console.log(`    - ${c.configKey} = ${c.configValue}`);
  }
  console.log("");

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log("=== Seed completed successfully! ===");
  console.log("");
  console.log("Summary:");
  console.log(`  Subdivisions:    ${insertedSubdivisions.length}`);
  console.log(`  Users:           ${insertedUsers.length}`);
  console.log(`  Smart Bins:      ${insertedBins.length}`);
  console.log(`  Telemetry:       ${telemetryValues.length}`);
  console.log(`  Alerts:          ${insertedAlerts.length}`);
  console.log(`  Routes:          ${insertedRoutes.length}`);
  console.log(`  Route Stops:     ${insertedStops.length}`);
  console.log(`  Service Events:  ${insertedEvents.length}`);
  console.log(`  Notifications:   ${insertedNotifications.length}`);
  console.log(`  System Config:   ${insertedConfig.length}`);

  await closeDb();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
