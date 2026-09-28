/** Pure helpers for the admin users list (no I/O). */

export const USERS_PAGE_SIZE = 20
export const USERS_SEARCH_MAX_LENGTH = 100

/** Untrusted page value -> integer >= 1. Anything odd becomes 1. */
export function parsePage(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 1 ? n : 1
}

/** Untrusted search value -> trimmed, length-capped string ("" = no search). */
export function normalizeSearch(value: unknown): string {
  if (typeof value !== "string") return ""
  // Strip NUL/control characters first: Postgres rejects NUL in text params.
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "")
  return clean.slice(0, USERS_SEARCH_MAX_LENGTH).trim()
}

/**
 * Prisma 7 passes `contains` values to ILIKE unescaped (verified by capturing
 * the generated SQL), so `%`, `_` and the escape character `\` typed by the
 * admin would act as wildcards. Escape them (backslash is Postgres' default
 * LIKE escape character).
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&")
}

export function computePageCount(
  matching: number,
  pageSize: number = USERS_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(matching / pageSize))
}

export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), pageCount)
}

/** Link to a users page that preserves the search term (URL-encoded). */
export function buildUsersHref(base: string, page: number, q: string): string {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
