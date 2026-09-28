/**
 * Feature #19 — ±3-month calendar navigation window (AC 3.3.5, 3.3.7–3.3.11).
 *
 * Pure-function tests, no mocks needed. Fixed "today" = 2026-09-27 (this
 * session's actual date) unless a test explicitly needs a different `today`
 * to exercise a January/December year-rollover.
 */
import { describe, expect, it } from "vitest"
import {
  clampMonthDate,
  computeNavStep,
  isMonthInWindow,
  isWeekInWindow,
  monthKey,
  parseCalendarDateParam,
  parseViewParam,
} from "@/lib/dateUtils"

function d(y: number, m: number, day: number): Date {
  return new Date(y, m - 1, day)
}

const TODAY = d(2026, 9, 27) // September 2026; window = [2026-06, 2026-12]

describe("monthKey", () => {
  it("formats a zero-padded YYYY-MM key", () => {
    expect(monthKey(d(2026, 1, 5))).toBe("2026-01")
    expect(monthKey(d(2026, 12, 31))).toBe("2026-12")
  })
})

describe("isMonthInWindow / clampMonthDate", () => {
  it("keeps the current month unchanged", () => {
    const date = d(2026, 9, 15)
    expect(isMonthInWindow(date, TODAY)).toBe(true)
    expect(clampMonthDate(date, TODAY)).toBe(date)
  })

  it("keeps exactly 3 months before (the earliest edge) unchanged", () => {
    const date = d(2026, 6, 1)
    expect(isMonthInWindow(date, TODAY)).toBe(true)
    expect(clampMonthDate(date, TODAY)).toBe(date)
  })

  it("keeps exactly 3 months after (the latest edge) unchanged", () => {
    const date = d(2026, 12, 1)
    expect(isMonthInWindow(date, TODAY)).toBe(true)
    expect(clampMonthDate(date, TODAY)).toBe(date)
  })

  it("clamps 4 months before to the earliest allowed month", () => {
    const date = d(2026, 5, 15)
    expect(isMonthInWindow(date, TODAY)).toBe(false)
    expect(monthKey(clampMonthDate(date, TODAY))).toBe("2026-06")
  })

  it("clamps 4 months after to the latest allowed month", () => {
    const date = d(2027, 1, 15)
    expect(isMonthInWindow(date, TODAY)).toBe(false)
    expect(monthKey(clampMonthDate(date, TODAY))).toBe("2026-12")
  })

  it("year-rollover forward: today in November, +3 months crosses into next year", () => {
    const today = d(2026, 11, 27) // window = [2026-08, 2027-02]
    const atEdge = d(2027, 2, 10)
    expect(isMonthInWindow(atEdge, today)).toBe(true)
    const oneOver = d(2027, 3, 5)
    expect(isMonthInWindow(oneOver, today)).toBe(false)
    expect(monthKey(clampMonthDate(oneOver, today))).toBe("2027-02")
  })

  it("year-rollover backward: today in February, -3 months crosses into previous year", () => {
    const today = d(2026, 2, 15) // window = [2025-11, 2026-05]
    const atEdge = d(2025, 11, 20)
    expect(isMonthInWindow(atEdge, today)).toBe(true)
    const oneUnder = d(2025, 10, 5)
    expect(isMonthInWindow(oneUnder, today)).toBe(false)
    expect(monthKey(clampMonthDate(oneUnder, today))).toBe("2025-11")
  })
})

