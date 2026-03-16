import { Hono } from "hono";
import { desc, eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../config/database";
import { feedback, faqs, users } from "../db/schema";
import { requireRole } from "../middleware/rbac";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createFeedbackSchema = z.object({
  category: z.string().min(1).max(50),
  message: z.string().min(1),
});

const replyFeedbackSchema = z.object({
  adminReply: z.string().min(1),
  status: z.enum(["open", "in-progress", "resolved"]).optional(),
});

const createFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

const updateFaqSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  category: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

// ─── GET /feedback — List feedback ──────────────────────────────────────────

app.get("/feedback", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
  const offset = Number(c.req.query("offset") || "0");
  const db = getDb();

  const isAdminOrDispatcher = user.role === "admin" || user.role === "dispatcher";

  const conditions = isAdminOrDispatcher ? [] : [eq(feedback.userId, user.id)];

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: feedback.id,
        userId: feedback.userId,
        subdivisionId: feedback.subdivisionId,
        category: feedback.category,
        message: feedback.message,
        status: feedback.status,
        adminReply: feedback.adminReply,
        repliedAt: feedback.repliedAt,
        createdAt: feedback.createdAt,
        userName: users.fullName,
        userEmail: users.email,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return c.json({
    data: items,
    pagination: { total: countResult[0]!.count, limit, offset },
  });
});

// ─── POST /feedback — Create feedback ───────────────────────────────────────

app.post("/feedback", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createFeedbackSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [created] = await db
    .insert(feedback)
    .values({
      userId: user.id,
      subdivisionId: user.subdivisionId,
      category: parsed.data.category,
      message: parsed.data.message,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── PUT /feedback/:id/reply — Admin reply to feedback ──────────────────────

app.put("/feedback/:id/reply", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = replyFeedbackSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [updated] = await db
    .update(feedback)
    .set({
      adminReply: parsed.data.adminReply,
      status: parsed.data.status ?? "resolved",
      repliedAt: new Date(),
    })
    .where(eq(feedback.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Feedback not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── GET /faqs — List published FAQs ────────────────────────────────────────

app.get("/faqs", async (c) => {
  const db = getDb();
  const user = c.get("user");
  const isAdmin = user.role === "admin";

  const conditions = isAdmin ? [] : [eq(faqs.isPublished, true)];

  const items = await db
    .select()
    .from(faqs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(faqs.sortOrder, faqs.createdAt);

  return c.json({ data: items });
});

// ─── POST /faqs — Create FAQ (admin only) ───────────────────────────────────

app.post("/faqs", requireRole("admin"), async (c) => {
  const body = await c.req.json();
  const parsed = createFaqSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const user = c.get("user");

  const [created] = await db
    .insert(faqs)
    .values({
      subdivisionId: user.subdivisionId,
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category,
      sortOrder: parsed.data.sortOrder,
      isPublished: parsed.data.isPublished ?? true,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── PUT /faqs/:id — Update FAQ (admin only) ────────────────────────────────

app.put("/faqs/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateFaqSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [updated] = await db
    .update(faqs)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(faqs.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "FAQ not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── DELETE /faqs/:id — Delete FAQ (admin only) ─────────────────────────────

app.delete("/faqs/:id", requireRole("admin"), async (c) => {
  const id = c.req.param("id");
  const db = getDb();

  const [deleted] = await db
    .delete(faqs)
    .where(eq(faqs.id, id))
    .returning({ id: faqs.id });

  if (!deleted) {
    return c.json({ error: "FAQ not found" }, 404);
  }

  return c.json({ message: "FAQ deleted" });
});

export default app;
