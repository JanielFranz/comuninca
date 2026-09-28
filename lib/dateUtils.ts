import type { CalendarView, WeekStart } from "./types"

const LOCALE = "es-PE"

export function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** Formats a Date as a "YYYY-MM-DD" key used to index events. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(str: string): Date {
  const [y, m, day] = str.split("-").map(Number)
  return new Date(y, m - 1, day)
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

export function startOfWeek(d: Date, weekStart: WeekStart): Date {
  const dow = d.getDay()
  const diff = weekStart === "monday" ? (dow + 6) % 7 : dow
  return addDays(d, -diff)
}

/** "14:30" -> "2:30 p.m." */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h >= 12 ? "p.m." : "a.m."
  let hr = h % 12
  if (hr === 0) hr = 12
  return `${hr}${m ? ":" + pad(m) : ""} ${period}`
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export function addMinutesStr(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number)
  let total = h * 60 + m + mins
  total = ((total % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** "July 2026" -> "julio de 2026" */
export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" })
}

/** "Friday, July 17" -> "viernes, 17 de julio" */
export function fmtDayHeader(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/** "Jul 17 – Jul 23, 2026" -> "17 jul. – 23 jul. 2026" */
export function fmtWeekRange(start: Date, end: Date): string {
  const a = start.toLocaleDateString(LOCALE, { month: "short", day: "numeric" })
  const b = end.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return `${a} – ${b}`
}

/** Instant (ISO string or Date) -> "15 may 2026", in Lima time (es-PE). */
export function fmtDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Lima",
  })
}

/**
 * Date-only value (DB `date` column, serialized as midnight UTC) ->
 * "15 may 1990". Uses UTC so the process timezone can never shift the day.
 */
export function fmtDateOnly(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

let uidCounter = 1
export function nextId(): string {
  return `ev${Date.now()}-${uidCounter++}`
}

export const LIMA_TIME_ZONE = "America/Lima"

/**
 * "YYYY-MM-DD" key of the calendar day `now` falls on in Lima time,
 * independent of the process timezone. `now` is injectable for tests.
 */
export function todayKeyInLima(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** Date-only DB value (midnight UTC) -> "YYYY-MM-DD" with no day shift. */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" -> midnight-UTC Date, or null if not a real calendar day. */
export function parseUtcDateKey(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime()) || utcDateKey(d) !== value) return null
  return d
}

/**
 * "HH:MM" (24h) wall-clock time of `now` in Lima, minute resolution,
 * independent of the process timezone. `now` is injectable for tests.
 */
export function timeKeyInLima(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LIMA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("hour")}:${get("minute")}`
}

// ---- Calendar navigation window (feature #19) ----
// Kept in sync BY DESIGN with `EVENTS_WINDOW_MONTHS` in `lib/eventsQuery.ts`
// (feature #14's data-fetch window): the UI can never navigate to a period
// whose events were not already fetched.
export const NAVIGATION_WINDOW_MONTHS = 3

/** "YYYY-MM" key of a date's calendar month; zero-padded so it sorts lexically. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function windowEdges(today: Date): { min: Date; max: Date } {
  const anchor = startOfMonth(today)
  return {
    min: addMonths(anchor, -NAVIGATION_WINDOW_MONTHS),
    max: addMonths(anchor, NAVIGATION_WINDOW_MONTHS),
  }
}

/**
 * True when `date`'s calendar month falls within
 * `[today's month - NAVIGATION_WINDOW_MONTHS, today's month + NAVIGATION_WINDOW_MONTHS]`
 * (AC 3.3.7), inclusive of both edges.
 */
export function isMonthInWindow(date: Date, today: Date): boolean {
  const { min, max } = windowEdges(today)
  const key = monthKey(date)
  return key >= monthKey(min) && key <= monthKey(max)
}

/**
 * Returns `date` unchanged when its month is inside the navigation window,
 * otherwise the earliest or latest allowed month's 1st-of-month `Date`
 * (whichever edge was exceeded). Never throws.
 */
export function clampMonthDate(date: Date, today: Date): Date {
  const { min, max } = windowEdges(today)
  const key = monthKey(date)
  if (key < monthKey(min)) return min
  if (key > monthKey(max)) return max
  return date
}

/**
 * AC 3.3.11: a week is considered "entirely outside the window" (and thus
 * blocked from navigation) only if EVERY one of its 7 days falls in a month
 * outside the window — i.e. the week's last day is still before the
 * window's start month, or the week's first day is already after the
 * window's end month. A week that straddles either boundary (some days
 * in-window, some not) remains navigable.
 */
export function isWeekInWindow(weekStart: Date, today: Date): boolean {
  const { min, max } = windowEdges(today)
  const weekEnd = addDays(weekStart, 6)
  if (monthKey(weekEnd) < monthKey(min)) return false
  if (monthKey(weekStart) > monthKey(max)) return false
  return true
}

/**
 * Parses a `view` URL search-param value. Returns `"week"` only for the
 * exact string `"week"`; every other value (missing, wrong case, an array
 * from a repeated query param, a number, garbage) falls back to `"month"`.
 * Never throws.
 */
export function parseViewParam(value: unknown): CalendarView {
  return value === "week" ? "week" : "month"
}

/**
 * Parses a `date` URL search-param value ("YYYY-MM-DD"). Falls back to
 * `today` when the value is missing, not a string, malformed, or not a real
 * calendar date; the result — including the `today` fallback — is always
 * run through `clampMonthDate` before being returned, so a garbage or
 * stale/out-of-range URL param degrades to a safe in-window date and NEVER
 * causes a throw (the Server Component clamps instead of erroring).
 */
export function parseCalendarDateParam(value: unknown, today: Date): Date {
  let candidate = today
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseDateKey(value)
    if (!Number.isNaN(parsed.getTime()) && dateKey(parsed) === value) {
      candidate = parsed
    }
  }
  return clampMonthDate(candidate, today)
}

export type NavDirection = "prev" | "next"

/**
 * Computes the candidate `currentDate` a Prev/Next click would move to, or
 * `null` when that click would be a no-op at the navigation window's edge
 * (AC 3.3.8 / 3.3.9 in month view, AC 3.3.11 in week view). Pure and
 * framework-free so it is directly unit-testable and is the single source
 * of truth `CalendarApp` uses both to perform the navigation and to decide
 * whether the Prev/Next button should render disabled.
 */
export function computeNavStep(
  direction: NavDirection,
  currentDate: Date,
  view: CalendarView,
  today: Date,
  weekStart: WeekStart,
): Date | null {
  if (view === "month") {
    const candidate = addMonths(currentDate, direction === "prev" ? -1 : 1)
    return isMonthInWindow(candidate, today) ? candidate : null
  }
  const candidate = addDays(currentDate, direction === "prev" ? -7 : 7)
  const candidateWeekStart = startOfWeek(candidate, weekStart)
  return isWeekInWindow(candidateWeekStart, today) ? candidate : null
}
