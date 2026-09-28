import { beforeEach, describe, expect, it, vi } from "vitest"

const requireAdmin = vi.fn()
const count = vi.fn()
const findMany = vi.fn()
const findUnique = vi.fn()
const updateMany = vi.fn()
const update = vi.fn()
const del = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    inviteCode: {
      count: (...a: unknown[]) => count(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
}))

import { listInviteCodes, revokeInviteCode } from "@/lib/actions/invites"
import {
  CODES_PAGE_SIZE,
  buildCodesHref,
  parseCodeStatus,
} from "@/lib/codesQuery"
import { revokeErrorMessage } from "@/components/admin/generateCodesModel"
import { STRINGS } from "@/lib/strings"
import { computePageCount } from "@/lib/usersQuery"

const admin = { id: "a", email: "a@x.test", fullName: "A", role: "ADMIN" }
const t = STRINGS.admin.codes

function allPrismaUntouched() {
  for (const m of [count, findMany, findUnique, updateMany, update, del]) {
    expect(m).not.toHaveBeenCalled()
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  requireAdmin.mockResolvedValue({ ok: true, user: admin })
})

describe("listInviteCodes: guard", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "%s -> typed error, Prisma untouched, even with garbage input",
    async (error) => {
      requireAdmin.mockResolvedValue({ ok: false, error })
      const garbage = { page: { $gt: 1 }, status: ["USED"] }
      expect(await listInviteCodes(garbage)).toEqual({ ok: false, error })
      allPrismaUntouched()
    },
  )
})

describe("listInviteCodes: query", () => {
  beforeEach(() => {
    count.mockResolvedValue(0)
    findMany.mockResolvedValue([])
  })

  it.each(["UNUSED", "USED", "EXPIRED"])("status %s filters", async (s) => {
    await listInviteCodes({ status: s })
    expect(count).toHaveBeenCalledWith({ where: { status: s } })
    expect(findMany.mock.calls[0][0].where).toEqual({ status: s })
  })

  it.each([undefined, "", "unused", "ALL", "USED ", 1, null, ["USED"], {}])(
    "status %j means all (no where.status)",
    async (s) => {
      const r = await listInviteCodes({ status: s })
      expect(count).toHaveBeenCalledWith({ where: {} })
      expect(findMany.mock.calls[0][0].where).toEqual({})
      expect(r).toMatchObject({ ok: true, status: null })
    },
  )

  it("uses page size 25, stable ordering and an exact select whitelist", async () => {
    await listInviteCodes({})
    const arg = findMany.mock.calls[0][0]
    expect(CODES_PAGE_SIZE).toBe(25)
    expect(arg.take).toBe(25)
    expect(arg.skip).toBe(0)
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }])
    expect(arg.select).toEqual({
      id: true,
      code: true,
      status: true,
      createdAt: true,
      usedAt: true,
      usedBy: { select: { fullName: true, email: true } },
    })
  })

  it("parses and clamps the page", async () => {
    count.mockResolvedValue(60) // 3 pages
    const r = await listInviteCodes({ page: "2" })
    expect(findMany.mock.calls[0][0].skip).toBe(25)
    expect(r).toMatchObject({ page: 2, pageCount: 3, total: 60, pageSize: 25 })

    findMany.mockClear()
    const beyond = await listInviteCodes({ page: "999" })
    expect(findMany.mock.calls[0][0].skip).toBe(50)
    expect(beyond).toMatchObject({ page: 3 })

    for (const bad of ["0", "-1", "abc", "1.5", undefined, ["2"]]) {
      findMany.mockClear()
      const r2 = await listInviteCodes({ page: bad })
      expect(r2).toMatchObject({ page: 1 })
      expect(findMany.mock.calls[0][0].skip).toBe(0)
    }
  })

  it("an empty table is page 1 of 1", async () => {
    expect(await listInviteCodes({ page: "5" })).toMatchObject({
      ok: true,
      codes: [],
      total: 0,
      page: 1,
      pageCount: 1,
    })
  })

  it("maps UNUSED / USED (with consumer) / EXPIRED rows with ISO dates", async () => {
    const created = new Date("2026-03-01T10:00:00Z")
    const used = new Date("2026-03-02T11:30:00Z")
    count.mockResolvedValue(3)
    findMany.mockResolvedValue([
      {
        id: "1",
        code: "AAA",
        status: "UNUSED",
        createdAt: created,
        usedAt: null,
        usedBy: null,
      },
      {
        id: "2",
        code: "BBB",
        status: "USED",
        createdAt: created,
        usedAt: used,
        usedBy: { fullName: "Ana Pérez", email: "ana@x.test" },
      },
      {
        id: "3",
        code: "CCC",
        status: "EXPIRED",
        createdAt: created,
        usedAt: null,
        usedBy: null,
      },
    ])
    const r = await listInviteCodes({})
    expect(r).toEqual({
      ok: true,
      total: 3,
      page: 1,
      pageCount: 1,
      pageSize: 25,
      status: null,
      codes: [
        {
          id: "1",
          code: "AAA",
          status: "UNUSED",
          createdAt: "2026-03-01T10:00:00.000Z",
          usedAt: null,
          usedBy: null,
        },
        {
          id: "2",
          code: "BBB",
          status: "USED",
          createdAt: "2026-03-01T10:00:00.000Z",
          usedAt: "2026-03-02T11:30:00.000Z",
          usedBy: { fullName: "Ana Pérez", email: "ana@x.test" },
        },
        {
          id: "3",
          code: "CCC",
          status: "EXPIRED",
          createdAt: "2026-03-01T10:00:00.000Z",
          usedAt: null,
          usedBy: null,
        },
      ],
    })
  })

  it("does not leak extra fields the query happened to return", async () => {
    count.mockResolvedValue(1)
    findMany.mockResolvedValue([
      {
        id: "1",
        code: "AAA",
        status: "USED",
        createdAt: new Date(0),
        usedAt: new Date(0),
        usedBy: { fullName: "N", email: "e@x.test", id: "u", role: "USER" },
        secret: "x",
      },
    ])
    const r = await listInviteCodes({})
    if (!r.ok) throw new Error("expected ok")
    expect(Object.keys(r.codes[0]).sort()).toEqual(
      ["code", "createdAt", "id", "status", "usedAt", "usedBy"].sort(),
    )
    expect(Object.keys(r.codes[0].usedBy!).sort()).toEqual([
      "email",
      "fullName",
    ])
  })

  it("a thrown error becomes UNEXPECTED without text", async () => {
    count.mockRejectedValue(new Error("db exploded: secret"))
    const r = await listInviteCodes({})
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret")
  })
})

