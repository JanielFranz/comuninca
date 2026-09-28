import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const requireAdmin = vi.fn()
const count = vi.fn()
const findMany = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: (...a: unknown[]) => count(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}))

import { listUsers } from "@/lib/actions/admin"
import { fmtDate, fmtDateOnly } from "@/lib/dateUtils"
import {
  buildUsersHref,
  clampPage,
  computePageCount,
  escapeLike,
  normalizeSearch,
  parsePage,
} from "@/lib/usersQuery"

const admin = { id: "a", email: "a@x.test", fullName: "A", role: "ADMIN" }

type FindArg = {
  where: { role: string; OR?: unknown[] }
  orderBy: unknown
  skip: number
  take: number
  select: Record<string, unknown>
}
const findArg = () => findMany.mock.calls[0][0] as FindArg

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockResolvedValue({ ok: true, user: admin })
  count.mockResolvedValue(0)
  findMany.mockResolvedValue([])
})

describe("listUsers guard", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "%s -> typed error and Prisma untouched, even with garbage input",
    async (error) => {
      requireAdmin.mockResolvedValue({ ok: false, error })
      const r = await listUsers({ page: { x: 1 }, q: ["%", 5] })
      expect(r).toEqual({ ok: false, error })
      expect(count).not.toHaveBeenCalled()
      expect(findMany).not.toHaveBeenCalled()
    },
  )
})

describe("listUsers query", () => {
  it("always filters role USER (no search)", async () => {
    await listUsers({})
    expect(findArg().where).toEqual({ role: "USER" })
    expect(count).toHaveBeenCalledTimes(1)
    expect(count).toHaveBeenCalledWith({ where: { role: "USER" } })
  })

  it("search builds a case-insensitive OR on fullName and email, role USER kept", async () => {
    await listUsers({ q: "  Ana  " })
    expect(findArg().where).toEqual({
      role: "USER",
      OR: [
        { fullName: { contains: "Ana", mode: "insensitive" } },
        { email: { contains: "Ana", mode: "insensitive" } },
      ],
    })
    // total counts all USERs; matching counts the search.
    expect(count).toHaveBeenCalledWith({ where: { role: "USER" } })
    expect(count).toHaveBeenCalledWith({ where: findArg().where })
  })

  it("escapes %, _ and backslash so they match literally", async () => {
    await listUsers({ q: "50%_a\\b" })
    expect(findArg().where.OR).toEqual([
      { fullName: { contains: "50\\%\\_a\\\\b", mode: "insensitive" } },
      { email: { contains: "50\\%\\_a\\\\b", mode: "insensitive" } },
    ])
  })

  it.each(["", "   ", undefined, null, 5, ["a"], { a: 1 }])(
    "empty/invalid q %j means no search",
    async (q) => {
      await listUsers({ q })
      expect(findArg().where).toEqual({ role: "USER" })
    },
  )

  it("caps q at 100 chars", async () => {
    await listUsers({ q: "a".repeat(500) })
    const w = findArg().where.OR as { fullName: { contains: string } }[]
    expect(w[0].fullName.contains).toHaveLength(100)
  })

  it("orders createdAt desc then id asc, take 20, skip by page", async () => {
    count.mockResolvedValue(45)
    await listUsers({ page: "3" })
    const a = findArg()
    expect(a.orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }])
    expect(a.take).toBe(20)
    expect(a.skip).toBe(40)
  })

  it("selects only whitelisted fields", async () => {
    await listUsers({})
    expect(findArg().select).toEqual({
      id: true,
      fullName: true,
      email: true,
      createdAt: true,
      birthday: true,
      profession: true,
      occupation: true,
      ikigai: true,
      inviteCode: { select: { code: true } },
    })
  })

  it("clamps a page past the end to the last page", async () => {
    count.mockResolvedValue(27)
    const r = await listUsers({ page: "999" })
    expect(r).toMatchObject({ ok: true, page: 2, pageCount: 2 })
    expect(findArg().skip).toBe(20)
  })

  it.each([undefined, "abc", "0", "-3", "2.7", ["2"], "99999999999999999999"])(
    "page %j falls back to 1 (or clamps) with 100 users",
    async (page) => {
      count.mockResolvedValue(100)
      const r = await listUsers({ page })
      expect(r).toMatchObject({ ok: true, page: 1 })
      expect(findArg().skip).toBe(0)
    },
  )

  it("valid page 3 is honored; huge safe integer clamps to last", async () => {
    count.mockResolvedValue(100)
    expect(await listUsers({ page: "3" })).toMatchObject({ page: 3 })
    vi.clearAllMocks()
    count.mockResolvedValue(100)
    findMany.mockResolvedValue([])
    expect(await listUsers({ page: "99999999999" })).toMatchObject({ page: 5 })
  })
})

