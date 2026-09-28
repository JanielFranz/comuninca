/** Pure helpers for the admin invite-codes list (no I/O). */

export const CODES_PAGE_SIZE = 25

export const CODE_STATUSES = ["UNUSED", "USED", "EXPIRED"] as const
export type CodeStatus = (typeof CODE_STATUSES)[number]

/** Untrusted status value -> a known status, or null meaning "all". */
export function parseCodeStatus(value: unknown): CodeStatus | null {
  return typeof value === "string" &&
    (CODE_STATUSES as readonly string[]).includes(value)
    ? (value as CodeStatus)
    : null
}

/** Link to a codes page preserving the status filter (page 1 is implicit). */
export function buildCodesHref(
  base: string,
  page: number,
  status: CodeStatus | null,
): string {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  if (page > 1) params.set("page", String(page))
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
