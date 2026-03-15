#!/usr/bin/env node
/**
 * EcoRoute MCP Server
 *
 * A Model Context Protocol server that exposes EcoRoute operational data
 * as tools for AI assistants (Claude Desktop, Claude Code, etc.).
 *
 * Run standalone:  bun run src/mcp/ecoroute-mcp-server.ts
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "ecoroute": {
 *       "command": "bun",
 *       "args": ["run", "/path/to/ecoroute/backend/src/mcp/ecoroute-mcp-server.ts"],
 *       "env": { "DATABASE_URL": "postgresql://..." }
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import postgres from "postgres";
import { sql as drizzleSql, desc, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import "dotenv/config";

// ─── DB ──────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

// ─── Server ──────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "ecoroute", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_dashboard_stats",
      description:
        "Get high-level KPIs: active bin count, unacknowledged overflow alerts in last 24h, " +
        "routes completed today, and routes currently in progress. Optionally filter by subdivisionId.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: {
            type: "string",
            description: "UUID of the subdivision to filter by (optional)",
          },
        },
      },
    },
    {
      name: "get_fill_levels",
      description:
        "Get the latest fill level reading for every active smart bin. " +
        "Returns device_code, fill_level_percent, battery_voltage, and location coordinates.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: { type: "string", description: "UUID of the subdivision (optional)" },
          min_fill_percent: {
            type: "number",
            description: "Only return bins at or above this fill level (0-100, default 0)",
          },
        },
      },
    },
    {
      name: "get_overflow_hotspots",
      description:
        "Find bins that have triggered the most overflow alerts in the last 30 days. " +
        "Useful for identifying problem areas that need bin resizing or more frequent collection.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: { type: "string", description: "UUID of the subdivision (optional)" },
          limit: { type: "number", description: "Max bins to return (default 10)" },
        },
      },
    },
    {
      name: "get_recent_alerts",
      description:
        "Get recent system alerts (overflow, battery, connectivity) with severity and timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: { type: "string", description: "UUID of the subdivision (optional)" },
          hours: { type: "number", description: "Look back N hours (default 24)" },
          unacknowledged_only: {
            type: "boolean",
            description: "Only return alerts not yet acknowledged (default false)",
          },
        },
      },
    },
    {
      name: "get_route_performance",
      description:
        "Aggregate route efficiency metrics for the last 30 days: total routes, " +
        "completion rate, average distance and duration, average stops per route.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: { type: "string", description: "UUID of the subdivision (optional)" },
        },
      },
    },
    {
      name: "get_staff_performance",
      description:
        "Per-staff completion rates, average route distance/duration, and service events " +
        "in the last 30 days. Useful for identifying training needs or scheduling imbalances.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: { type: "string", description: "UUID of the subdivision (optional)" },
        },
      },
    },
    {
      name: "get_fill_predictions",
      description:
        "Retrieve the latest LSTM fill-level predictions for all bins: predicted fill %, " +
        "estimated minutes until threshold breach, and confidence score.",
      inputSchema: {
        type: "object",
        properties: {
          subdivision_id: { type: "string", description: "UUID of the subdivision (optional)" },
          threshold_percent: {
            type: "number",
            description: "Only show bins predicted to reach this fill level (default 0 = all)",
          },
        },
      },
    },
  ],
}));

// ─── Tool implementations ─────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  const sdFilter = a.subdivision_id
    ? `AND subdivision_id = '${a.subdivision_id}'`
    : "";
  const sdBinFilter = a.subdivision_id
    ? `AND sb.subdivision_id = '${a.subdivision_id}'`
    : "";

  try {
    let result: unknown;

    switch (name) {
      case "get_dashboard_stats": {
        const rows = await db.execute(drizzleSql`
          SELECT
            (SELECT COUNT(*)::int FROM smart_bin WHERE status = 'active' ${drizzleSql.raw(sdFilter)}) AS active_bins,
            (SELECT COUNT(*)::int FROM alert WHERE alert_type = 'overflow' AND is_acknowledged = false AND created_at >= NOW() - INTERVAL '24 hours' ${drizzleSql.raw(sdFilter)}) AS overflow_alerts_24h,
            (SELECT COUNT(*)::int FROM collection_route WHERE status = 'completed' AND completed_at >= CURRENT_DATE ${drizzleSql.raw(sdFilter)}) AS completed_routes_today,
            (SELECT COUNT(*)::int FROM collection_route WHERE status = 'in_progress' ${drizzleSql.raw(sdFilter)}) AS routes_in_progress,
            (SELECT ROUND(AVG(bt.fill_level_percent)::numeric, 1)::real
             FROM bin_telemetry bt
             JOIN smart_bin sb ON sb.id = bt.device_id
             WHERE sb.status = 'active' ${drizzleSql.raw(sdBinFilter)}
             AND bt.recorded_at >= NOW() - INTERVAL '1 hour') AS avg_fill_level_1h
        `);
        result = rows[0];
        break;
      }

      case "get_fill_levels": {
        const minFill = (a.min_fill_percent as number) ?? 0;
        const rows = await db.execute(drizzleSql`
          SELECT
            sb.device_code,
            sb.latitude,
            sb.longitude,
            latest.fill_level_percent,
            latest.battery_voltage,
            latest.recorded_at
          FROM smart_bin sb
          LEFT JOIN LATERAL (
            SELECT bt.fill_level_percent, bt.battery_voltage, bt.recorded_at
            FROM bin_telemetry bt
            WHERE bt.device_id = sb.id
            ORDER BY bt.recorded_at DESC
            LIMIT 1
          ) latest ON true
          WHERE sb.status = 'active'
            ${drizzleSql.raw(sdBinFilter)}
            AND (latest.fill_level_percent IS NULL OR latest.fill_level_percent >= ${minFill})
          ORDER BY latest.fill_level_percent DESC NULLS LAST
        `);
        result = rows;
        break;
      }

      case "get_overflow_hotspots": {
        const limit = (a.limit as number) ?? 10;
        const rows = await db.execute(drizzleSql`
          SELECT
            sb.device_code,
            sb.latitude,
            sb.longitude,
            COUNT(al.id)::int AS overflow_count,
            MAX(al.created_at) AS last_overflow_at
          FROM smart_bin sb
          JOIN alert al ON al.device_id = sb.id
          WHERE al.alert_type = 'overflow'
            AND al.created_at >= NOW() - INTERVAL '30 days'
            ${drizzleSql.raw(sdBinFilter)}
          GROUP BY sb.id, sb.device_code, sb.latitude, sb.longitude
          ORDER BY overflow_count DESC
          LIMIT ${limit}
        `);
        result = rows;
        break;
      }

      case "get_recent_alerts": {
        const hours = (a.hours as number) ?? 24;
        const unackOnly = a.unacknowledged_only === true;
        const rows = await db.execute(drizzleSql`
          SELECT
            al.id,
            al.alert_type,
            al.severity,
            al.message,
            al.is_acknowledged,
            al.created_at,
            sb.device_code
          FROM alert al
          LEFT JOIN smart_bin sb ON sb.id = al.device_id
          WHERE al.created_at >= NOW() - INTERVAL '${drizzleSql.raw(String(hours))} hours'
            ${drizzleSql.raw(sdFilter ? sdFilter.replace("AND subdivision_id", "AND al.subdivision_id") : "")}
            ${unackOnly ? drizzleSql.raw("AND al.is_acknowledged = false") : drizzleSql.raw("")}
          ORDER BY al.created_at DESC
          LIMIT 50
        `);
        result = rows;
        break;
      }

      case "get_route_performance": {
        const rows = await db.execute(drizzleSql`
          SELECT
            COUNT(*)::int AS total_routes,
            COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_routes,
            ROUND(
              CASE WHEN COUNT(*) > 0
                THEN COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric / COUNT(*)::numeric * 100
                ELSE 0 END, 1
            )::real AS completion_rate_pct,
            ROUND(AVG(estimated_distance_km)::numeric, 2)::real AS avg_distance_km,
            ROUND(AVG(estimated_duration_minutes)::numeric, 1)::real AS avg_duration_minutes,
            ROUND(AVG(optimization_score)::numeric, 2)::real AS avg_optimization_score
          FROM collection_route
          WHERE created_at >= NOW() - INTERVAL '30 days'
            ${drizzleSql.raw(sdFilter)}
        `);
        result = rows[0];
        break;
      }

      case "get_staff_performance": {
        const rows = await db.execute(drizzleSql`
          SELECT
            u.full_name,
            u.email,
            COUNT(DISTINCT cr.id)::int AS total_routes,
            COUNT(DISTINCT CASE WHEN cr.status = 'completed' THEN cr.id END)::int AS completed_routes,
            ROUND(
              CASE WHEN COUNT(DISTINCT cr.id) > 0
                THEN COUNT(DISTINCT CASE WHEN cr.status = 'completed' THEN cr.id END)::numeric
                     / COUNT(DISTINCT cr.id)::numeric * 100
                ELSE 0 END, 1
            )::real AS completion_rate_pct,
            ROUND(AVG(cr.estimated_distance_km)::numeric, 2)::real AS avg_distance_km,
            (SELECT COUNT(*)::int FROM service_event se
             WHERE se.driver_id = u.id AND se.created_at >= NOW() - INTERVAL '30 days') AS service_events_30d
          FROM "user" u
          LEFT JOIN collection_route cr ON cr.assigned_driver_id = u.id
            AND cr.created_at >= NOW() - INTERVAL '30 days'
            ${drizzleSql.raw(sdFilter ? sdFilter.replace("AND subdivision_id", "AND cr.subdivision_id") : "")}
          WHERE u.role = 'maintenance' AND u.is_active = true
          GROUP BY u.id, u.full_name, u.email
          ORDER BY completed_routes DESC
        `);
        result = rows;
        break;
      }

      case "get_fill_predictions": {
        const threshold = (a.threshold_percent as number) ?? 0;
        const rows = await db.execute(drizzleSql`
          SELECT
            fp.predicted_fill_percent,
            fp.time_to_threshold_minutes,
            fp.confidence_score,
            fp.model_version,
            fp.predicted_at,
            sb.device_code,
            sb.latitude,
            sb.longitude
          FROM fill_prediction fp
          JOIN smart_bin sb ON sb.id = fp.device_id
          WHERE fp.predicted_at >= NOW() - INTERVAL '2 hours'
            ${drizzleSql.raw(sdBinFilter)}
            ${threshold > 0 ? drizzleSql.raw(`AND fp.predicted_fill_percent >= ${threshold}`) : drizzleSql.raw("")}
          ORDER BY fp.predicted_fill_percent DESC
          LIMIT 100
        `);
        result = rows;
        break;
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
      isError: true,
    };
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[ecoroute-mcp] Server running on stdio");