describe("revokeInviteCode: guard and input", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)(
    "%s -> typed error, Prisma untouched",
    async (error) => {
      requireAdmin.mockResolvedValue({ ok: false, error })
      expect(await revokeInviteCode({ id: "x" })).toEqual({ ok: false, error })
      allPrismaUntouched()
    },
  )

  it.each([
    undefined,
    null,
    {},
    { id: "" },
    { id: 5 },
    { id: null },
    { id: ["a"] },
    { id: { $ne: "x" } },
    { id: "x".repeat(101) },
  ])("invalid input %j -> INVALID_INPUT, Prisma untouched", async (input) => {
    const r = await revokeInviteCode(input as unknown as { id: string })
    expect(r).toEqual({ ok: false, error: "INVALID_INPUT" })
    allPrismaUntouched()
  })
})

describe("revokeInviteCode: write", () => {
  it("issues exactly one conditional updateMany and returns ok", async () => {
    updateMany.mockResolvedValue({ count: 1 })
    expect(await revokeInviteCode({ id: "c1" })).toEqual({ ok: true })
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "c1", status: "UNUSED" },
      data: { status: "EXPIRED" },
    })
    expect(findUnique).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it("count 0 on a USED code -> NOT_REVOKABLE (nothing else written)", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    findUnique.mockResolvedValue({ id: "c1" })
    expect(await revokeInviteCode({ id: "c1" })).toEqual({
      ok: false,
      error: "NOT_REVOKABLE",
    })
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it("count 0 on an already EXPIRED code -> NOT_REVOKABLE", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    findUnique.mockResolvedValue({ id: "c2" })
    expect(await revokeInviteCode({ id: "c2" })).toEqual({
      ok: false,
      error: "NOT_REVOKABLE",
    })
  })

  it("count 0 on a missing id -> NOT_FOUND", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    findUnique.mockResolvedValue(null)
    expect(await revokeInviteCode({ id: "nope" })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    })
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "nope" },
      select: { id: true },
    })
  })

  it("a thrown error becomes UNEXPECTED without text", async () => {
    updateMany.mockRejectedValue(new Error("boom secret"))
    const r = await revokeInviteCode({ id: "c1" })
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret")
  })

  it("a thrown lookup error becomes UNEXPECTED", async () => {
    updateMany.mockResolvedValue({ count: 0 })
    findUnique.mockRejectedValue(new Error("boom"))
    expect(await revokeInviteCode({ id: "c1" })).toEqual({
      ok: false,
      error: "UNEXPECTED",
    })
  })
})

