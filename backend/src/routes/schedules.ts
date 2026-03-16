import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { shiftSchedules, users, subdivisions } from "../db/schema";
import { requireRole } from "../middleware/rbac";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const createScheduleSchema = z.object({
  userId: z.string().uuid(),
  subdivisionId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const updateScheduleSchema = createScheduleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET / — List all schedules (with user and subdivision names)
app.get("/", requireRole("admin", "dispatcher"), async (c) => {
  const userId = c.req.query("userId");
  const subdivisionId = c.req.query("subdivisionId");
  const db = getDb();

  const conditions = [];
  if (userId) conditions.push(eq(shiftSchedules.userId, userId));
  if (subdivisionId) conditions.push(eq(shiftSchedules.subdivisionId, subdivisionId));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.select({
    id: shiftSchedules.id,
    userId: shiftSchedules.userId,
    subdivisionId: shiftSchedules.subdivisionId,
    dayOfWeek: shiftSchedules.dayOfWeek,
    startTime: shiftSchedules.startTime,
    endTime: shiftSchedules.endTime,
    isActive: shiftSchedules.isActive,
    createdAt: shiftSchedules.createdAt,
    updatedAt: shiftSchedules.updatedAt,
    userName: users.fullName,
    userEmail: users.email,
    subdivisionName: subdivisions.name,
  })
  .from(shiftSchedules)
  .leftJoin(users, eq(shiftSchedules.userId, users.id))
  .leftJoin(subdivisions, eq(shiftSchedules.subdivisionId, subdivisions.id))
  .where(whereClause)
  .orderBy(shiftSchedules.dayOfWeek, shiftSchedules.startTime);

  return c.json({ data: items });
});

// GET /my-schedule — Get current user's schedule (for maintenance workers)
app.get("/my-schedule", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const items = await db.select({
    id: shiftSchedules.id,
    dayOfWeek: shiftSchedules.dayOfWeek,
    startTime: shiftSchedules.startTime,
    endTime: shiftSchedules.endTime,
    isActive: shiftSchedules.isActive,
    subdivisionName: subdivisions.name,
  })
  .from(shiftSchedules)
  .leftJoin(subdivisions, eq(shiftSchedules.subdivisionId, subdivisions.id))
  .where(and(eq(shiftSchedules.userId, user.id), eq(shiftSchedules.isActive, true)))
  .orderBy(shiftSchedules.dayOfWeek, shiftSchedules.startTime);

  return c.json({ data: items });
});

// POST / — Create schedule
app.post("/", requireRole("admin", "dispatcher"), async (c) => {
  const body = await c.req.json();
  const parsed = createScheduleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);

  const db = getDb();
  const [created] = await db.insert(shiftSchedules).values(parsed.data).returning();
  return c.json({ data: created }, 201);
});

// POST /bulk — Create multiple schedules at once (for setting a weekly pattern)
app.post("/bulk", requireRole("admin", "dispatcher"), async (c) => {
  const body = await c.req.json();
  const schema = z.array(createScheduleSchema);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);

  const db = getDb();
  const created = await db.insert(shiftSchedules).values(parsed.data).returning();
  return c.json({ data: created }, 201);
});

// PUT /:id — Update schedule
app.put("/:id", requireRole("admin", "dispatcher"), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateScheduleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);

  const db = getDb();
  const [updated] = await db.update(shiftSchedules)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(shiftSchedules.id, id))
    .returning();

  if (!updated) return c.json({ error: "Schedule not found" }, 404);
  return c.json({ data: updated });
});

// DELETE /:id — Delete schedule
app.delete("/:id", requireRole("admin", "dispatcher"), async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [deleted] = await db.delete(shiftSchedules)
    .where(eq(shiftSchedules.id, id))
    .returning();

  if (!deleted) return c.json({ error: "Schedule not found" }, 404);
  return c.json({ message: "Schedule deleted" });
});

// GET /today — Get today's shifts (for scheduler to know when to trigger)
app.get("/today", requireRole("admin", "dispatcher"), async (c) => {
  const db = getDb();
  const today = new Date().getDay(); // 0-6

  const items = await db.select({
    id: shiftSchedules.id,
    userId: shiftSchedules.userId,
    subdivisionId: shiftSchedules.subdivisionId,
    dayOfWeek: shiftSchedules.dayOfWeek,
    startTime: shiftSchedules.startTime,
    endTime: shiftSchedules.endTime,
    userName: users.fullName,
    subdivisionName: subdivisions.name,
  })
  .from(shiftSchedules)
  .leftJoin(users, eq(shiftSchedules.userId, users.id))
  .leftJoin(subdivisions, eq(shiftSchedules.subdivisionId, subdivisions.id))
  .where(and(eq(shiftSchedules.dayOfWeek, today), eq(shiftSchedules.isActive, true)))
  .orderBy(shiftSchedules.startTime);

  return c.json({ data: items });
});

export default app;
