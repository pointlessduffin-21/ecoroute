import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import {
  smartBins,
  binTelemetry,
  alerts,
  collectionRoutes,
  routeStops,
  serviceEvents,
  users,
} from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── GET /dashboard — Dashboard KPI summary ────────────────────────────────

app.get("/dashboard", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");
  const db = getDb();

  const subdivisionFilter = subdivisionId
    ? sql`WHERE subdivision_id = ${subdivisionId}`
    : sql``;

  const subdivisionJoinFilter = subdivisionId
    ? sql`AND sb.subdivision_id = ${subdivisionId}`
    : sql``;

  // Run all KPI queries in parallel
  const [
    totalBinsResult,
    activeBinsResult,
    overflowAlertsResult,
    totalRoutesResult,
    completedRoutesTodayResult,
    avgFillLevelResult,
  ] = await Promise.all([
    // Total bins
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM smart_bin ${subdivisionFilter}
    `),
    // Active bins
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM smart_bin
      WHERE status = 'active'
      ${subdivisionId ? sql`AND subdivision_id = ${subdivisionId}` : sql``}
    `),
    // Overflow alerts (unacknowledged) in last 24 hours
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM alert
      WHERE alert_type = 'overflow'
        AND is_acknowledged = false
        AND created_at >= NOW() - INTERVAL '24 hours'
        ${subdivisionId ? sql`AND subdivision_id = ${subdivisionId}` : sql``}
    `),
    // Total routes
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM collection_route ${subdivisionFilter}
    `),
    // Completed routes today
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM collection_route
      WHERE status = 'completed'
        AND completed_at >= CURRENT_DATE
        ${subdivisionId ? sql`AND subdivision_id = ${subdivisionId}` : sql``}
    `),
    // Average fill level across active bins (latest reading per bin)
    db.execute(sql`
      SELECT ROUND(AVG(latest.fill_level_percent)::numeric, 2)::real AS avg_fill
      FROM (
        SELECT DISTINCT ON (bt.device_id) bt.fill_level_percent
        FROM bin_telemetry bt
        JOIN smart_bin sb ON sb.id = bt.device_id
        WHERE sb.status = 'active'
          ${subdivisionJoinFilter}
        ORDER BY bt.device_id, bt.recorded_at DESC
      ) latest
    `),
  ]);

  return c.json({
    data: {
      totalBins: totalBinsResult[0]?.count ?? 0,
      activeBins: activeBinsResult[0]?.count ?? 0,
      overflowAlerts24h: overflowAlertsResult[0]?.count ?? 0,
      totalRoutes: totalRoutesResult[0]?.count ?? 0,
      completedRoutesToday: completedRoutesTodayResult[0]?.count ?? 0,
      avgFillLevel: avgFillLevelResult[0]?.avg_fill ?? 0,
    },
  });
});

// ─── GET /fill-levels — Current fill levels across bins ─────────────────────

app.get("/fill-levels", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");
  const db = getDb();

  const subdivisionJoinFilter = subdivisionId
    ? sql`AND sb.subdivision_id = ${subdivisionId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      sb.id AS device_id,
      sb.device_code,
      sb.latitude,
      sb.longitude,
      sb.capacity_liters,
      sb.threshold_percent,
      sb.status AS bin_status,
      latest.fill_level_percent,
      latest.battery_voltage,
      latest.recorded_at AS last_reading_at
    FROM smart_bin sb
    LEFT JOIN LATERAL (
      SELECT bt.fill_level_percent, bt.battery_voltage, bt.recorded_at
      FROM bin_telemetry bt
      WHERE bt.device_id = sb.id
      ORDER BY bt.recorded_at DESC
      LIMIT 1
    ) latest ON true
    WHERE sb.status = 'active'
      ${subdivisionJoinFilter}
    ORDER BY latest.fill_level_percent DESC NULLS LAST
  `);

  // Compute distribution buckets
  const distribution = {
    empty: 0,    // 0-25%
    low: 0,      // 25-50%
    medium: 0,   // 50-75%
    high: 0,     // 75-90%
    critical: 0, // 90-100%
  };

  for (const row of result) {
    const fill = (row as Record<string, unknown>).fill_level_percent as number | null;
    if (fill === null || fill === undefined) continue;
    if (fill < 25) distribution.empty++;
    else if (fill < 50) distribution.low++;
    else if (fill < 75) distribution.medium++;
    else if (fill < 90) distribution.high++;
    else distribution.critical++;
  }

  return c.json({
    data: {
      bins: result,
      distribution,
      total: result.length,
    },
  });
});

// ─── GET /collection-history — Historical collection data ───────────────────

app.get("/collection-history", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");
  const days = Number(c.req.query("days") || "30");
  const db = getDb();

  const subdivisionFilter = subdivisionId
    ? sql`AND cr.subdivision_id = ${subdivisionId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      DATE(cr.completed_at) AS collection_date,
      COUNT(*)::int AS routes_completed,
      ROUND(AVG(cr.estimated_distance_km)::numeric, 2)::real AS avg_distance_km,
      ROUND(AVG(cr.estimated_duration_minutes)::numeric, 2)::real AS avg_duration_minutes,
      ROUND(AVG(cr.optimization_score)::numeric, 2)::real AS avg_optimization_score,
      COUNT(DISTINCT cr.assigned_driver_id)::int AS drivers_active,
      (
        SELECT COUNT(*)::int
        FROM route_stop rs
        WHERE rs.route_id = ANY(ARRAY_AGG(cr.id))
          AND rs.status = 'serviced'
      ) AS bins_serviced
    FROM collection_route cr
    WHERE cr.status = 'completed'
      AND cr.completed_at >= NOW() - (${days} || ' days')::interval
      ${subdivisionFilter}
    GROUP BY DATE(cr.completed_at)
    ORDER BY collection_date DESC
  `);

  return c.json({ data: result });
});

// ─── GET /driver-performance — Driver metrics ──────────────────────────────

app.get("/driver-performance", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");
  const days = Number(c.req.query("days") || "30");
  const db = getDb();

  const subdivisionFilter = subdivisionId
    ? sql`AND cr.subdivision_id = ${subdivisionId}`
    : sql``;

  const result = await db.execute(sql`
    SELECT
      u.id AS driver_id,
      u.full_name AS driver_name,
      u.email AS driver_email,
      COUNT(DISTINCT cr.id)::int AS total_routes,
      COUNT(DISTINCT CASE WHEN cr.status = 'completed' THEN cr.id END)::int AS completed_routes,
      ROUND(AVG(cr.estimated_distance_km)::numeric, 2)::real AS avg_distance_km,
      ROUND(AVG(cr.estimated_duration_minutes)::numeric, 2)::real AS avg_duration_minutes,
      ROUND(AVG(cr.optimization_score)::numeric, 2)::real AS avg_optimization_score,
      (
        SELECT COUNT(*)::int
        FROM service_event se
        WHERE se.driver_id = u.id
          AND se.created_at >= NOW() - (${days} || ' days')::interval
      ) AS service_events_count
    FROM "user" u
    JOIN collection_route cr ON cr.assigned_driver_id = u.id
    WHERE u.role = 'driver'
      AND u.is_active = true
      AND cr.created_at >= NOW() - (${days} || ' days')::interval
      ${subdivisionFilter}
    GROUP BY u.id, u.full_name, u.email
    ORDER BY completed_routes DESC
  `);

  return c.json({ data: result });
});

export default app;
