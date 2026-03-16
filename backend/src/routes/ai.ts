import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, desc, gte, sql } from "drizzle-orm";
import { generateInsight } from "../services/ai-insights";
import { env } from "../config/env";
import { requireRole } from "../middleware/rbac";
import { getDb } from "../config/database";
import { cachedInsights, fillPredictions, smartBins, systemConfig } from "../db/schema";
import type { AppVariables } from "../types/context";
import { readFileSync } from "fs";

const app = new Hono<{ Variables: AppVariables }>();

// AI features accessible by admin and dispatcher only
app.use("/*", requireRole("admin", "dispatcher"));

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const insightSchema = z.object({
  type: z.enum(["general", "hotspots", "peak_days", "staffing", "efficiency"]),
  subdivisionId: z.string().uuid().optional(),
  dateRange: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});

const predictSchema = z.object({
  deviceId: z.string().uuid(),
});

const optimizeRouteSchema = z.object({
  subdivisionId: z.string().uuid(),
  depot: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  numVehicles: z.number().int().positive().default(1),
  vehicleCapacity: z.number().int().positive().default(1000),
  thresholdPercent: z.number().min(0).max(100).default(70),
});

// ─── GET /insights — Get all cached insights ────────────────────────────────

app.get("/insights", async (c) => {
  const subdivisionId = c.req.query("subdivisionId");
  const db = getDb();

  const condition = subdivisionId
    ? eq(cachedInsights.subdivisionId, subdivisionId)
    : isNull(cachedInsights.subdivisionId);

  const rows = await db
    .select()
    .from(cachedInsights)
    .where(condition)
    .orderBy(desc(cachedInsights.generatedAt));

  // Return latest per type
  const byType: Record<string, typeof rows[0]> = {};
  for (const row of rows) {
    if (!byType[row.insightType]) {
      byType[row.insightType] = row;
    }
  }

  return c.json({ data: byType });
});

// ─── POST /insights — Generate AI insight and cache it ──────────────────────

