import { afterEach, describe, expect, it } from "vitest"
import {
  parseUtcDateKey,
  timeKeyInLima,
  todayKeyInLima,
  utcDateKey,
} from "@/lib/dateUtils"

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe("timeKeyInLima", () => {
  it.each([
    ["2026-09-26T05:00:00Z", "00:00"],
    ["2026-09-27T04:59:59Z", "23:59"],
    ["2026-10-01T03:00:00Z", "22:00"],
    ["2026-09-26T20:30:45Z", "15:30"],
  ])("%s -> %s", (iso, expected) => {
    expect(timeKeyInLima(new Date(iso))).toBe(expected)
  })
})

describe("Lima clock helpers are process-timezone independent", () => {
  it.each(["UTC", "Pacific/Auckland", "America/Lima"])("TZ=%s", (tz) => {
    process.env.TZ = tz
    const at = new Date("2026-10-01T03:00:00Z")
    expect(todayKeyInLima(at)).toBe("2026-09-30")
    expect(timeKeyInLima(at)).toBe("22:00")
    expect(todayKeyInLima(new Date("2026-09-26T05:00:00Z"))).toBe("2026-09-26")
    expect(timeKeyInLima(new Date("2026-09-26T05:00:00Z"))).toBe("00:00")
    expect(timeKeyInLima(new Date("2026-09-27T04:59:59Z"))).toBe("23:59")
    const d = parseUtcDateKey("2026-09-30")
    expect(d?.toISOString()).toBe("2026-09-30T00:00:00.000Z")
    expect(d && utcDateKey(d)).toBe("2026-09-30")
    expect(parseUtcDateKey("2026-02-30")).toBeNull()
  })
})
