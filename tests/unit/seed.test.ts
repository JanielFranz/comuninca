import { describe, expect, it } from "vitest"
import {
  buildInviteCodes,
  buildSeedUsers,
  checkSeedGuard,
  mapSeedEvents,
  parseSeedEnv,
} from "../../prisma/seed-data"
import {
  runSeed,
  type SeedAuthAdmin,
  type SeedDb,
} from "../../prisma/seed-runner"
import { SEED_EVENTS } from "../../lib/constants"

const LOCAL = "postgresql://u:p@localhost:5432/db"
const REMOTE = "postgresql://u:p@db.abc.supabase.co:5432/postgres"
const LOCAL_API = "http://127.0.0.1:54321"
const REMOTE_API = "https://abc.supabase.co"

const allLocal = {
  DIRECT_URL: LOCAL,
  DATABASE_URL: LOCAL,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
}
const allRemote = {
  DIRECT_URL: REMOTE,
  DATABASE_URL: REMOTE,
  NEXT_PUBLIC_SUPABASE_URL: REMOTE_API,
}
const TARGETS = [
  "DIRECT_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const

describe("checkSeedGuard", () => {
  it("refuses NODE_ENV=production", () => {
    expect(checkSeedGuard({ ...allLocal, NODE_ENV: "production" })).toEqual({
      ok: false,
      reason: "Refusing to seed: production environment.",
    })
  })
  it("refuses VERCEL_ENV=production even with the remote opt-in", () => {
    const r = checkSeedGuard({
      ...allRemote,
      VERCEL_ENV: "production",
      SEED_ALLOW_REMOTE: "true",
    })
    expect(r.ok).toBe(false)
  })
  it("allows all-local targets (localhost and 127.0.0.1)", () => {
    expect(checkSeedGuard(allLocal)).toEqual({ ok: true })
  })
  it("refuses all-remote targets without opt-in and names the first variable and host", () => {
    const r = checkSeedGuard(allRemote)
    expect(r).toEqual({
      ok: false,
      reason:
        'Refusing to seed: DIRECT_URL points to remote host "db.abc.supabase.co". Set SEED_ALLOW_REMOTE=true to allow it explicitly.',
    })
  })
  it("refuses when the opt-in is not exactly 'true'", () => {
    expect(checkSeedGuard({ ...allRemote, SEED_ALLOW_REMOTE: "1" }).ok).toBe(
      false,
    )
  })
  it("allows all-remote targets only with SEED_ALLOW_REMOTE=true", () => {
    expect(checkSeedGuard({ ...allRemote, SEED_ALLOW_REMOTE: "true" })).toEqual(
      {
        ok: true,
      },
    )
  })
  it.each(TARGETS)("refuses a mixed config where only %s is remote", (name) => {
    const r = checkSeedGuard({
      ...allLocal,
      [name]: name === "NEXT_PUBLIC_SUPABASE_URL" ? REMOTE_API : REMOTE,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toContain(`${name} points to remote host`)
      expect(r.reason).not.toContain("u:p")
    }
  })
  it.each(TARGETS)("refuses when %s is missing, even with opt-in", (name) => {
    const env: Record<string, string | undefined> = {
      ...allLocal,
      SEED_ALLOW_REMOTE: "true",
    }
    delete env[name]
    expect(checkSeedGuard(env)).toEqual({
      ok: false,
      reason: `Refusing to seed: ${name} is not set.`,
    })
  })
  it.each(TARGETS)(
    "refuses when %s is unparsable, even with opt-in",
    (name) => {
      const r = checkSeedGuard({
        ...allLocal,
        SEED_ALLOW_REMOTE: "true",
        [name]: "not a url",
      })
      expect(r).toEqual({
        ok: false,
        reason: `Refusing to seed: ${name} could not be parsed.`,
      })
    },
  )
})

describe("parseSeedEnv", () => {
  it("returns the credentials when all are present", () => {
    expect(
      parseSeedEnv({
        SEED_ADMIN_EMAIL: " a@x.test ",
        SEED_ADMIN_PASSWORD: "pw1",
        SEED_USER_PASSWORD: "pw2",
      }),
    ).toEqual({
      adminEmail: "a@x.test",
      adminPassword: "pw1",
      userPassword: "pw2",
    })
  })
  it("lists every missing variable", () => {
    expect(() => parseSeedEnv({ SEED_ADMIN_EMAIL: "a@x.test" })).toThrow(
      "Missing required env vars: SEED_ADMIN_PASSWORD, SEED_USER_PASSWORD",
    )
  })
  it("treats empty strings as missing", () => {
    expect(() =>
      parseSeedEnv({
        SEED_ADMIN_EMAIL: "a@x.test",
        SEED_ADMIN_PASSWORD: "",
        SEED_USER_PASSWORD: "p",
      }),
    ).toThrow("SEED_ADMIN_PASSWORD")
  })
})

describe("seed data mapping", () => {
  const authIds = { u1: "id-1", u2: "id-2", u3: "id-3", u4: "id-4" }

  it("builds 4 users with seed-domain emails and full names", () => {
    const users = buildSeedUsers()
    expect(users.map((u) => u.email)).toEqual([
      "ava@seed.comuninca.test",
      "marco@seed.comuninca.test",
      "priya@seed.comuninca.test",
      "jonas@seed.comuninca.test",
    ])
    expect(users[0].fullName).toBe("Ava Reyes")
  })

  it("maps the 12 events with real host ids and unique deterministic ids", () => {
    const { events, attendees } = mapSeedEvents(authIds)
    expect(events).toHaveLength(12)
    expect(events[0].id).toBe("seed-event-01")
    expect(events[11].id).toBe("seed-event-12")
    expect(new Set(events.map((e) => e.id)).size).toBe(12)
    expect(events[0]).toMatchObject({
      title: "Feria de Productores",
      category: "expoferia",
      startTime: "09:00",
      endTime: "13:00",
      modality: "IN_PERSON",
      hostId: "id-2",
    })
    expect(events[0].date.toISOString()).toBe("2026-07-17T00:00:00.000Z")
    const valid = new Set(Object.values(authIds))
    expect(events.every((e) => valid.has(e.hostId))).toBe(true)
    const expected = SEED_EVENTS.reduce((n, e) => n + e.attendeeIds.length, 0)
    expect(attendees).toHaveLength(expected)
    expect(attendees.every((a) => valid.has(a.userId))).toBe(true)
    expect(attendees).toContainEqual({
      eventId: "seed-event-01",
      userId: "id-1",
    })
  })

  it("throws a clear error when a demo user has no seeded id", () => {
    expect(() => mapSeedEvents({ u1: "id-1" })).toThrow(
      'No seeded user for demo id "u2"',
    )
  })

  it("builds 10 unique deterministic invite codes", () => {
    const codes = buildInviteCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    expect(codes[0]).toBe("SEED-0001")
    expect(codes[9]).toBe("SEED-0010")
  })
})

// ---- In-memory fakes for the runner ----------------------------------------

function makeFakes() {
  const authUsers = new Map<string, string>() // email -> id
  const users = new Map<string, Record<string, unknown>>()
  const codes = new Map<string, string>() // code -> status
  const events = new Map<string, Record<string, unknown>>()
  const attendees = new Map<string, { eventId: string; userId: string }>()
  let createCalls = 0
  let seq = 0

  const auth: SeedAuthAdmin = {
    async listUsers() {
      return {
        users: [...authUsers].map(([email, id]) => ({ id, email })),
        error: null,
      }
    },
    async createUser({ email }) {
      createCalls++
      const id = `auth-${++seq}`
      authUsers.set(email, id)
      return { user: { id, email }, error: null }
    },
  }
  const db: SeedDb = {
    user: {
      async upsert({ where, update, create }) {
        const cur = users.get(where.id)
        users.set(where.id, cur ? { ...cur, ...update } : { ...create })
      },
    },
    inviteCode: {
      async createMany({ data }) {
        let count = 0
        for (const { code } of data) {
          if (!codes.has(code)) {
            codes.set(code, "UNUSED")
            count++
          }
        }
        return { count }
      },
    },
    event: {
      async upsert({ where, update, create }) {
        const cur = events.get(where.id)
        events.set(where.id, cur ? { ...cur, ...update } : { ...create })
      },
    },
    eventAttendee: {
      async createMany({ data }) {
        let count = 0
        for (const a of data) {
          const k = `${a.eventId}|${a.userId}`
          if (!attendees.has(k)) {
            attendees.set(k, a)
            count++
          }
        }
        return { count }
      },
    },
  }
  return {
    auth,
    db,
    authUsers,
    users,
    codes,
    events,
    attendees,
    calls: () => createCalls,
  }
}

const CREDS = {
  adminEmail: "admin@x.test",
  adminPassword: "pw-a",
  userPassword: "pw-u",
}

describe("runSeed", () => {
  it("creates 1 admin, 4 users, 10 UNUSED codes and 12 events", async () => {
    const f = makeFakes()
    const summary = await runSeed({ auth: f.auth, db: f.db }, CREDS)
    expect(summary).toMatchObject({
      users: 5,
      inviteCodesCreated: 10,
      events: 12,
    })
    expect(f.users.size).toBe(5)
    const adminId = f.authUsers.get("admin@x.test")!
    expect(f.users.get(adminId)).toMatchObject({
      role: "ADMIN",
      onboardingCompleted: true,
    })
    const normals = [...f.users.values()].filter((u) => u.role === "USER")
    expect(normals).toHaveLength(4)
    expect([...f.codes.values()].every((s) => s === "UNUSED")).toBe(true)
    expect(f.codes.size).toBe(10)
    expect(f.events.size).toBe(12)
    const hostIds = new Set([...f.events.values()].map((e) => e.hostId))
    for (const h of hostIds) expect(f.users.has(h as string)).toBe(true)
  })

  it("is idempotent: a second run adds no rows and creates no auth users", async () => {
    const f = makeFakes()
    await runSeed({ auth: f.auth, db: f.db }, CREDS)
    const snapshot = {
      users: f.users.size,
      codes: f.codes.size,
      events: f.events.size,
      attendees: f.attendees.size,
      creates: f.calls(),
    }
    const second = await runSeed({ auth: f.auth, db: f.db }, CREDS)
    expect(second.inviteCodesCreated).toBe(0)
    expect({
      users: f.users.size,
      codes: f.codes.size,
      events: f.events.size,
      attendees: f.attendees.size,
      creates: f.calls(),
    }).toEqual(snapshot)
    expect(snapshot).toMatchObject({
      users: 5,
      codes: 10,
      events: 12,
      creates: 5,
    })
  })

  it("never resets a USED invite code on re-run", async () => {
    const f = makeFakes()
    await runSeed({ auth: f.auth, db: f.db }, CREDS)
    f.codes.set("SEED-0003", "USED")
    await runSeed({ auth: f.auth, db: f.db }, CREDS)
    expect(f.codes.get("SEED-0003")).toBe("USED")
    expect(f.codes.get("SEED-0004")).toBe("UNUSED")
  })

  it("propagates a createUser failure with a useful message", async () => {
    const f = makeFakes()
    f.auth.createUser = async () => ({
      user: null,
      error: { message: "boom" },
    })
    await expect(runSeed({ auth: f.auth, db: f.db }, CREDS)).rejects.toThrow(
      "Failed to create auth user admin@x.test: boom",
    )
    expect(f.events.size).toBe(0)
  })

  it("propagates a listUsers failure", async () => {
    const f = makeFakes()
    f.auth.listUsers = async () => ({ users: [], error: { message: "denied" } })
    await expect(runSeed({ auth: f.auth, db: f.db }, CREDS)).rejects.toThrow(
      "Failed to list auth users: denied",
    )
  })

  it("finds an existing auth user on a later page", async () => {
    const f = makeFakes()
    const filler = Array.from({ length: 200 }, (_, i) => ({
      id: `f${i}`,
      email: `f${i}@x.test`,
    }))
    f.auth.listUsers = async ({ page }) => ({
      users:
        page === 1 ? filler : [{ id: "real-admin", email: "Admin@X.test" }],
      error: null,
    })
    await runSeed({ auth: f.auth, db: f.db }, CREDS)
    expect(f.users.get("real-admin")).toMatchObject({ role: "ADMIN" })
  })
})
