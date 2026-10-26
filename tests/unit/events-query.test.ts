import { describe, expect, it } from "vitest"
import { CATEGORY_ORDER } from "@/lib/constants"
import { parseUtcDateKey, todayKeyInLima, utcDateKey } from "@/lib/dateUtils"
import {
  clampEventsWindow,
  collectPeople,
  mapEventRow,
  maxEventsWindow,
  toCategoryKey,
  type EventRow,
} from "@/lib/eventsQuery"

function withTimeZones(zones: string[], fn: (tz: string) => void) {
  const original = process.env.TZ
  try {
    for (const tz of zones) {
      process.env.TZ = tz
      fn(tz)
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}

describe("todayKeyInLima", () => {
  it("uses the Lima calendar day, not the UTC one", () => {
    // 03:00Z on Oct 1 is 22:00 on Sep 30 in Lima (UTC-5).
    expect(todayKeyInLima(new Date("2026-10-01T03:00:00Z"))).toBe("2026-09-30")
    expect(todayKeyInLima(new Date("2026-10-01T05:00:00Z"))).toBe("2026-10-01")
    expect(todayKeyInLima(new Date("2027-01-01T04:59:59Z"))).toBe("2026-12-31")
  })

  it("does not depend on the process timezone", () => {
    withTimeZones(["Pacific/Auckland", "America/Lima", "UTC"], () => {
      expect(todayKeyInLima(new Date("2026-10-01T03:00:00Z"))).toBe("2026-09-30")
    })
  })
})

describe("utcDateKey / parseUtcDateKey", () => {
  it("round-trips a midnight-UTC date-only value without a day shift in any TZ", () => {
    withTimeZones(["America/Lima", "Pacific/Auckland"], () => {
      expect(utcDateKey(new Date("2026-07-17T00:00:00.000Z"))).toBe("2026-07-17")
      expect(utcDateKey(parseUtcDateKey("2026-01-01")!)).toBe("2026-01-01")
    })
  })

  it.each([
    "2026-02-30",
    "2026-13-01",
    "26-07-17",
    "2026-7-17",
    "",
    "2026-07-17T00:00:00Z",
  ])("rejects malformed key %j", (v) => {
    expect(parseUtcDateKey(v)).toBeNull()
  })

  it.each([null, undefined, 20260717, ["2026-07-17"], {}])(
    "rejects non-string %j",
    (v) => {
      expect(parseUtcDateKey(v)).toBeNull()
    },
  )
})

describe("maxEventsWindow", () => {
  it("spans 3 whole months before and after today's month", () => {
    expect(maxEventsWindow("2026-07-17")).toEqual({
      from: "2026-04-01",
      to: "2026-10-31",
    })
  })

  it("handles today on the 31st (no month overflow)", () => {
    expect(maxEventsWindow("2026-07-31")).toEqual({
      from: "2026-04-01",
      to: "2026-10-31",
    })
    expect(maxEventsWindow("2026-08-31")).toEqual({
      from: "2026-05-01",
      to: "2026-11-30",
    })
  })

  it("crosses year boundaries in January and December", () => {
    expect(maxEventsWindow("2026-01-15")).toEqual({
      from: "2025-10-01",
      to: "2026-04-30",
    })
    expect(maxEventsWindow("2026-12-31")).toEqual({
      from: "2026-09-01",
      to: "2027-03-31",
    })
  })

  it("handles a leap-year February as the last window month", () => {
    expect(maxEventsWindow("2027-11-05").to).toBe("2028-02-29")
  })

  it("throws for an invalid today key", () => {
    expect(() => maxEventsWindow("nope")).toThrow()
  })
})

describe("clampEventsWindow", () => {
  const today = "2026-07-17"
  const max = { from: "2026-04-01", to: "2026-10-31" }

  it("defaults to the full clamped range", () => {
    expect(clampEventsWindow(today)).toEqual(max)
    expect(clampEventsWindow(today, {})).toEqual(max)
  })

  it("keeps a valid inner range as is", () => {
    expect(
      clampEventsWindow(today, { from: "2026-07-01", to: "2026-07-31" }),
    ).toEqual({ from: "2026-07-01", to: "2026-07-31" })
  })

  it("clamps far past and far future to the cap", () => {
    expect(
      clampEventsWindow(today, { from: "1900-01-01", to: "2999-12-31" }),
    ).toEqual(max)
  })

  it("swaps a reversed range", () => {
    expect(
      clampEventsWindow(today, { from: "2026-08-31", to: "2026-08-01" }),
    ).toEqual({ from: "2026-08-01", to: "2026-08-31" })
  })

  it("collapses a range entirely outside the cap onto its edge, never wider", () => {
    expect(
      clampEventsWindow(today, { from: "2020-01-01", to: "2020-12-31" }),
    ).toEqual({ from: max.from, to: max.from })
    expect(
      clampEventsWindow(today, { from: "2030-01-01", to: "2030-12-31" }),
    ).toEqual({ from: max.to, to: max.to })
  })

  it("falls back to the cap for malformed, array, number and object input", () => {
    for (const bad of [
      "garbage",
      "2026-02-30",
      ["2026-07-01"],
      20260701,
      {},
      null,
    ]) {
      expect(clampEventsWindow(today, { from: bad, to: bad })).toEqual(max)
    }
  })

  it("uses the valid side when only one bound is malformed", () => {
    expect(clampEventsWindow(today, { from: "2026-07-10", to: "bad" })).toEqual({
      from: "2026-07-10",
      to: max.to,
    })
  })
})

describe("toCategoryKey", () => {
  it("passes through all seven known categories", () => {
    expect(CATEGORY_ORDER).toHaveLength(7)
    for (const k of CATEGORY_ORDER) expect(toCategoryKey(k)).toBe(k)
  })

  it.each(["", "Fiesta", "WORKSHOP", "social", "food", null, undefined, 3])(
    "maps unknown %j to the safe default",
    (v) => {
      expect(toCategoryKey(v)).toBe("workshop")
    },
  )
})

const row = (over: Partial<EventRow> = {}): EventRow => ({
  id: "e1",
  title: "T",
  category: "convivencia",
  date: new Date("2026-07-17T00:00:00.000Z"),
  startTime: "18:00",
  endTime: "19:00",
  modality: "IN_PERSON",
  location: "Plaza",
  meetingUrl: null,
  groupUrl: null,
  description: "D",
  pictureUrl: null,
  host: { id: "h1", fullName: "Ava Reyes" },
  attendees: [
    { userId: "a1", user: { fullName: "Marco Tanaka" } },
    { userId: "h1", user: { fullName: "Ava Reyes" } },
  ],
  ...over,
})

describe("mapEventRow", () => {
  it("maps the row to the view model with a shift-free date key", () => {
    expect(mapEventRow(row())).toEqual({
      id: "e1",
      title: "T",
      category: "convivencia",
      date: "2026-07-17",
      startTime: "18:00",
      endTime: "19:00",
      location: "Plaza",
      description: "D",
      modality: "IN_PERSON",
      meetingUrl: null,
      groupUrl: null,
      pictureUrl: null,
      hostId: "h1",
      attendeeIds: ["a1", "h1"],
    })
  })

  describe("group link privacy", () => {
    const GROUP = "https://chat.whatsapp.com/SECRET123"
    const withGroup = () => row({ groupUrl: GROUP })

    it("reveals it to the host", () => {
      expect(mapEventRow(withGroup(), "h1").groupUrl).toBe(GROUP)
    })
    it("reveals it to an attendee", () => {
      expect(mapEventRow(withGroup(), "a1").groupUrl).toBe(GROUP)
    })
    it("hides it from anyone who has not joined", () => {
      expect(mapEventRow(withGroup(), "stranger").groupUrl).toBeNull()
    })
    it("fails closed: no viewer means no link", () => {
      expect(mapEventRow(withGroup()).groupUrl).toBeNull()
      expect(mapEventRow(withGroup(), undefined).groupUrl).toBeNull()
    })
    it("never leaks the link anywhere else in the mapped event", () => {
      expect(JSON.stringify(mapEventRow(withGroup(), "stranger"))).not.toContain(
        "SECRET123",
      )
    })
    it("an event with no group stays null for the host too", () => {
      expect(mapEventRow(row(), "h1").groupUrl).toBeNull()
    })
  })

  it("maps null location to an empty string and carries virtual fields", () => {
    const e = mapEventRow(
      row({
        location: null,
        modality: "VIRTUAL",
        meetingUrl: "https://meet.example/x",
        pictureUrl: "https://img.example/p.png",
      }),
    )
    expect(e.location).toBe("")
    expect(e.modality).toBe("VIRTUAL")
    expect(e.meetingUrl).toBe("https://meet.example/x")
    expect(e.pictureUrl).toBe("https://img.example/p.png")
  })

  it("maps an unknown category to the default", () => {
    expect(mapEventRow(row({ category: "Otro" })).category).toBe("workshop")
  })

  it("converts the date key identically under Pacific/Auckland and America/Lima", () => {
    withTimeZones(["Pacific/Auckland", "America/Lima"], () => {
      expect(mapEventRow(row()).date).toBe("2026-07-17")
    })
  })
})

describe("collectPeople", () => {
  const me = { id: "me-id", fullName: "Luz Quispe", email: "luz@x.test" }

  it("lists every host, attendee and the current user exactly once with initials", () => {
    const rows = [
      row(),
      row({
        id: "e2",
        host: { id: "a1", fullName: "Marco Tanaka" },
        attendees: [
          { userId: "me-id", user: { fullName: "Luz Quispe" } },
          { userId: "h1", user: { fullName: "Ava Reyes" } },
        ],
      }),
    ]
    const people = collectPeople(rows, me)
    expect(people.map((p) => p.id).sort()).toEqual(["a1", "h1", "me-id"])
    expect(people.find((p) => p.id === "h1")).toEqual({
      id: "h1",
      name: "Ava Reyes",
      initials: "AR",
    })
    expect(people.find((p) => p.id === "me-id")).toEqual({
      id: "me-id",
      name: "Luz Quispe",
      initials: "LQ",
    })
  })

  it("never exposes an email in any person (only id, name, initials)", () => {
    const people = collectPeople([row()], me)
    for (const p of people) {
      expect(Object.keys(p).sort()).toEqual(["id", "initials", "name"])
    }
    expect(JSON.stringify(people)).not.toContain("@")
  })

  it("includes the current user even with no events, using the email as fallback name", () => {
    expect(
      collectPeople([], { id: "u", fullName: "  ", email: "ana@x.test" }),
    ).toEqual([{ id: "u", name: "ana@x.test", initials: "A" }])
  })

  it("falls back to a safe label when a person has an empty name", () => {
    const people = collectPeople(
      [row({ host: { id: "h9", fullName: "" }, attendees: [] })],
      me,
    )
    expect(people.find((p) => p.id === "h9")).toEqual({
      id: "h9",
      name: "Tú",
      initials: "T",
    })
  })
})
