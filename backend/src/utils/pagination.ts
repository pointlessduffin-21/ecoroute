// ─── Pagination helpers for Hono API routes ─────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface PaginationParams {
  offset: number;
  limit: number;
}

interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Parse page and limit from incoming query parameters and return the
 * corresponding SQL offset and clamped limit.
 *
 * - `page` defaults to 1 and is clamped to >= 1
 * - `limit` defaults to 20 and is clamped between 1 and 100
 *
 * @example
 * ```ts
 * app.get("/bins", async (c) => {
 *   const { offset, limit } = parsePagination(c.req.query());
 *   const rows = await db.select().from(smartBins).offset(offset).limit(limit);
 * });
 * ```
 */
export function parsePagination(
  query: Record<string, string | undefined>
): PaginationParams {
  let page = parseInt(query.page ?? "", 10);
  let limit = parseInt(query.limit ?? "", 10);

  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  if (isNaN(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  }

  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const offset = (page - 1) * limit;

  return { offset, limit };
}

/**
 * Build a standardised pagination metadata object suitable for inclusion in
 * JSON API responses.
 *
 * @param page     - Current page number (1-based)
 * @param limit    - Items per page
 * @param totalItems - Total number of items matching the query (before pagination)
 *
 * @example
 * ```ts
 * const meta = buildPaginationMeta(2, 20, 95);
 * // { page: 2, limit: 20, totalItems: 95, totalPages: 5, hasNextPage: true, hasPreviousPage: true }
 * ```
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Convenience wrapper: build a complete paginated response envelope.
 *
 * @example
 * ```ts
 * app.get("/bins", async (c) => {
 *   const { offset, limit } = parsePagination(c.req.query());
 *   const [rows, [{ count }]] = await Promise.all([
 *     db.select().from(smartBins).offset(offset).limit(limit),
 *     db.select({ count: sql<number>`count(*)` }).from(smartBins),
 *   ]);
 *   const page = Math.floor(offset / limit) + 1;
 *   return c.json(buildPaginatedResponse(rows, page, limit, Number(count)));
 * });
 * ```
 */
export function buildPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  totalItems: number
): PaginatedResponse<T> {
  return {
    data,
    pagination: buildPaginationMeta(page, limit, totalItems),
  };
}
