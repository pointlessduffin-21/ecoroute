import { Hono } from "hono";
import { z } from "zod";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../config/database";
import { subdivisions, users, smartBins } from "../db/schema";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createSubdivisionSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  geofence: z.string().optional(),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
});

const updateSubdivisionSchema = createSubdivisionSchema.partial();

// ─── GET / — List all subdivisions (admin only, paginated) ──────────────────

app.get("/", async (c) => {
  const user = c.get("user");

  if (user.role !== "admin" && user.role !== "dispatcher") {
    return c.json({ error: "Forbidden: admin or dispatcher access required" }, 403);
  }

  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");

  const db = getDb();

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(subdivisions)
      .orderBy(desc(subdivisions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subdivisions),
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

// ─── GET /:id — Get subdivision by ID ───────────────────────────────────────

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const subdivision = await db
    .select()
    .from(subdivisions)
    .where(eq(subdivisions.id, id))
    .limit(1);

  if (subdivision.length === 0) {
    return c.json({ error: "Subdivision not found" }, 404);
  }

  // Get users in this subdivision
  const subUsers = await db.select({
    id: users.id,
    fullName: users.fullName,
    email: users.email,
    role: users.role,
    isActive: users.isActive,
  }).from(users).where(eq(users.subdivisionId, id));

  // Get bins in this subdivision
  const subBins = await db.select({
    id: smartBins.id,
    deviceCode: smartBins.deviceCode,
    status: smartBins.status,
    capacityLiters: smartBins.capacityLiters,
  }).from(smartBins).where(eq(smartBins.subdivisionId, id));

  return c.json({
    data: {
      ...subdivision[0],
      users: subUsers,
      bins: subBins,
      userCount: subUsers.length,
      binCount: subBins.length,
    }
  });
});

// ─── POST / — Create subdivision ────────────────────────────────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createSubdivisionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [created] = await db
    .insert(subdivisions)
    .values({
      name: parsed.data.name,
      code: parsed.data.code,
      geofence: parsed.data.geofence,
      address: parsed.data.address,
      contactEmail: parsed.data.contactEmail,
      contactPhone: parsed.data.contactPhone,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── PUT /:id — Update subdivision ──────────────────────────────────────────

app.put("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateSubdivisionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [updated] = await db
    .update(subdivisions)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(subdivisions.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Subdivision not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── DELETE /:id — Soft delete (set is_active = false) ──────────────────────

app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [updated] = await db
    .update(subdivisions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(subdivisions.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Subdivision not found" }, 404);
  }

  return c.json({ data: updated, message: "Subdivision deactivated" });
});

// ─── POST /:id/assign-user — Assign user to subdivision ─────────────────────

app.post("/:id/assign-user", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);

  const body = await c.req.json();
  const { userId } = body;
  if (!userId) return c.json({ error: "userId is required" }, 400);

  const db = getDb();

  const [updated] = await db.update(users)
    .set({ subdivisionId: id, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ data: updated });
});

// ─── POST /:id/assign-bin — Assign bin to subdivision ───────────────────────

app.post("/:id/assign-bin", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);

  const body = await c.req.json();
  const { binId } = body;
  if (!binId) return c.json({ error: "binId is required" }, 400);

  const db = getDb();

  const [updated] = await db.update(smartBins)
    .set({ subdivisionId: id, updatedAt: new Date() })
    .where(eq(smartBins.id, binId))
    .returning();

  if (!updated) return c.json({ error: "Bin not found" }, 404);
  return c.json({ data: updated });
});

export default app;