app.post("/insights", async (c) => {
  const body = await c.req.json();
  const parsed = insightSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  try {
    const result = await generateInsight(parsed.data);

    // Cache the result
    const db = getDb();
    await db.insert(cachedInsights).values({
      subdivisionId: parsed.data.subdivisionId ?? null,
      insightType: parsed.data.type,
      insight: result.insight,
      provider: result.provider,
      model: result.model,
      generatedAt: new Date(result.generatedAt),
    });

    return c.json({ data: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate insight";
    console.error("[ai-insights] Error:", message);
    return c.json({ error: message }, 500);
  }
});

// ─── GET /predictions — Get latest cached predictions ────────────────────────

app.get("/predictions", async (c) => {
  const db = getDb();

  // Get the most recent prediction timestamp
  const latest = await db
    .select({ predictedAt: fillPredictions.predictedAt })
    .from(fillPredictions)
    .orderBy(desc(fillPredictions.predictedAt))
    .limit(1);

  if (latest.length === 0) {
    return c.json({ data: { predictions: [], generatedAt: null } });
  }

  const latestTime = latest[0]!.predictedAt;
  // Get all predictions from the same batch (within 1 minute of the latest)
  const batchStart = new Date(latestTime.getTime() - 60_000);

  const rows = await db
    .select({
      id: fillPredictions.id,
      deviceId: fillPredictions.deviceId,
      deviceCode: smartBins.deviceCode,
      predictedFillPercent: fillPredictions.predictedFillPercent,
      timeToThresholdMinutes: fillPredictions.timeToThresholdMinutes,
      confidenceScore: fillPredictions.confidenceScore,
      modelVersion: fillPredictions.modelVersion,
      predictedAt: fillPredictions.predictedAt,
    })
    .from(fillPredictions)
    .leftJoin(smartBins, eq(fillPredictions.deviceId, smartBins.id))
    .where(gte(fillPredictions.predictedAt, batchStart))
    .orderBy(desc(fillPredictions.predictedFillPercent));

  return c.json({
    data: {
      predictions: rows,
      generatedAt: latestTime.toISOString(),
    },
  });
});

// ─── POST /predict — Proxy to Python AI service for LSTM prediction ─────────

app.post("/predict", async (c) => {
  const body = await c.req.json();
  const parsed = predictSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(
      `${aiServiceUrl}/predict/${parsed.data.deviceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service prediction failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-predict] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── POST /predict/all — Proxy to Python AI service for all predictions ─────

app.post("/predict/all", async (c) => {
  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/predict/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service bulk prediction failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const aiData = (await response.json()) as {
      predictions: Array<{
        device_id: string;
        predicted_fill_percent: number;
        time_to_threshold_minutes: number;
        confidence_score: number;
        model_version: string;
        predicted_at: string;
      }>;
      total: number;
      errors: number;
    };

    // Read back from DB to get device_code and proper IDs
    if (aiData.predictions.length > 0) {
      const db = getDb();
      const latest = await db
        .select({ predictedAt: fillPredictions.predictedAt })
        .from(fillPredictions)
        .orderBy(desc(fillPredictions.predictedAt))
        .limit(1);

      if (latest.length > 0) {
        const latestTime = latest[0]!.predictedAt;
        const batchStart = new Date(latestTime.getTime() - 60_000);

        const rows = await db
          .select({
            id: fillPredictions.id,
            deviceId: fillPredictions.deviceId,
            deviceCode: smartBins.deviceCode,
            predictedFillPercent: fillPredictions.predictedFillPercent,
            timeToThresholdMinutes: fillPredictions.timeToThresholdMinutes,
            confidenceScore: fillPredictions.confidenceScore,
            modelVersion: fillPredictions.modelVersion,
            predictedAt: fillPredictions.predictedAt,
          })
          .from(fillPredictions)
          .leftJoin(smartBins, eq(fillPredictions.deviceId, smartBins.id))
          .where(gte(fillPredictions.predictedAt, batchStart))
          .orderBy(desc(fillPredictions.predictedFillPercent));

        return c.json({
          data: {
            predictions: rows,
            generatedAt: latestTime.toISOString(),
          },
        });
      }
    }

    return c.json({ data: aiData });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-predict-all] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── POST /train — Trigger model training ───────────────────────────────────

app.post("/train", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service training failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-train] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── GET /evaluate — Proxy to Python AI service for model evaluation ────────

app.get("/evaluate", async (c) => {
  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/evaluate`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service evaluation failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-evaluate] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

// ─── POST /verify-collection — AI photo verification of bin collection ──────

const verifyCollectionSchema = z.object({
  beforePhotoUrl: z.string().min(1),
  afterPhotoUrl: z.string().min(1),
  binId: z.string().uuid(),
});

interface VerificationResult {
  verified: boolean;
  confidence: number;
  description: string;
}

/**
 * Read AI provider configuration from system_config table.
 */
async function getVisionAIConfig(): Promise<{
  provider: "gemini" | "openrouter" | "ollama";
  apiKey: string;
  model: string;
  ollamaUrl: string;
}> {
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

  const provider =
    (configMap["ai_provider"] as "gemini" | "openrouter" | "ollama") || "ollama";
  const apiKey = configMap["ai_api_key"] || "";
  const ollamaUrl = configMap["ai_ollama_url"] || "http://localhost:11434";

  // Default to a vision-capable model per provider
  let defaultModel: string;
  if (provider === "gemini") {
    defaultModel = "gemini-2.0-flash";
  } else if (provider === "ollama") {
    defaultModel = "llava";
  } else {
    defaultModel = "google/gemini-2.0-flash-001";
  }
  const model = configMap["ai_model"] || defaultModel;

  return { provider, apiKey, model, ollamaUrl };
}

/**
 * Read a local file path and return its base64 encoding.
 * Strips leading "/" since uploads are relative to the project root.
 */
function readPhotoAsBase64(photoUrl: string): string {
  const localPath = photoUrl.startsWith("/") ? photoUrl.slice(1) : photoUrl;
  const buffer = readFileSync(localPath);
  return buffer.toString("base64");
}

const VERIFICATION_PROMPT =
  "Compare these two photos of a waste bin. The first is BEFORE collection and the second is AFTER. " +
  "Determine if the bin was successfully emptied. " +
  'Respond with JSON: { "verified": boolean, "confidence": number, "description": string }';

async function verifyWithOllama(
  ollamaUrl: string,
  model: string,
  beforeBase64: string,
  afterBase64: string
): Promise<VerificationResult> {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: VERIFICATION_PROMPT,
          images: [beforeBase64, afterBase64],
        },
      ],
      stream: false,
      format: "json",
      options: {
        temperature: 0.3,
        num_predict: 512,
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

  try {
    const parsed = JSON.parse(text) as VerificationResult;
    return {
      verified: Boolean(parsed.verified),
      confidence: Number(parsed.confidence) || 0,
      description: String(parsed.description || ""),
    };
  } catch {
    // If the model didn't return valid JSON, return a best-effort result
    return {
      verified: false,
      confidence: 0,
      description: `AI response could not be parsed as JSON: ${text.substring(0, 200)}`,
    };
  }
}

async function verifyWithGemini(
  apiKey: string,
  model: string,
  beforeBase64: string,
  afterBase64: string
): Promise<VerificationResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: VERIFICATION_PROMPT },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: beforeBase64,
                },
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: afterBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
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

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API returned an empty response.");
  }

  try {
    const parsed = JSON.parse(text) as VerificationResult;
    return {
      verified: Boolean(parsed.verified),
      confidence: Number(parsed.confidence) || 0,
      description: String(parsed.description || ""),
    };
  } catch {
    return {
      verified: false,
      confidence: 0,
      description: `AI response could not be parsed as JSON: ${text.substring(0, 200)}`,
    };
  }
}

