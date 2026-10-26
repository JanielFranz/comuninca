import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requireUser = vi.fn()
const findUnique = vi.fn()
const create = vi.fn()
const del = vi.fn()
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireUser: () => requireUser() }))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => findUnique(...a) },
    eventAttendee: {
      create: (...a: unknown[]) => create(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
}))

import { toggleJoin } from "@/lib/actions/events"

const me = {
  id: "me-id",
  email: "me@x.test",
  fullName: "Luz Quispe",
  role: "USER",
  onboardingCompleted: true,
}

const P2002 = { code: "P2002" }
const P2025 = { code: "P2025" }

beforeEach(() => {
  vi.clearAllMocks()
  requireUser.mockResolvedValue({ ok: true, user: me })
  findUnique.mockResolvedValue({ id: "ev-1" })
  create.mockResolvedValue({ eventId: "ev-1", userId: "me-id" })
  del.mockResolvedValue({ eventId: "ev-1", userId: "me-id" })
})
afterEach(() => vi.useRealTimers())

describe("toggleJoin guard", () => {
  it("UNAUTHENTICATED first, Prisma untouched, even with garbage eventId", async () => {
    requireUser.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" })
    const r = await toggleJoin({ eventId: { x: 1 } as never })
    expect(r).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(findUnique).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })
})

describe("toggleJoin input validation", () => {
  it.each([
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 5],
    ["a 10000-char string", "a".repeat(10000)],
  ])("%s -> INVALID_INPUT, Prisma untouched", async (_label, value) => {
    const r = await toggleJoin({ eventId: value as never })
    expect(r).toEqual({ ok: false, error: "INVALID_INPUT" })
    expect(findUnique).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })
})

describe("toggleJoin event existence", () => {
  it("event not found -> EVENT_NOT_FOUND; findUnique called, no create/delete", async () => {
    findUnique.mockResolvedValue(null)
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({ ok: false, error: "EVENT_NOT_FOUND" })
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "ev-1" },
      select: { id: true, groupUrl: true },
    })
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it("findUnique throwing -> UNEXPECTED, no create/delete", async () => {
    findUnique.mockRejectedValue(new Error("secret db detail"))
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(create).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
    expect(JSON.stringify(r)).not.toContain("secret")
  })
})

describe("toggleJoin first toggle (join)", () => {
  it("create called with exact {eventId, userId} from the session; userId never taken from input", async () => {
    const r = await toggleJoin({
      eventId: "ev-1",
      userId: "attacker-id",
    } as never)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      data: { eventId: "ev-1", userId: "me-id" },
    })
    expect(r).toEqual({ ok: true, joined: true, groupUrl: null })
    expect(del).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
  })

  it("joining hands back the event's group link", async () => {
    findUnique.mockResolvedValue({
      id: "ev-1",
      groupUrl: "https://chat.whatsapp.com/AbCdEf123456",
    })
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({
      ok: true,
      joined: true,
      groupUrl: "https://chat.whatsapp.com/AbCdEf123456",
    })
  })
})

describe("toggleJoin second toggle (leave)", () => {
  it("create throws P2002 -> delete called with the exact composite key, returns joined:false", async () => {
    create.mockRejectedValue(P2002)
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(create).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({
      where: { eventId_userId: { eventId: "ev-1", userId: "me-id" } },
    })
    expect(r).toEqual({ ok: true, joined: false, groupUrl: null })
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
  })

  it("leaving never returns the group link, even when the event has one", async () => {
    findUnique.mockResolvedValue({
      id: "ev-1",
      groupUrl: "https://chat.whatsapp.com/AbCdEf123456",
    })
    create.mockRejectedValue(P2002)
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({ ok: true, joined: false, groupUrl: null })
    expect(JSON.stringify(r)).not.toContain("whatsapp")
  })
})

describe("toggleJoin race: create P2002 then delete P2025", () => {
  it("still returns joined:false cleanly, not UNEXPECTED", async () => {
    create.mockRejectedValue(P2002)
    del.mockRejectedValue(P2025)
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({ ok: true, joined: false, groupUrl: null })
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
  })
})

describe("toggleJoin unexpected errors", () => {
  it("create throws a non-P2002 error -> UNEXPECTED, no leaked text, delete never attempted", async () => {
    create.mockRejectedValue(new Error("secret db detail"))
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(del).not.toHaveBeenCalled()
    expect(JSON.stringify(r)).not.toContain("secret")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("delete throws a non-P2025 error after a P2002 -> UNEXPECTED, no leaked text", async () => {
    create.mockRejectedValue(P2002)
    del.mockRejectedValue(new Error("secret db detail"))
    const r = await toggleJoin({ eventId: "ev-1" })
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
