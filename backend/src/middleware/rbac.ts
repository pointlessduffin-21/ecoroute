import type { Context, MiddlewareHandler } from "hono";
import type { AppVariables } from "../types/context";

/**
 * Role-based access control middleware factory.
 *
 * Returns a middleware handler that checks whether the authenticated user's
 * role is included in the list of allowed roles. Must be used after the
 * auth middleware so that `c.get("user")` is available.
 *
 * @param roles - One or more roles that are permitted to access the route.
 * @returns A Hono middleware handler.
 *
 * @example
 * ```ts
 * app.get("/admin/stats", authMiddleware, requireRole("admin"), handler);
 * app.post("/routes", authMiddleware, requireRole("admin", "dispatcher"), handler);
 * ```
 */
export function requireRole(
  ...roles: string[]
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json(
        {
          error: "Forbidden",
          message: `This action requires one of the following roles: ${roles.join(", ")}`,
        },
        403
      );
    }

    await next();
  };
}
