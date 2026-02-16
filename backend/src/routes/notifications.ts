import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { notifications } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  channel: z.enum(["push", "sms", "email", "in_app"]).default("in_app"),
  title: z.string().max(255).optional(),
  body: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ─── GET / — List notifications for current user ────────────────────────────

app.get("/", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const isRead = c.req.query("isRead"); // "true" or "false"

  const db = getDb();

  const conditions = [eq(notifications.userId, user.id)];
  if (isRead !== undefined && isRead !== "") {
    conditions.push(eq(notifications.isRead, isRead === "true"));
  }

  const whereClause = and(...conditions);

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
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

// ─── POST / — Create notification (admin/dispatcher) ───────────────────────

app.post("/", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin" && user.role !== "dispatcher") {
    return c.json({ error: "Forbidden: admin or dispatcher access required" }, 403);
  }

  const body = await c.req.json();
  const parsed = createNotificationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [created] = await db
    .insert(notifications)
    .values({
      userId: parsed.data.userId,
      channel: parsed.data.channel,
      title: parsed.data.title,
      body: parsed.data.body,
      metadata: parsed.data.metadata,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── PATCH /:id/read — Mark notification as read ───────────────────────────

app.patch("/:id/read", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = getDb();

  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .returning();

  if (!updated) {
    return c.json({ error: "Notification not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── PATCH /read-all — Mark all notifications as read ──────────────────────

app.patch("/read-all", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.userId, user.id), eq(notifications.isRead, false))
    )
    .returning();

  return c.json({
    data: { updatedCount: result.length },
    message: `Marked ${result.length} notifications as read`,
  });
});

// ─── DELETE /:id — Delete notification ──────────────────────────────────────

app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = getDb();

  const [deleted] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Notification not found" }, 404);
  }

  return c.json({ message: "Notification deleted" });
});

export default app;
