import { eq, and, sql, gte, desc } from "drizzle-orm";
import { getDb } from "../config/database";
import {
  systemConfig,
  smartBins,
  binTelemetry,
  alerts,
  collectionRoutes,
  routeStops,
  serviceEvents,
  users,
} from "../db/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InsightRequest {
  type: "general" | "hotspots" | "peak_days" | "staffing" | "efficiency";
  subdivisionId?: string;
  dateRange?: { from: string; to: string };
}

export interface InsightResponse {
  insight: string;
  provider: string;
  model: string;
  generatedAt: string;
}

interface AIConfig {
  provider: "gemini" | "openrouter" | "ollama";
  apiKey: string;
  model: string;
  ollamaUrl?: string;
}

// ─── Config helpers ──────────────────────────────────────────────────────────

async function getAIConfig(): Promise<AIConfig> {
  const db = getDb();

  const configRows = await db
    .select({
      key: systemConfig.configKey,
      value: systemConfig.configValue,
    })
    .from(systemConfig)
    .where(
      sql`${systemConfig.configKey} IN ('ai_provider', 'ai_api_key', 'ai_model', 'ai_ollama_url')
          AND ${systemConfig.subdivisionId} IS NULL`
    );

  const configMap: Record<string, string> = {};
  for (const row of configRows) {
    configMap[row.key] = row.value;
  }

  const provider = (configMap["ai_provider"] as "gemini" | "openrouter" | "ollama") || "gemini";
  const apiKey = configMap["ai_api_key"] || "";
  const ollamaUrl = configMap["ai_ollama_url"] || "http://localhost:11434";

  const defaultModel =
    provider === "gemini"
      ? "gemini-2.0-flash"
      : provider === "ollama"
        ? "llama3.2"
        : "google/gemini-2.0-flash-001";
  const model = configMap["ai_model"] || defaultModel;

  if (provider !== "ollama" && !apiKey) {
    throw new Error(
      "AI API key not configured. Set the 'ai_api_key' value in system_config."
    );
  }

  return { provider, apiKey, model, ollamaUrl };
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

async function fetchGeneralData(subdivisionId?: string) {
  const db = getDb();

  const subdivisionFilter = subdivisionId
    ? sql`AND subdivision_id = ${subdivisionId}`
    : sql``;
  const subdivisionJoinFilter = subdivisionId
    ? sql`AND sb.subdivision_id = ${subdivisionId}`
    : sql``;

  const [dashboardStats, recentAlerts, fillLevels] = await Promise.all([
    // Dashboard KPIs
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM smart_bin WHERE status = 'active' ${sql.raw(subdivisionId ? `AND subdivision_id = '${subdivisionId}'` : "")}) AS active_bins,
        (SELECT COUNT(*)::int FROM alert WHERE alert_type = 'overflow' AND is_acknowledged = false AND created_at >= NOW() - INTERVAL '24 hours' ${sql.raw(subdivisionId ? `AND subdivision_id = '${subdivisionId}'` : "")}) AS overflow_alerts_24h,
        (SELECT COUNT(*)::int FROM collection_route WHERE status = 'completed' AND completed_at >= CURRENT_DATE ${sql.raw(subdivisionId ? `AND subdivision_id = '${subdivisionId}'` : "")}) AS completed_routes_today,
        (SELECT COUNT(*)::int FROM collection_route WHERE status = 'in_progress' ${sql.raw(subdivisionId ? `AND subdivision_id = '${subdivisionId}'` : "")}) AS routes_in_progress
    `),
    // Recent alerts (last 7 days)
    db.execute(sql`
      SELECT alert_type, severity, message, created_at
      FROM alert
      WHERE created_at >= NOW() - INTERVAL '7 days'
        ${sql.raw(subdivisionId ? `AND subdivision_id = '${subdivisionId}'` : "")}
      ORDER BY created_at DESC
      LIMIT 20
    `),
    // Current fill levels
    db.execute(sql`
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
        ${sql.raw(subdivisionId ? `AND sb.subdivision_id = '${subdivisionId}'` : "")}
      ORDER BY latest.fill_level_percent DESC NULLS LAST
      LIMIT 50
    `),
  ]);

  return {
    dashboardStats: dashboardStats[0] ?? {},
    recentAlerts,
    fillLevels,
  };
}

async function fetchHotspotsData(subdivisionId?: string) {
  const db = getDb();

  const result = await db.execute(sql`
    SELECT
      sb.id AS device_id,
      sb.device_code,
      sb.latitude,
      sb.longitude,
      COUNT(a.id)::int AS overflow_count,
      MAX(a.created_at) AS last_overflow_at
    FROM smart_bin sb
    JOIN alert a ON a.device_id = sb.id
    WHERE a.alert_type = 'overflow'
      AND a.created_at >= NOW() - INTERVAL '30 days'
      ${sql.raw(subdivisionId ? `AND sb.subdivision_id = '${subdivisionId}'` : "")}
    GROUP BY sb.id, sb.device_code, sb.latitude, sb.longitude
    ORDER BY overflow_count DESC
    LIMIT 20
  `);

  return { hotspots: result };
}

async function fetchPeakDaysData(subdivisionId?: string) {
  const db = getDb();

  const result = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM bt.recorded_at)::int AS day_of_week,
      TO_CHAR(bt.recorded_at, 'Day') AS day_name,
      ROUND(AVG(bt.fill_level_percent)::numeric, 2)::real AS avg_fill_level,
      COUNT(*)::int AS reading_count,
      COUNT(DISTINCT bt.device_id)::int AS bins_reporting
    FROM bin_telemetry bt
    JOIN smart_bin sb ON sb.id = bt.device_id
    WHERE bt.recorded_at >= NOW() - INTERVAL '90 days'
      AND sb.status = 'active'
      ${sql.raw(subdivisionId ? `AND sb.subdivision_id = '${subdivisionId}'` : "")}
    GROUP BY EXTRACT(DOW FROM bt.recorded_at), TO_CHAR(bt.recorded_at, 'Day')
    ORDER BY avg_fill_level DESC
  `);

  return { peakDays: result };
}

async function fetchStaffingData(subdivisionId?: string) {
  const db = getDb();

  const result = await db.execute(sql`
    SELECT
      u.id AS driver_id,
      u.full_name AS driver_name,
      COUNT(DISTINCT cr.id)::int AS total_routes,
      COUNT(DISTINCT CASE WHEN cr.status = 'completed' THEN cr.id END)::int AS completed_routes,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT cr.id) > 0
          THEN (COUNT(DISTINCT CASE WHEN cr.status = 'completed' THEN cr.id END)::numeric / COUNT(DISTINCT cr.id)::numeric * 100)
          ELSE 0
        END, 2
      )::real AS completion_rate_pct,
      ROUND(AVG(cr.estimated_distance_km)::numeric, 2)::real AS avg_distance_km,
      ROUND(AVG(cr.estimated_duration_minutes)::numeric, 2)::real AS avg_duration_minutes,
      (
        SELECT COUNT(*)::int FROM service_event se
        WHERE se.driver_id = u.id AND se.created_at >= NOW() - INTERVAL '30 days'
      ) AS service_events_30d
    FROM "user" u
    LEFT JOIN collection_route cr ON cr.assigned_driver_id = u.id
      AND cr.created_at >= NOW() - INTERVAL '30 days'
      ${sql.raw(subdivisionId ? `AND cr.subdivision_id = '${subdivisionId}'` : "")}
    WHERE u.role = 'maintenance' AND u.is_active = true
    GROUP BY u.id, u.full_name
    ORDER BY completed_routes DESC
  `);

  return { driverPerformance: result };
}

async function fetchEfficiencyData(subdivisionId?: string) {
  const db = getDb();

  const [routeStats, collectionFrequency] = await Promise.all([
    // Route efficiency metrics
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total_routes,
        ROUND(AVG(cr.estimated_distance_km)::numeric, 2)::real AS avg_distance_km,
        ROUND(AVG(cr.estimated_duration_minutes)::numeric, 2)::real AS avg_duration_minutes,
        ROUND(AVG(cr.optimization_score)::numeric, 2)::real AS avg_optimization_score,
        ROUND(
          CASE
            WHEN COUNT(*) > 0
            THEN (COUNT(CASE WHEN cr.status = 'completed' THEN 1 END)::numeric / COUNT(*)::numeric * 100)
            ELSE 0
          END, 2
        )::real AS route_completion_rate_pct,
        (
          SELECT ROUND(AVG(stop_count)::numeric, 2)::real
          FROM (
            SELECT COUNT(*)::int AS stop_count
            FROM route_stop rs2
            JOIN collection_route cr2 ON cr2.id = rs2.route_id
            WHERE cr2.created_at >= NOW() - INTERVAL '30 days'
              ${sql.raw(subdivisionId ? `AND cr2.subdivision_id = '${subdivisionId}'` : "")}
            GROUP BY rs2.route_id
          ) sub
        ) AS avg_stops_per_route
      FROM collection_route cr
      WHERE cr.created_at >= NOW() - INTERVAL '30 days'
        ${sql.raw(subdivisionId ? `AND cr.subdivision_id = '${subdivisionId}'` : "")}
    `),
    // Collection frequency per bin
    db.execute(sql`
      SELECT
        sb.device_code,
        COUNT(rs.id)::int AS times_collected_30d,
        ROUND(AVG(bt_latest.fill_level_percent)::numeric, 2)::real AS current_fill_level
      FROM smart_bin sb
      LEFT JOIN route_stop rs ON rs.device_id = sb.id AND rs.status = 'serviced'
      LEFT JOIN collection_route cr ON cr.id = rs.route_id AND cr.completed_at >= NOW() - INTERVAL '30 days'
      LEFT JOIN LATERAL (
        SELECT bt.fill_level_percent
        FROM bin_telemetry bt
        WHERE bt.device_id = sb.id
        ORDER BY bt.recorded_at DESC
        LIMIT 1
      ) bt_latest ON true
      WHERE sb.status = 'active'
        ${sql.raw(subdivisionId ? `AND sb.subdivision_id = '${subdivisionId}'` : "")}
      GROUP BY sb.id, sb.device_code
      ORDER BY times_collected_30d DESC
      LIMIT 30
    `),
  ]);

  return {
    routeStats: routeStats[0] ?? {},
    collectionFrequency,
  };
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are an AI analyst for EcoRoute, a smart waste management system for residential subdivisions in the Philippines. " +
  "Analyze the provided operational data and give actionable, concise insights. " +
  "Use bullet points. Be specific with numbers and percentages. " +
  "Focus on practical recommendations that waste management operators can act on immediately.";

function buildUserPrompt(type: InsightRequest["type"], data: unknown): string {
  const dataJson = JSON.stringify(data, null, 2);

  const typeInstructions: Record<InsightRequest["type"], string> = {
    general:
      "Provide a general operational overview based on the dashboard statistics, recent alerts, and current fill levels. " +
      "Highlight any concerning trends, bins that need immediate attention, and overall system health.",
    hotspots:
      "Analyze the overflow hotspot data. Identify which bins are repeatedly overflowing, " +
      "suggest potential causes (e.g., undersized bins, high foot traffic areas, scheduling gaps), " +
      "and recommend specific actions to reduce overflow incidents.",
    peak_days:
      "Analyze the telemetry data aggregated by day of week. Identify which days have the highest fill rates, " +
      "suggest optimal collection scheduling to prevent overflows, " +
      "and recommend how to balance the workload across the week.",
    staffing:
      "Analyze the maintenance staff performance and route completion data. " +
      "Identify top-performing and underperforming maintenance personnel, suggest staffing adjustments, " +
      "and recommend training or process improvements to boost overall completion rates.",
    efficiency:
      "Analyze the route efficiency and collection frequency data. " +
      "Identify routes that could be optimized, bins that are being over- or under-serviced, " +
      "and recommend specific changes to improve fuel efficiency and reduce operational costs.",
  };

  return (
    `${typeInstructions[type]}\n\n` +
    `Here is the current operational data:\n\`\`\`json\n${dataJson}\n\`\`\``
  );
}

// ─── LLM API callers ─────────────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini API error (${response.status}): ${errorBody}`
    );
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`Gemini API error: ${json.error.message}`);
  }

  const text =
    json.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error(
      "Gemini API returned an empty response. No candidates or text found."
    );
  }

  return text;
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ecoroute.io",
        "X-Title": "EcoRoute AI Insights",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorBody}`
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`OpenRouter API error: ${json.error.message}`);
  }

  const text = json.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error(
      "OpenRouter API returned an empty response. No choices or content found."
    );
  }

  return text;
}

async function callOllama(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 1024,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errorBody}`);
  }

  const json = (await response.json()) as {
    message?: { content?: string };
    error?: string;
  };

  if (json.error) {
    throw new Error(`Ollama error: ${json.error}`);
  }

  const text = json.message?.content;

  if (!text) {
    throw new Error("Ollama returned an empty response.");
  }

  return text;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateInsight(
  request: InsightRequest
): Promise<InsightResponse> {
  const config = await getAIConfig();

  // Fetch relevant data based on insight type
  let data: unknown;

  switch (request.type) {
    case "general":
      data = await fetchGeneralData(request.subdivisionId);
      break;
    case "hotspots":
      data = await fetchHotspotsData(request.subdivisionId);
      break;
    case "peak_days":
      data = await fetchPeakDaysData(request.subdivisionId);
      break;
    case "staffing":
      data = await fetchStaffingData(request.subdivisionId);
      break;
    case "efficiency":
      data = await fetchEfficiencyData(request.subdivisionId);
      break;
    default:
      throw new Error(`Unknown insight type: ${request.type}`);
  }

  const userPrompt = buildUserPrompt(request.type, data);

  let insight: string;

  if (config.provider === "gemini") {
    insight = await callGemini(config.apiKey, config.model, SYSTEM_PROMPT, userPrompt);
  } else if (config.provider === "ollama") {
    insight = await callOllama(config.ollamaUrl ?? "http://localhost:11434", config.model, SYSTEM_PROMPT, userPrompt);
  } else {
    insight = await callOpenRouter(config.apiKey, config.model, SYSTEM_PROMPT, userPrompt);
  }

  return {
    insight,
    provider: config.provider,
    model: config.model,
    generatedAt: new Date().toISOString(),
  };
}
