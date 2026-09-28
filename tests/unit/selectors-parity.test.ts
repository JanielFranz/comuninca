/**
 * Golden-master parity: tests/fixtures/selectors-golden.json was produced by
 * running the ORIGINAL selectors (reading TODAY/USERS/findUser/"me" from
 * constants) over the 12 SEED_EVENTS BEFORE the #14 refactor. The refactored,
 * parameterised selectors must reproduce it exactly.
 *
 * Intended differences (only these):
 *  - host/attendee ids are real-looking user ids instead of "u1".."u4"/"me";
 *    they are mapped back to the legacy ids before comparing raw event data.
 *  - CalendarEvent gained modality/meetingUrl/pictureUrl (not rendered); they
 *    are stripped before comparing raw event data.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { SEED_EVENTS, USERS } from "@/lib/constants"
import { parseDateKey } from "@/lib/dateUtils"
import {
  buildActiveEvent,
  buildAttendeeOptions,
  buildDayModalEvents,
  buildMonthCells,
  buildWeekData,
  getEventsForDate,
} from "@/lib/selectors"
import type { CalendarEvent, CurrentUser, User } from "@/lib/types"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/selectors-golden.json"), "utf8"),
) as Record<string, unknown>

const ID_MAP: Record<string, string> = {
  u1: "0b6f5a1e-1111-4a2b-9c01-aaaaaaaaaaa1",
  u2: "0b6f5a1e-2222-4a2b-9c02-aaaaaaaaaaa2",
  u3: "0b6f5a1e-3333-4a2b-9c03-aaaaaaaaaaa3",
  u4: "0b6f5a1e-4444-4a2b-9c04-aaaaaaaaaaa4",
  me: "0b6f5a1e-9999-4a2b-9c09-aaaaaaaaaa99",
}
const LEGACY_ID = Object.fromEntries(
  Object.entries(ID_MAP).map(([legacy, real]) => [real, legacy]),
)
const real = (id: string) => ID_MAP[id] ?? id
const TODAY_KEY = "2026-07-17"
const TODAY = parseDateKey(TODAY_KEY)

const ME_ID = ID_MAP.me
const me: CurrentUser = {
  id: ME_ID,
  name: "Tú",
  initials: "TU",
  email: "me@example.test",
}
const people: User[] = USERS.map((u) => ({ ...u, id: real(u.id) }))

const toEvent = (e: (typeof SEED_EVENTS)[number]): CalendarEvent => ({
  ...e,
  modality: "IN_PERSON",
  meetingUrl: null,
  pictureUrl: null,
  hostId: real(e.hostId),
  attendeeIds: e.attendeeIds.map(real),
})
const events: CalendarEvent[] = SEED_EVENTS.map(toEvent)
const ev = (id: string) => events.find((e) => e.id === id)!

/** Back to the legacy shape of the raw event data. */
function legacyShape(list: CalendarEvent[]) {
  return list.map((e) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { modality, meetingUrl, pictureUrl, ...rest } = e
    return {
      ...rest,
      hostId: LEGACY_ID[e.hostId] ?? e.hostId,
      attendeeIds: e.attendeeIds.map((id) => LEGACY_ID[id] ?? id),
    }
  })
}

describe("golden master: month view", () => {
  for (const weekStart of ["sunday", "monday"] as const) {
    it.each([
      ["mobile=false", { isMobile: false, showEventPreviews: true }],
      ["mobile=true", { isMobile: true, showEventPreviews: true }],
      ["nopreviews", { isMobile: false, showEventPreviews: false }],
    ])(`${weekStart} %s`, (name, flags) => {
      const cells = buildMonthCells({
        currentDate: TODAY,
        today: TODAY_KEY,
        events,
        weekStart,
        ...flags,
      })
      expect(cells).toEqual(golden[`month/${weekStart}/${name}`])
    })
  }

  it("accepts today as a Date and as an ISO key identically", () => {
    const args = {
      currentDate: TODAY,
      events,
      weekStart: "sunday" as const,
      isMobile: false,
      showEventPreviews: true,
    }
    expect(buildMonthCells({ ...args, today: TODAY })).toEqual(
      buildMonthCells({ ...args, today: TODAY_KEY }),
    )
  })
})

describe("golden master: week view", () => {
  for (const weekStart of ["sunday", "monday"] as const) {
    it.each([
      ["busiest-2026-07-24", "2026-07-24"],
      ["today", TODAY_KEY],
      ["empty-2026-07-01", "2026-07-01"],
    ])(`${weekStart} %s`, (name, key) => {
      const data = buildWeekData({
        currentDate: parseDateKey(key),
        today: TODAY_KEY,
        events,
        weekStart,
      })
      expect(data).toEqual(golden[`week/${weekStart}/${name}`])
    })
  }
})

