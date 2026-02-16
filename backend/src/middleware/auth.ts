import type { MiddlewareHandler } from "hono";
import { getDb } from "../config/database";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { env, useSupabaseAuth } from "../config/env";
import type { AppVariables } from "../types/context";
import jwt from "jsonwebtoken";

export const authMiddleware: MiddlewareHandler<{
  Variables: AppVariables;
}> = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or malformed Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  if (!token) {
    return c.json({ error: "Missing authentication token" }, 401);
  }

  const db = getDb();

  if (useSupabaseAuth) {
    // --- Supabase Auth mode ---
    const { getSupabaseAdmin } = await import("../config/supabase");
    const {
      data: { user: supabaseUser },
      error,
    } = await getSupabaseAdmin().auth.getUser(token);

    if (error || !supabaseUser) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    const [localUser] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        subdivisionId: users.subdivisionId,
      })
      .from(users)
      .where(eq(users.supabaseUid, supabaseUser.id))
      .limit(1);

    if (!localUser) {
      return c.json({ error: "User not found in application database" }, 401);
    }

    c.set("user", {
      id: localUser.id,
      email: localUser.email,
      fullName: localUser.fullName,
      role: localUser.role,
      subdivisionId: localUser.subdivisionId,
    });
  } else {
    // --- Local JWT mode (dev/demo without Supabase) ---
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
      };

      const [localUser] = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          subdivisionId: users.subdivisionId,
        })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (!localUser) {
        return c.json({ error: "User not found" }, 401);
      }

      c.set("user", {
        id: localUser.id,
        email: localUser.email,
        fullName: localUser.fullName,
        role: localUser.role,
        subdivisionId: localUser.subdivisionId,
      });
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  }

  await next();
};
