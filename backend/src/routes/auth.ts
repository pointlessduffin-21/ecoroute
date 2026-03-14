import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../config/database";
import { users } from "../db/schema";
import { env, useSupabaseAuth } from "../config/env";
import { authMiddleware } from "../middleware/auth";
import type { AppVariables } from "../types/context";
import jwt from "jsonwebtoken";
import { hashPassword, verifyPassword } from "../utils/password";

const app = new Hono<{ Variables: AppVariables }>();

// Apply auth middleware to protected sub-routes
app.use("/me", authMiddleware);
app.use("/logout", authMiddleware);

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
  subdivisionId: z.string().uuid().optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
});

// ─── Helper: sign local JWT ────────────────────────────────────────────────

function signLocalJwt(userId: string, email: string): string {
  // expiresIn: 7 days in seconds
  return jwt.sign({ userId, email }, env.JWT_SECRET, {
    expiresIn: 7 * 24 * 60 * 60,
  });
}

// ─── POST /login ────────────────────────────────────────────────────────────

app.post("/login", async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  if (useSupabaseAuth) {
    // --- Supabase Auth mode ---
    const { getSupabaseClient } = await import("../config/supabase");
    const supabase = getSupabaseClient();

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

    if (authError) {
      return c.json({ error: "Invalid credentials", details: authError.message }, 401);
    }

    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.supabaseUid, authData.user.id))
      .limit(1);

    if (userResult.length === 0) {
      return c.json({ error: "User profile not found" }, 404);
    }

    if (!userResult[0]!.isActive) {
      return c.json({ error: "Account is deactivated" }, 403);
    }

    return c.json({
      data: {
        user: userResult[0],
        session: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: authData.session.expires_at,
        },
      },
    });
  } else {
    // --- Local JWT mode ---
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (userResult.length === 0) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const user = userResult[0]!;

    if (!user.isActive) {
      return c.json({ error: "Account is deactivated" }, 403);
    }

    // Verify password
    if (!user.passwordHash) {
      return c.json({ error: "Account has no password set. Contact your administrator." }, 401);
    }

    const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const accessToken = signLocalJwt(user.id, user.email);

    return c.json({
      data: {
        user,
        session: {
          accessToken,
          refreshToken: null,
          expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        },
      },
    });
  }
});

// ─── POST /register ─────────────────────────────────────────────────────────

app.post("/register", async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  if (useSupabaseAuth) {
    const { getSupabaseAdmin, getSupabaseClient } = await import("../config/supabase");
    const supabase = getSupabaseAdmin();

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
      });

    if (authError) {
      return c.json(
        { error: "Failed to create auth account", details: authError.message },
        400
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        subdivisionId: parsed.data.subdivisionId,
        supabaseUid: authData.user.id,
        role: "driver",
      })
      .returning();

    const supabaseClient = getSupabaseClient();
    const { data: sessionData } = await supabaseClient.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    return c.json(
      {
        data: {
          user: created,
          session: sessionData?.session
            ? {
                accessToken: sessionData.session.access_token,
                refreshToken: sessionData.session.refresh_token,
                expiresAt: sessionData.session.expires_at,
              }
            : null,
        },
      },
      201
    );
  } else {
    // --- Local JWT mode ---
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: "Email already in use" }, 400);
    }

    const pwHash = await hashPassword(parsed.data.password);

    const [created] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        subdivisionId: parsed.data.subdivisionId,
        passwordHash: pwHash,
        role: "driver",
      })
      .returning();

    const user = created!;
    const accessToken = signLocalJwt(user.id, user.email);

    return c.json(
      {
        data: {
          user,
          session: {
            accessToken,
            refreshToken: null,
            expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          },
        },
      },
      201
    );
  }
});

// ─── GET /me — Get current user profile ────────────────────────────────────

app.get("/me", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "User profile not found" }, 404);
  }

  return c.json({ data: result[0] });
});

// ─── PUT /me — Update current user profile ─────────────────────────────────

app.put("/me", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);

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
    .where(eq(users.id, user.id))
    .returning();

  if (!updated) {
    return c.json({ error: "User profile not found" }, 404);
  }

  return c.json({ data: updated });
});

// ─── POST /logout ───────────────────────────────────────────────────────────

app.post("/logout", async (c) => {
  if (useSupabaseAuth) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { getSupabaseAdmin } = await import("../config/supabase");
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.auth.admin.signOut(token);
      if (error) {
        console.warn("Supabase signOut error:", error.message);
      }
    }
  }
  return c.json({ message: "Logged out successfully" });
});

export default app;
