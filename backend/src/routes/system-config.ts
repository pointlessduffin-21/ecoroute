import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { systemConfig } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const setConfigSchema = z.object({
  configValue: z.string().min(1),
  description: z.string().optional(),
  subdivisionId: z.string().uuid().optional(),
});

// ─── GET / — List config entries ────────────────────────────────────────────

app.get("/", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
  const offset = Number(c.req.query("offset") || "0");
  const subdivisionId = c.req.query("subdivisionId");

  const db = getDb();

  const conditions = [];
  if (subdivisionId) {
    conditions.push(eq(systemConfig.subdivisionId, subdivisionId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(systemConfig)
      .where(whereClause)
      .orderBy(systemConfig.configKey)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(systemConfig)
      .where(whereClause),
  ]);

  return c.json({
    data: items,
    pagination: {
      total: countResult[0]!.count,
      limit,
      offset,
    },
  });
});

// ─── GET /:key — Get config by key ─────────────────────────────────────────

app.get("/:key", async (c) => {
  const { key } = c.req.param();
  const subdivisionId = c.req.query("subdivisionId");
  const db = getDb();

  const conditions = [eq(systemConfig.configKey, key)];
  if (subdivisionId) {
    conditions.push(eq(systemConfig.subdivisionId, subdivisionId));
  }

  const result = await db
    .select()
    .from(systemConfig)
    .where(and(...conditions))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Config entry not found" }, 404);
  }

  return c.json({ data: result[0] });
});

// ─── PUT /:key — Set config value (upsert) ─────────────────────────────────

app.put("/:key", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  const { key } = c.req.param();
  const body = await c.req.json();
  const parsed = setConfigSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  // Check if the config key already exists for the given scope
  const conditions = [eq(systemConfig.configKey, key)];
  if (parsed.data.subdivisionId) {
    conditions.push(eq(systemConfig.subdivisionId, parsed.data.subdivisionId));
  }

  const existing = await db
    .select()
    .from(systemConfig)
    .where(and(...conditions))
    .limit(1);

  let result;

  if (existing.length > 0) {
    // Update existing
    [result] = await db
      .update(systemConfig)
      .set({
        configValue: parsed.data.configValue,
        description: parsed.data.description ?? existing[0]!.description,
        updatedAt: new Date(),
      })
      .where(eq(systemConfig.id, existing[0]!.id))
      .returning();
  } else {
    // Insert new
    [result] = await db
      .insert(systemConfig)
      .values({
        configKey: key,
        configValue: parsed.data.configValue,
        description: parsed.data.description,
        subdivisionId: parsed.data.subdivisionId,
      })
      .returning();
  }

  return c.json({ data: result });
});

// ─── DELETE /:key — Remove config ───────────────────────────────────────────

app.delete("/:key", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }

  const { key } = c.req.param();
  const subdivisionId = c.req.query("subdivisionId");
  const db = getDb();

  const conditions = [eq(systemConfig.configKey, key)];
  if (subdivisionId) {
    conditions.push(eq(systemConfig.subdivisionId, subdivisionId));
  }

  const [deleted] = await db
    .delete(systemConfig)
    .where(and(...conditions))
    .returning();

  if (!deleted) {
    return c.json({ error: "Config entry not found" }, 404);
  }

  return c.json({ message: "Config entry deleted" });
});

export default app;