async function verifyWithOpenRouter(
  apiKey: string,
  model: string,
  beforeBase64: string,
  afterBase64: string
): Promise<VerificationResult> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ecoroute.io",
        "X-Title": "EcoRoute Photo Verification",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VERIFICATION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${beforeBase64}`,
                },
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${afterBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 512,
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
    throw new Error("OpenRouter API returned an empty response.");
  }

  // Extract JSON from potentially markdown-wrapped response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text;

  try {
    const parsed = JSON.parse(jsonStr) as VerificationResult;
    return {
      verified: Boolean(parsed.verified),
      confidence: Number(parsed.confidence) || 0,
      description: String(parsed.description || ""),
    };
  } catch {
    return {
      verified: false,
      confidence: 0,
      description: `AI response could not be parsed as JSON: ${text.substring(0, 200)}`,
    };
  }
}

app.post("/verify-collection", async (c) => {
  const body = await c.req.json();
  const parsed = verifyCollectionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  const { beforePhotoUrl, afterPhotoUrl, binId } = parsed.data;

  // Verify bin exists
  const db = getDb();
  const binResult = await db
    .select({ id: smartBins.id })
    .from(smartBins)
    .where(eq(smartBins.id, binId))
    .limit(1);

  if (binResult.length === 0) {
    return c.json({ error: "Bin not found" }, 404);
  }

  // Read photos as base64
  let beforeBase64: string;
  let afterBase64: string;

  try {
    beforeBase64 = readPhotoAsBase64(beforePhotoUrl);
  } catch (err) {
    return c.json(
      {
        error: "Failed to read before photo",
        details: err instanceof Error ? err.message : "File not found",
      },
      400
    );
  }

  try {
    afterBase64 = readPhotoAsBase64(afterPhotoUrl);
  } catch (err) {
    return c.json(
      {
        error: "Failed to read after photo",
        details: err instanceof Error ? err.message : "File not found",
      },
      400
    );
  }

  // Get AI config
  let config: Awaited<ReturnType<typeof getVisionAIConfig>>;
  try {
    config = await getVisionAIConfig();
  } catch (err) {
    return c.json(
      {
        error: "AI configuration error",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      500
    );
  }

  // Call appropriate AI provider
  try {
    let result: VerificationResult;

    if (config.provider === "ollama") {
      result = await verifyWithOllama(
        config.ollamaUrl,
        config.model,
        beforeBase64,
        afterBase64
      );
    } else if (config.provider === "gemini") {
      result = await verifyWithGemini(
        config.apiKey,
        config.model,
        beforeBase64,
        afterBase64
      );
    } else {
      result = await verifyWithOpenRouter(
        config.apiKey,
        config.model,
        beforeBase64,
        afterBase64
      );
    }

    return c.json({
      data: {
        verified: result.verified,
        confidence: result.confidence,
        description: result.description,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI verification failed";
    console.error("[ai-verify-collection] Error:", message);
    return c.json({ error: "AI verification failed", details: message }, 502);
  }
});

// ─── POST /optimize-route — Proxy to Python AI service for route optimization

app.post("/optimize-route", async (c) => {
  const body = await c.req.json();
  const parsed = optimizeRouteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  try {
    const aiServiceUrl = env.AI_SERVICE_URL;
    const response = await fetch(`${aiServiceUrl}/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdivision_id: parsed.data.subdivisionId,
        depot: {
          latitude: parsed.data.depot.latitude,
          longitude: parsed.data.depot.longitude,
        },
        num_vehicles: parsed.data.numVehicles,
        vehicle_capacity: parsed.data.vehicleCapacity,
        threshold_percent: parsed.data.thresholdPercent,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return c.json(
        {
          error: "AI service route optimization failed",
          details: errorBody,
          statusCode: response.status,
        },
        response.status as 400 | 500 | 502 | 503
      );
    }

    const data = await response.json();
    return c.json({ data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach AI service";
    console.error("[ai-optimize-route] Error:", message);
    return c.json(
      { error: "AI service unavailable", details: message },
      502
    );
  }
});

export default app;
