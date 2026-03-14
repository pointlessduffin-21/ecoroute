import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../config/database";
import { users } from "../db/schema";
import { requireRole } from "../middleware/rbac";
import { useSupabaseAuth } from "../config/env";
import { hashPassword } from "../utils/password";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

// All user management routes require admin role
app.use("/*", requireRole("admin"));

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(255),
  role: z.enum(["admin", "dispatcher", "driver", "maintenance"]).default("driver"),
  phone: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
  subdivisionId: z.string().uuid().optional(),
  password: z.string().min(8).max(128),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  role: z.enum(["admin", "dispatcher", "driver", "maintenance"]).optional(),
  phone: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
  subdivisionId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

// ─── GET / — List users (filterable by subdivision, role) ───────────────────

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "20"), 100);
  const offset = Number(c.req.query("offset") || "0");
  const subdivisionId = c.req.query("subdivisionId");
  const role = c.req.query("role") as "admin" | "dispatcher" | "driver" | undefined;

  const db = getDb();

  const conditions = [];
  if (subdivisionId) {
    conditions.push(eq(users.subdivisionId, subdivisionId));
  }
  if (role) {
    conditions.push(eq(users.role, role));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
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

// ─── GET /:id — Get user by ID ─────────────────────────────────────────────

app.get("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ data: result[0] });
});

// ─── POST / — Create user (also creates Supabase auth user) ────────────────

app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const { password, ...userData } = parsed.data;
  const db = getDb();

  // Check for duplicate email
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, userData.email))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "Email already in use" }, 400);
  }

  if (useSupabaseAuth) {
    const { getSupabaseAdmin } = await import("../config/supabase");
    const supabase = getSupabaseAdmin();

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: userData.email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return c.json({ error: "Failed to create auth user", details: authError.message }, 500);
    }

    const [created] = await db
      .insert(users)
      .values({
        ...userData,
        supabaseUid: authData.user.id,
      })
      .returning();

    return c.json({ data: created }, 201);
  } else {
    // Local JWT mode — hash password and store locally
    const pwHash = await hashPassword(password);

    const [created] = await db
      .insert(users)
      .values({
        ...userData,
        passwordHash: pwHash,
      })
      .returning();

    return c.json({ data: created }, 201);
  }
});

// ─── PUT /:id — Update user ────────────────────────────────────────────────

app.put("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  const [updated] = await db
    .update(users)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── DELETE /:id — Soft delete (set is_active = false) ──────────────────────

app.delete("/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [updated] = await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ data: updated, message: "User deactivated" });
});

export default app;
