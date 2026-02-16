import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ─── Custom error classes ────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: ContentfulStatusCode;

  constructor(message: string, statusCode: ContentfulStatusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message = "Validation failed", details?: unknown) {
    super(message, 422);
    this.details = details;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

// ─── Hono error handler middleware ───────────────────────────────────────────

/**
 * Global error handler for Hono applications.
 *
 * Catches `AppError` subclasses and returns a structured JSON response with
 * the appropriate HTTP status code. Unknown errors are treated as 500 Internal
 * Server Error, with the actual error message hidden in production.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { errorHandler } from "./utils/errors";
 *
 * const app = new Hono();
 * app.onError(errorHandler);
 * ```
 */
export function errorHandler(err: Error, c: Context): Response {
  // Known application errors
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success: false,
      error: {
        type: err.name,
        message: err.message,
        statusCode: err.statusCode,
      },
    };

    // Include validation details when available
    if (err instanceof ValidationError && err.details) {
      (body.error as Record<string, unknown>).details = err.details;
    }

    return c.json(body, err.statusCode);
  }

  // Unexpected errors
  const isProduction = process.env.NODE_ENV === "production";

  console.error("[error-handler] Unhandled error:", err);

  return c.json(
    {
      success: false,
      error: {
        type: "InternalServerError",
        message: isProduction
          ? "An unexpected error occurred"
          : err.message || "An unexpected error occurred",
        statusCode: 500,
      },
    },
    500
  );
}

/**
 * Convenience middleware that wraps an async route handler and forwards thrown
 * errors to the Hono error handler.
 *
 * While Hono already catches async errors in most cases, this wrapper
 * provides an explicit pattern for route-level try/catch:
 *
 * @example
 * ```ts
 * import { asyncHandler } from "./utils/errors";
 *
 * app.get("/bins/:id", asyncHandler(async (c) => {
 *   const bin = await getBin(c.req.param("id"));
 *   if (!bin) throw new NotFoundError("Bin not found");
 *   return c.json({ data: bin });
 * }));
 * ```
 */
export function asyncHandler(
  fn: (c: Context) => Promise<Response>
): (c: Context) => Promise<Response> {
  return async (c: Context) => {
    try {
      return await fn(c);
    } catch (err) {
      if (err instanceof Error) {
        throw err; // re-throw so Hono's onError catches it
      }
      throw new AppError("Unknown error", 500);
    }
  };
}
