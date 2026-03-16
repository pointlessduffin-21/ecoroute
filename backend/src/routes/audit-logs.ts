import { Hono } from "hono";
import { desc, sql, eq } from "drizzle-orm";
import { getDb } from "../config/database";
import { auditLogs, users } from "../db/schema";
import { requireRole } from "../middleware/rbac";
import type { AppVariables } from "../types/context";

const app = new Hono<{ Variables: AppVariables }>();

app.use("/*", requireRole("admin"));

app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
  const offset = Number(c.req.query("offset") || "0");
  const db = getDb();

  const [items, countResult] = await Promise.all([
    db.select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      entityId: auditLogs.entityId,
      entityType: auditLogs.entityType,
      action: auditLogs.action,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      userEmail: users.email,
      userName: users.fullName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
  ]);

  return c.json({ data: items, pagination: { total: countResult[0]!.count, limit, offset } });
});

export default app;
