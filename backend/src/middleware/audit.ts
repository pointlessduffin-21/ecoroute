import type { Context, MiddlewareHandler } from "hono";
import { getDb } from "../config/database";
import { auditLogs } from "../db/schema";
import type { AppVariables } from "../types/context";

/**
 * Maps HTTP methods to human-readable audit action names.
 */
const METHOD_ACTION_MAP: Record<string, string> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

/**
 * Extracts the entity type from the URL path.
 *
 * Given a path like `/api/v1/smart-bins/123`, this returns `"smart-bins"`.
 * It takes the first meaningful path segment after any `/api/vN/` prefix.
 */
function extractEntityType(path: string): string {
  // Remove leading slash and split into segments
  const segments = path.replace(/^\//, "").split("/").filter(Boolean);

  // Skip common prefixes like "api" and version segments like "v1"
  let startIndex = 0;
  if (segments[startIndex] === "api") {
    startIndex++;
  }
  if (segments[startIndex] && /^v\d+$/.test(segments[startIndex]!)) {
    startIndex++;
  }

  return segments[startIndex] || "unknown";
}

/**
 * Extracts the client IP address from the request.
 * Checks common proxy headers before falling back to the
 * connection's remote address.
 */
function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

/**
 * Audit logging middleware.
 *
 * Logs mutation requests (POST, PUT, PATCH, DELETE) to the `audit_log` table
 * after the downstream handler has completed. Captures:
 *
 * - userId: from the authenticated user context (if available)
 * - entityType: derived from the URL path
 * - action: mapped from the HTTP method (create / update / delete)
 * - ipAddress: client IP address
 */
export const auditMiddleware: MiddlewareHandler<{
  Variables: AppVariables;
}> = async (c, next) => {
  // Only audit mutation methods
  const method = c.req.method.toUpperCase();
  const action = METHOD_ACTION_MAP[method];

  if (!action) {
    // GET, HEAD, OPTIONS, etc. -- skip audit logging
    await next();
    return;
  }

  // Let the downstream handler execute first
  await next();

  // Only log if the response indicates success (2xx)
  const status = c.res.status;
  if (status < 200 || status >= 300) {
    return;
  }

  // Fire-and-forget: write the audit log asynchronously so it doesn't
  // block the response. Errors are caught and logged, not propagated.
  try {
    const user = c.get("user");
    const entityType = extractEntityType(c.req.path);
    const ipAddress = getClientIp(c);

    const db = getDb();
    await db.insert(auditLogs).values({
      userId: user?.id ?? null,
      entityType,
      action,
      ipAddress,
    });
  } catch (err) {
    // Log the error but don't fail the request
    console.error("[audit] Failed to write audit log:", err);
  }
};