describe("golden master: day modal and per-day events", () => {
  it.each([
    ["dayModal/2026-07-17", "2026-07-17"],
    ["dayModal/2026-07-24", "2026-07-24"],
    ["dayModal/empty", "2026-07-02"],
    ["dayModal/null", null],
  ])("%s", (name, key) => {
    expect(buildDayModalEvents(events, key)).toEqual(golden[name])
  })

  it.each(["2026-07-17", "2026-07-24", "2026-07-02"])(
    "getEventsForDate %s (legacy ids, without new fields)",
    (key) => {
      expect(legacyShape(getEventsForDate(events, key))).toEqual(
        golden[`eventsForDate/${key}`],
      )
    },
  )
})

describe("golden master: active event", () => {
  it("none", () => {
    expect(buildActiveEvent(events, null, people, me)).toEqual(
      golden["activeEvent/none"],
    )
  })

  it("attendees-ev1 (someone else's event, not going)", () => {
    expect(buildActiveEvent(events, "ev1", people, me)).toEqual(
      golden["activeEvent/attendees-ev1"],
    )
  })

  it("host-me (current user hosts and attends)", () => {
    const hosted = {
      ...ev("ev2"),
      id: "ev-host-me",
      hostId: ME_ID,
      attendeeIds: [real("u1"), ME_ID],
    }
    expect(buildActiveEvent([hosted], "ev-host-me", people, me)).toEqual(
      golden["activeEvent/host-me"],
    )
  })

  it("attendee-me (current user joined)", () => {
    const joined = { ...ev("ev2"), attendeeIds: [real("u2"), real("u4"), ME_ID] }
    expect(buildActiveEvent([joined], "ev2", people, me)).toEqual(
      golden["activeEvent/attendee-me"],
    )
  })

  it("noattendees (no location/description/attendees)", () => {
    const bare = {
      ...ev("ev1"),
      id: "x",
      location: "",
      description: "",
      attendeeIds: [],
    }
    expect(buildActiveEvent([bare], "x", people, me)).toEqual(
      golden["activeEvent/noattendees"],
    )
  })
})

describe("buildActiveEvent modality/meetingUrl (feature #20)", () => {
  it("no active event: placeholder has sane defaults", () => {
    const view = buildActiveEvent(events, null, people, me)
    expect(view.modality).toBe("IN_PERSON")
    expect(view.meetingUrl).toBeNull()
  })

  it("IN_PERSON event: modality/meetingUrl pass through, location kept", () => {
    const view = buildActiveEvent(events, "ev1", people, me)
    expect(view.modality).toBe("IN_PERSON")
    expect(view.meetingUrl).toBeNull()
    expect(view.location).toBe(ev("ev1").location)
  })

  it("VIRTUAL event with a meeting link: both pass through unchanged", () => {
    const virtual = {
      ...ev("ev1"),
      id: "ev-virtual-link",
      modality: "VIRTUAL" as const,
      meetingUrl: "https://meet.example.com/room",
    }
    const view = buildActiveEvent([virtual], "ev-virtual-link", people, me)
    expect(view.modality).toBe("VIRTUAL")
    expect(view.meetingUrl).toBe("https://meet.example.com/room")
  })

  it("VIRTUAL event with no meeting link: meetingUrl stays null", () => {
    const virtual = {
      ...ev("ev1"),
      id: "ev-virtual-nolink",
      modality: "VIRTUAL" as const,
      meetingUrl: null,
    }
    const view = buildActiveEvent([virtual], "ev-virtual-nolink", people, me)
    expect(view.modality).toBe("VIRTUAL")
    expect(view.meetingUrl).toBeNull()
  })
})

describe("golden master: attendee options", () => {
  it("none selected", () => {
    expect(buildAttendeeOptions([], people).map((o) => o.id)).toEqual(
      people.map((p) => p.id),
    )
    const withLegacy = buildAttendeeOptions([], people).map((o) => ({
      ...o,
      id: LEGACY_ID[o.id],
    }))
    expect(withLegacy).toEqual(golden["attendeeOptions/none"])
  })

  it("u1 and u3 selected", () => {
    const opts = buildAttendeeOptions([real("u1"), real("u3")], people).map(
      (o) => ({ ...o, id: LEGACY_ID[o.id] }),
    )
    expect(opts).toEqual(golden["attendeeOptions/u1u3"])
  })
})

describe("buildActiveEvent robustness (no more \"me\" convention)", () => {
  it("does not crash and shows a safe label when the host is not in people", () => {
    const orphan = { ...ev("ev1"), hostId: "ghost-id", attendeeIds: ["ghost-2"] }
    const view = buildActiveEvent([orphan], "ev1", people, me)
    expect(view.hostName).toBe("Desconocido")
    expect(view.hostInitials).toBe("?")
    expect(view.attendees).toEqual([])
    expect(view.isGoing).toBe(false)
  })

  it("a literal \"me\" id is no longer special", () => {
    const e = { ...ev("ev1"), hostId: "me", attendeeIds: ["me"] }
    const view = buildActiveEvent([e], "ev1", people, me)
    expect(view.hostName).toBe("Desconocido")
    expect(view.isGoing).toBe(false)
  })
})