describe("revoke vs registration race on one code", () => {
  type Row = { id: string; status: "UNUSED" | "USED" | "EXPIRED" }

  /** In-memory fake with the conditional-update semantics of Postgres. */
  function fakeStore(row: Row) {
    updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string; status: Row["status"] }
        data: { status: Row["status"] }
      }) => {
        if (row.id === where.id && row.status === where.status) {
          row.status = data.status
          return { count: 1 }
        }
        return { count: 0 }
      },
    )
    findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === row.id ? { id: row.id } : null,
    )
    return row
  }

  // Same claim call as `register` in lib/actions/auth.ts.
  const claim = async (id: string) => {
    const { prisma } = await import("@/lib/db")
    const r = await prisma.inviteCode.updateMany({
      where: { id, status: "UNUSED" },
      data: { status: "USED" },
    })
    return r.count === 1
  }

  it("revoke first: registration claim is rejected", async () => {
    const row = fakeStore({ id: "c", status: "UNUSED" })
    expect(await revokeInviteCode({ id: "c" })).toEqual({ ok: true })
    expect(await claim("c")).toBe(false)
    expect(row.status).toBe("EXPIRED")
  })

  it("claim first: revoke is refused and the code stays USED", async () => {
    const row = fakeStore({ id: "c", status: "UNUSED" })
    expect(await claim("c")).toBe(true)
    expect(await revokeInviteCode({ id: "c" })).toEqual({
      ok: false,
      error: "NOT_REVOKABLE",
    })
    expect(row.status).toBe("USED")
  })

  it("concurrently: exactly one wins, in either start order", async () => {
    for (const order of ["revokeFirst", "claimFirst"] as const) {
      const row = fakeStore({ id: "c", status: "UNUSED" })
      const jobs =
        order === "revokeFirst"
          ? [revokeInviteCode({ id: "c" }), claim("c")]
          : [claim("c"), revokeInviteCode({ id: "c" })]
      const results = await Promise.all(jobs)
      const revoked = (order === "revokeFirst" ? results[0] : results[1]) as {
        ok: boolean
      }
      const claimed = (
        order === "revokeFirst" ? results[1] : results[0]
      ) as boolean
      expect(Number(revoked.ok) + Number(claimed)).toBe(1)
      expect(row.status).toBe(claimed ? "USED" : "EXPIRED")
    }
  })
})

describe("codesQuery helpers", () => {
  it("parseCodeStatus whitelists exactly the three statuses", () => {
    expect(parseCodeStatus("UNUSED")).toBe("UNUSED")
    expect(parseCodeStatus("USED")).toBe("USED")
    expect(parseCodeStatus("EXPIRED")).toBe("EXPIRED")
    for (const v of ["used", "", "ALL", undefined, null, 1, ["USED"], {}]) {
      expect(parseCodeStatus(v)).toBeNull()
    }
  })

  it("buildCodesHref preserves status and page, omitting defaults", () => {
    expect(buildCodesHref("/admin/codes", 1, null)).toBe("/admin/codes")
    expect(buildCodesHref("/admin/codes", 3, null)).toBe("/admin/codes?page=3")
    expect(buildCodesHref("/admin/codes", 1, "USED")).toBe(
      "/admin/codes?status=USED",
    )
    expect(buildCodesHref("/admin/codes", 2, "EXPIRED")).toBe(
      "/admin/codes?status=EXPIRED&page=2",
    )
  })

  it("computePageCount accepts a page size and keeps the users default", () => {
    expect(computePageCount(0, 25)).toBe(1)
    expect(computePageCount(25, 25)).toBe(1)
    expect(computePageCount(26, 25)).toBe(2)
    expect(computePageCount(21)).toBe(2) // default 20
  })
})

describe("revokeErrorMessage", () => {
  it("maps each error code to its es-PE message", () => {
    expect(revokeErrorMessage("UNAUTHENTICATED")).toBe(
      t.revokeErrorUnauthenticated,
    )
    expect(revokeErrorMessage("FORBIDDEN")).toBe(t.revokeErrorForbidden)
    expect(revokeErrorMessage("NOT_FOUND")).toBe(t.revokeErrorNotFound)
    expect(revokeErrorMessage("NOT_REVOKABLE")).toBe(t.revokeErrorNotRevokable)
    expect(revokeErrorMessage("INVALID_INPUT")).toBe(t.revokeErrorGeneric)
    expect(revokeErrorMessage("UNEXPECTED")).toBe(t.revokeErrorGeneric)
  })
})
