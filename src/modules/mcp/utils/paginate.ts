/**
 * MCP Module — Portable Pagination Helper
 *
 * Standardized pagination metadata shared by all MCP list tools.
 * Portable: zero imports from app business logic, Next.js, or Node built-ins.
 */

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * Build pagination metadata from the total record count, requested page,
 * and page size. Returns `{ page, pageSize, total, totalPages }`.
 *
 * Usage in every `*.list` tool:
 *   const [rows, total] = await Promise.all([query, count]);
 *   const meta = paginate(total, page, pageSize);
 */
export function paginate(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