describe("listUsers result", () => {
  it("shapes rows with ISO strings and total vs matching", async () => {
    count.mockResolvedValueOnce(27).mockResolvedValueOnce(3)
    findMany.mockResolvedValue([
      {
        id: "u1",
        fullName: "Ana",
        email: "ana@x.test",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        birthday: new Date("1990-05-15T00:00:00Z"),
        profession: "Dev",
        occupation: null,
        ikigai: "Ayudar",
        inviteCode: { code: "ABC" },
      },
      {
        id: "u2",
        fullName: "Beto",
        email: "b@x.test",
        createdAt: new Date("2026-04-01T10:00:00Z"),
        birthday: null,
        profession: null,
        occupation: "Chef",
        ikigai: null,
        inviteCode: null,
      },
    ])
    const r = await listUsers({ q: "a" })
    expect(r).toEqual({
      ok: true,
      users: [
        {
          id: "u1",
          fullName: "Ana",
          email: "ana@x.test",
          createdAt: "2026-05-01T10:00:00.000Z",
          birthday: "1990-05-15T00:00:00.000Z",
          profession: "Dev",
          occupation: null,
          ikigai: "Ayudar",
          inviteCode: "ABC",
        },
        {
          id: "u2",
          fullName: "Beto",
          email: "b@x.test",
          createdAt: "2026-04-01T10:00:00.000Z",
          birthday: null,
          profession: null,
          occupation: "Chef",
          ikigai: null,
          inviteCode: null,
        },
      ],
      total: 27,
      matching: 3,
      page: 1,
      pageCount: 1,
      pageSize: 20,
      q: "a",
    })
  })

  it("without a search, matching equals total", async () => {
    count.mockResolvedValue(27)
    expect(await listUsers({})).toMatchObject({
      total: 27,
      matching: 27,
      pageCount: 2,
    })
  })

  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
  ])("pageCount for %i users is %i", (n, pages) => {
    expect(computePageCount(n)).toBe(pages)
  })

  it("a thrown Prisma error -> UNEXPECTED without text", async () => {
    count.mockRejectedValue(new Error("db password leaked"))
    const r = await listUsers({})
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    findMany.mockRejectedValue(new Error("boom"))
    count.mockResolvedValue(1)
    expect(await listUsers({})).toEqual({ ok: false, error: "UNEXPECTED" })
  })
})

describe("usersQuery helpers", () => {
  it.each([
    [undefined, 1],
    ["abc", 1],
    ["0", 1],
    ["-3", 1],
    ["2.7", 1],
    ["99999999999999999999", 1],
    [["2"], 1],
    ["3", 3],
    ["1", 1],
  ])("parsePage(%j) = %i", (v, expected) => {
    expect(parsePage(v)).toBe(expected)
  })

  it("normalizeSearch trims and caps", () => {
    expect(normalizeSearch("  x  ")).toBe("x")
    expect(normalizeSearch("a".repeat(150))).toHaveLength(100)
    expect(normalizeSearch(["x"])).toBe("")
  })

  it("normalizeSearch strips NUL and control characters", () => {
    expect(normalizeSearch("\u0000")).toBe("")
    expect(normalizeSearch("ab\u0000c")).toBe("abc")
    expect(normalizeSearch("a\tb\nc\u007fd")).toBe("abcd")
    expect(normalizeSearch("José Núñez")).toBe("José Núñez")
    const capped = normalizeSearch("\u0000".repeat(50) + "a".repeat(150))
    expect(capped).toBe("a".repeat(100))
  })

  it("listUsers with a NUL-only q does not search", async () => {
    await listUsers({ q: "\u0000" })
    expect(findArg().where).toEqual({ role: "USER" })
  })

  it("escapeLike escapes wildcards and backslash", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d")
    expect(escapeLike("plain")).toBe("plain")
  })

  it("clampPage", () => {
    expect(clampPage(9, 3)).toBe(3)
    expect(clampPage(0, 3)).toBe(1)
    expect(clampPage(2, 3)).toBe(2)
  })

  it("buildUsersHref preserves and URL-encodes q", () => {
    expect(buildUsersHref("/admin/users", 1, "")).toBe("/admin/users")
    expect(buildUsersHref("/admin/users", 2, "")).toBe("/admin/users?page=2")
    expect(buildUsersHref("/admin/users", 1, "ana")).toBe("/admin/users?q=ana")
    const href = buildUsersHref("/admin/users", 3, "a&b=c %_é")
    expect(href).toBe("/admin/users?q=a%26b%3Dc+%25_%C3%A9&page=3")
    const q = new URL(href, "http://x").searchParams
    expect(q.get("q")).toBe("a&b=c %_é")
    expect(q.get("page")).toBe("3")
  })
})

describe("date formatting", () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it("fmtDateOnly does not shift the day in a UTC-5 process timezone", () => {
    process.env.TZ = "America/Lima"
    const iso = new Date("1990-05-15T00:00:00Z").toISOString()
    expect(fmtDateOnly(iso)).toBe("15 may. 1990")
    // Sanity: a local-time formatter would have shown the 14th.
    expect(new Date(iso).getDate()).toBe(14)
  })

  it("fmtDateOnly is stable in a UTC+ timezone too", () => {
    process.env.TZ = "Pacific/Auckland"
    expect(fmtDateOnly("1990-05-15T00:00:00.000Z")).toBe("15 may. 1990")
  })

  it("fmtDate formats an instant in Lima time", () => {
    expect(fmtDate("2026-05-16T03:00:00.000Z")).toBe("15 may. 2026")
  })
})