describe("isWeekInWindow", () => {
  it("a week entirely inside the window is navigable", () => {
    expect(isWeekInWindow(d(2026, 9, 20), TODAY)).toBe(true)
  })

  it("a week entirely 4+ months before the window is blocked", () => {
    // April 2026: 1..7, both endpoints before the 2026-06 window start.
    expect(isWeekInWindow(d(2026, 4, 1), TODAY)).toBe(false)
  })

  it("a week entirely 4+ months after the window is blocked", () => {
    // February 2027: 1..7, both endpoints after the 2026-12 window end.
    expect(isWeekInWindow(d(2027, 2, 1), TODAY)).toBe(false)
  })

  it("a week straddling the near (earliest) boundary stays navigable", () => {
    // May 29 - Jun 4, 2026: some days in May (out), some in June (in).
    expect(isWeekInWindow(d(2026, 5, 29), TODAY)).toBe(true)
  })

  it("a week straddling the far (latest) boundary stays navigable", () => {
    // Dec 28, 2026 - Jan 3, 2027: some days in Dec (in), some in Jan (out).
    expect(isWeekInWindow(d(2026, 12, 28), TODAY)).toBe(true)
  })
})

describe("parseViewParam", () => {
  it('returns "week" only for the exact string "week"', () => {
    expect(parseViewParam("week")).toBe("week")
  })

  it.each(["month", undefined, "", "WEEK", ["week", "month"], 123])(
    'falls back to "month" for %j',
    (value) => {
      expect(parseViewParam(value)).toBe("month")
    },
  )
})

describe("parseCalendarDateParam", () => {
  it("passes through a valid in-window date string unchanged", () => {
    const result = parseCalendarDateParam("2026-09-15", TODAY)
    expect(result.getTime()).toBe(d(2026, 9, 15).getTime())
  })

  it("clamps a valid but out-of-window date string to the nearest edge", () => {
    const result = parseCalendarDateParam("2026-05-01", TODAY)
    expect(monthKey(result)).toBe("2026-06")
  })

  it.each([
    undefined,
    "",
    "not-a-date",
    "2026-13-40",
    ["2026-09-15"],
    20260915,
  ])('falls back to "today" and never throws for %j', (value) => {
    expect(() => parseCalendarDateParam(value, TODAY)).not.toThrow()
    const result = parseCalendarDateParam(value, TODAY)
    expect(result.getTime()).toBe(TODAY.getTime())
  })
})

describe("computeNavStep", () => {
  it("month view: no-ops at the earliest allowed month", () => {
    const current = d(2026, 6, 15)
    expect(computeNavStep("prev", current, "month", TODAY, "sunday")).toBeNull()
  })

  it("month view: no-ops at the latest allowed month", () => {
    const current = d(2026, 12, 10)
    expect(computeNavStep("next", current, "month", TODAY, "sunday")).toBeNull()
  })

  it("month view: moves back one month everywhere else", () => {
    const current = d(2026, 9, 15)
    const result = computeNavStep("prev", current, "month", TODAY, "sunday")
    expect(result).not.toBeNull()
    expect(monthKey(result as Date)).toBe("2026-08")
  })

  it("month view: moves forward one month everywhere else", () => {
    const current = d(2026, 9, 15)
    const result = computeNavStep("next", current, "month", TODAY, "sunday")
    expect(result).not.toBeNull()
    expect(monthKey(result as Date)).toBe("2026-10")
  })

  it("week view: no-ops when the previous week is entirely outside the window", () => {
    const current = d(2026, 6, 3) // near the earliest edge
    expect(computeNavStep("prev", current, "week", TODAY, "sunday")).toBeNull()
  })

  it("week view: no-ops when the next week is entirely outside the window", () => {
    const current = d(2026, 12, 29) // near the latest edge
    expect(computeNavStep("next", current, "week", TODAY, "sunday")).toBeNull()
  })

  it("week view: moves forward 7 days everywhere else", () => {
    const current = d(2026, 9, 15)
    const result = computeNavStep("next", current, "week", TODAY, "sunday")
    expect(result).not.toBeNull()
    expect((result as Date).getTime()).toBe(d(2026, 9, 22).getTime())
  })

  it("week view: moves back 7 days everywhere else", () => {
    const current = d(2026, 9, 15)
    const result = computeNavStep("prev", current, "week", TODAY, "sunday")
    expect(result).not.toBeNull()
    expect((result as Date).getTime()).toBe(d(2026, 9, 8).getTime())
  })
})
