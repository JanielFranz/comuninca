import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requireUser = vi.fn()
const findMany = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireUser: () => requireUser() }))
vi.mock("@/lib/db", () => ({
  prisma: { event: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import { listEvents } from "@/lib/actions/events"

const me = {
  id: "me-id",
  email: "me@x.test",
  fullName: "Luz Quispe",
  role: "USER",
}

type FindArg = {
  where: { date: { gte: Date; lte: Date } }
  select: Record<string, unknown>
  orderBy: unknown
}
const findArg = () => findMany.mock.calls[0][0] as FindArg
const iso = (d: Date) => d.toISOString().slice(0, 10)

function setNow(iso8601: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso8601))
}

beforeEach(() => {
  vi.clearAllMocks()
  requireUser.mockResolvedValue({ ok: true, user: me })
  findMany.mockResolvedValue([])
  setNow("2026-07-17T15:00:00Z")
})
afterEach(() => vi.useRealTimers())

describe("listEvents guard", () => {
  it("UNAUTHENTICATED -> typed error and Prisma untouched, even with garbage input", async () => {
    requireUser.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" })
    const r = await listEvents({ from: { x: 1 }, to: ["a", 5] })
    expect(r).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(findMany).not.toHaveBeenCalled()
  })

  it("any authenticated user, admins included, may read", async () => {
    requireUser.mockResolvedValue({ ok: true, user: { ...me, role: "ADMIN" } })
    const r = await listEvents()
    expect(r.ok).toBe(true)
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})

describe("listEvents window", () => {
  it("defaults to the full clamped range around the Lima today", async () => {
    const r = await listEvents()
    expect(findArg().where).toEqual({
      date: {
        gte: new Date("2026-04-01T00:00:00.000Z"),
        lte: new Date("2026-10-31T00:00:00.000Z"),
      },
    })
    expect(r).toMatchObject({
      ok: true,
      today: "2026-07-17",
      window: { from: "2026-04-01", to: "2026-10-31" },
    })
  })

  it("uses Lima's date when it differs from UTC (2026-10-01T03:00Z is 2026-09-30)", async () => {
    setNow("2026-10-01T03:00:00Z")
    const r = await listEvents()
    expect(r).toMatchObject({
      today: "2026-09-30",
      window: { from: "2026-06-01", to: "2026-12-31" },
    })
  })

  it("today on the 31st does not overflow months", async () => {
    setNow("2026-07-31T12:00:00Z")
    const r = await listEvents()
    expect(r).toMatchObject({ window: { from: "2026-04-01", to: "2026-10-31" } })
  })

  it("December and January cross the year", async () => {
    setNow("2026-12-31T12:00:00Z")
    expect(await listEvents()).toMatchObject({
      window: { from: "2026-09-01", to: "2027-03-31" },
    })
    setNow("2026-01-10T12:00:00Z")
    expect(await listEvents()).toMatchObject({
      window: { from: "2025-10-01", to: "2026-04-30" },
    })
  })

  it("a supplied inner range is honored", async () => {
    await listEvents({ from: "2026-07-01", to: "2026-07-31" })
    expect(iso(findArg().where.date.gte)).toBe("2026-07-01")
    expect(iso(findArg().where.date.lte)).toBe("2026-07-31")
  })

  it.each([
    [{ from: "1900-01-01", to: "2999-12-31" }],
    [{ from: "2999-12-31", to: "1900-01-01" }],
    [{ from: ["2000-01-01"], to: 99999999 }],
    [{ from: "nope", to: {} }],
    [{ from: "2026-02-30", to: "2026-13-40" }],
    [null],
    [undefined],
    [{}],
  ])("never widens beyond the cap for %j", async (input) => {
    await listEvents(input as never)
    const { gte, lte } = findArg().where.date
    expect(gte.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-04-01T00:00:00Z").getTime(),
    )
    expect(lte.getTime()).toBeLessThanOrEqual(
      new Date("2026-10-31T00:00:00Z").getTime(),
    )
    expect(gte.getTime()).toBeLessThanOrEqual(lte.getTime())
  })

  it("swaps a reversed range", async () => {
    await listEvents({ from: "2026-08-31", to: "2026-08-01" })
    expect(iso(findArg().where.date.gte)).toBe("2026-08-01")
    expect(iso(findArg().where.date.lte)).toBe("2026-08-31")
  })
})

describe("listEvents query shape", () => {
  it("orders by date, startTime, id", async () => {
    await listEvents()
    expect(findArg().orderBy).toEqual([
      { date: "asc" },
      { startTime: "asc" },
      { id: "asc" },
    ])
  })

  it("selects only id/fullName of users: no email or other user fields", async () => {
    await listEvents()
    const sel = findArg().select as {
      host: { select: Record<string, unknown> }
      attendees: {
        select: { userId: boolean; user: { select: Record<string, unknown> } }
      }
    }
    expect(sel.host.select).toEqual({ id: true, fullName: true })
    expect(sel.attendees.select.user.select).toEqual({ fullName: true })
    expect(Object.keys(sel.attendees.select).sort()).toEqual(["user", "userId"])
    expect(Object.keys(sel).sort()).toEqual(
      [
        "attendees",
        "category",
        "date",
        "description",
        "endTime",
        "host",
        "id",
        "groupUrl",
        "location",
        "meetingUrl",
        "modality",
        "pictureUrl",
        "startTime",
        "title",
      ].sort(),
    )
    expect(JSON.stringify(findArg().select)).not.toMatch(/email/i)
  })
})

describe("listEvents result", () => {
  it("maps rows to events and people (host, attendees, current user once each)", async () => {
    findMany.mockResolvedValue([
      {
        id: "e1",
        title: "Feria",
        category: "expoferia",
        date: new Date("2026-07-17T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "13:00",
        modality: "IN_PERSON",
        location: null,
        meetingUrl: null,
        groupUrl: null,
        description: "d",
        pictureUrl: null,
        host: { id: "h1", fullName: "Ava Reyes" },
        attendees: [
          { userId: "me-id", user: { fullName: "Luz Quispe" } },
          { userId: "a2", user: { fullName: "Marco Tanaka" } },
        ],
      },
    ])
    const r = await listEvents()
    if (!r.ok) throw new Error("expected ok")
    expect(r.events).toEqual([
      expect.objectContaining({
        id: "e1",
        date: "2026-07-17",
        location: "",
        hostId: "h1",
        attendeeIds: ["me-id", "a2"],
      }),
    ])
    expect(r.people.map((p) => p.id).sort()).toEqual(["a2", "h1", "me-id"])
    expect(JSON.stringify(r)).not.toContain("@")
  })

  describe("group link privacy", () => {
    const row = (
      id: string,
      hostId: string,
      attendeeIds: string[],
      groupUrl: string,
    ) => ({
      id,
      title: id,
      category: "convivencia",
      date: new Date("2026-07-17T00:00:00.000Z"),
      startTime: "09:00",
      endTime: "10:00",
      modality: "IN_PERSON",
      location: "Plaza",
      meetingUrl: null,
      groupUrl,
      description: "d",
      pictureUrl: null,
      host: { id: hostId, fullName: "Host " + hostId },
      attendees: attendeeIds.map((userId) => ({
        userId,
        user: { fullName: "User " + userId },
      })),
    })
    const links = {
      hosted: "https://chat.whatsapp.com/HOSTED",
      joined: "https://chat.whatsapp.com/JOINED",
      other: "https://chat.whatsapp.com/OTHER",
    }
    beforeEach(() => {
      findMany.mockResolvedValue([
        row("hosted", "me-id", [], links.hosted),
        row("joined", "h2", ["me-id", "a3"], links.joined),
        row("other", "h3", ["a4"], links.other),
      ])
    })

    it("returns the link only for events the viewer hosts or has joined", async () => {
      const r = await listEvents()
      if (!r.ok) throw new Error("expected ok")
      const byId = Object.fromEntries(r.events.map((e) => [e.id, e.groupUrl]))
      expect(byId).toEqual({
        hosted: links.hosted,
        joined: links.joined,
        other: null,
      })
    })

    it("never puts a withheld link anywhere in the payload", async () => {
      const r = await listEvents()
      expect(JSON.stringify(r)).not.toContain("OTHER")
    })

    it("an admin who has not joined is treated like everyone else", async () => {
      requireUser.mockResolvedValue({
        ok: true,
        user: { ...me, id: "admin-id", role: "ADMIN" },
      })
      const r = await listEvents()
      if (!r.ok) throw new Error("expected ok")
      expect(r.events.map((e) => e.groupUrl)).toEqual([null, null, null])
    })
  })

  it("a Prisma failure -> UNEXPECTED with no error text", async () => {
    findMany.mockRejectedValue(new Error("secret db detail"))
    const r = await listEvents()
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret")
  })
})
