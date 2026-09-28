import { beforeEach, describe, expect, it, vi } from "vitest"

const requireAdmin = vi.fn()
const createManyAndReturn = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireAdmin: () => requireAdmin() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    inviteCode: {
      createManyAndReturn: (...a: unknown[]) => createManyAndReturn(...a),
    },
  },
}))

import { generateInviteCodes } from "@/lib/actions/invites"
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  generateInviteCode,
  generateUniqueInviteCodes,
} from "@/lib/inviteCode"
import { STRINGS } from "@/lib/strings"
import {
  GenerateCodesSchema,
  checkQuantityInput,
} from "@/lib/validation/invites"
import {
  copyToClipboard,
  generationErrorMessage,
  joinCodes,
} from "@/components/admin/generateCodesModel"

const FORMAT =
  /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}-[0-9A-HJKMNP-TV-Z]$/
const admin = { id: "a", email: "a@x.test", fullName: "A", role: "ADMIN" }
const t = STRINGS.admin.codes
const CREATED = new Date("2026-01-02T03:04:05Z")

type InsertArg = { data: { code: string }[] }
const echo = async ({ data }: InsertArg) =>
  data.map((d) => ({ code: d.code, createdAt: CREATED }))

beforeEach(() => {
  vi.resetAllMocks()
  requireAdmin.mockResolvedValue({ ok: true, user: admin })
})

describe("generateInviteCodes: guard", () => {
  it("returns UNAUTHENTICATED without touching Prisma, even with bad input", async () => {
    requireAdmin.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" })
    expect(await generateInviteCodes({ count: 999 })).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
    })
    expect(createManyAndReturn).not.toHaveBeenCalled()
  })

  it("returns FORBIDDEN for a USER without touching Prisma", async () => {
    requireAdmin.mockResolvedValue({ ok: false, error: "FORBIDDEN" })
    expect(await generateInviteCodes({ count: 5 })).toEqual({
      ok: false,
      error: "FORBIDDEN",
    })
    expect(await generateInviteCodes({ count: 0 })).toEqual({
      ok: false,
      error: "FORBIDDEN",
    })
    expect(createManyAndReturn).not.toHaveBeenCalled()
  })
})

describe("generateInviteCodes: validation", () => {
  const bad: unknown[] = [
    { count: 0 },
    { count: 51 },
    { count: -1 },
    { count: 1.5 },
    { count: NaN },
    { count: undefined },
    { count: "5" },
    {},
  ]
  it.each(bad)("rejects %j", async (input) => {
    const r = await generateInviteCodes(input as { count: number })
    expect(r).toEqual({ ok: false, error: "INVALID_INPUT" })
    expect(createManyAndReturn).not.toHaveBeenCalled()
  })

  it.each([1, 50])("accepts boundary %i", async (n) => {
    createManyAndReturn.mockImplementation(echo)
    const r = await generateInviteCodes({ count: n })
    expect(r.ok && r.codes.length).toBe(n)
  })
})

describe("generateInviteCodes: success", () => {
  it("returns N unique well-formed codes and inserts only the code", async () => {
    createManyAndReturn.mockImplementation(echo)
    const r = await generateInviteCodes({ count: 37 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.codes).toHaveLength(37)
    expect(new Set(r.codes.map((c) => c.code)).size).toBe(37)
    for (const c of r.codes) {
      expect(c.code).toMatch(FORMAT)
      expect(c.createdAt).toBe("2026-01-02T03:04:05.000Z")
    }
    expect(createManyAndReturn).toHaveBeenCalledTimes(1)
    const arg = createManyAndReturn.mock.calls[0][0] as {
      data: Record<string, unknown>[]
    }
    expect(arg.data).toHaveLength(37)
    for (const row of arg.data) expect(Object.keys(row)).toEqual(["code"])
  })
})

describe("generateInviteCodes: retry and failures", () => {
  const dup = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
  })

  it("retries after a unique violation and still returns N codes", async () => {
    createManyAndReturn.mockRejectedValueOnce(dup).mockImplementation(echo)
    const r = await generateInviteCodes({ count: 4 })
    expect(r.ok && r.codes.length).toBe(4)
    expect(createManyAndReturn).toHaveBeenCalledTimes(2)
  })

  it("returns UNEXPECTED after three consecutive collisions", async () => {
    createManyAndReturn.mockRejectedValue(dup)
    expect(await generateInviteCodes({ count: 3 })).toEqual({
      ok: false,
      error: "UNEXPECTED",
    })
    expect(createManyAndReturn).toHaveBeenCalledTimes(3)
  })

  it("does not leak a generic error message", async () => {
    createManyAndReturn.mockRejectedValue(new Error("secret db password"))
    const r = await generateInviteCodes({ count: 3 })
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret")
    expect(createManyAndReturn).toHaveBeenCalledTimes(1)
  })

  it("never returns a partial set", async () => {
    createManyAndReturn.mockResolvedValue([{ code: "X", createdAt: CREATED }])
    expect(await generateInviteCodes({ count: 3 })).toEqual({
      ok: false,
      error: "UNEXPECTED",
    })
  })
})

describe("invite code generator", () => {
  it("uses a 32-symbol alphabet and 130 bits", () => {
    expect(INVITE_ALPHABET).toHaveLength(32)
    expect(new Set(INVITE_ALPHABET).size).toBe(32)
    expect(INVITE_CODE_LENGTH * Math.log2(INVITE_ALPHABET.length)).toBe(130)
  })

  it("formats codes as 5-5-5-5-5-1 groups", () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(FORMAT)
  })

  it("is deterministic with an injected source and masks high bits", () => {
    const seq = (n: number) => Uint8Array.from({ length: n }, (_, i) => i)
    expect(generateInviteCode(seq)).toBe("01234-56789-ABCDE-FGHJK-MNPQR-S")
    const hi = (n: number) => new Uint8Array(n).fill(255)
    expect(generateInviteCode(hi)).toBe("ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-Z")
    const wrap = (n: number) => new Uint8Array(n).fill(32)
    expect(generateInviteCode(wrap)).toBe("00000-00000-00000-00000-00000-0")
  })

  it("produces no duplicates over thousands of draws", () => {
    const codes = new Set<string>()
    for (let i = 0; i < 5000; i++) codes.add(generateInviteCode())
    expect(codes.size).toBe(5000)
  })

  it("uses every symbol over a large sample", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      for (const ch of generateInviteCode().replaceAll("-", "")) seen.add(ch)
    }
    expect(seen.size).toBe(32)
  })

  it("generateUniqueInviteCodes returns exactly N distinct codes despite repeats", () => {
    let calls = 0
    // First three draws are identical, then values differ.
    const src = (n: number) => new Uint8Array(n).fill(calls++ < 3 ? 1 : calls)
    const codes = generateUniqueInviteCodes(5, src)
    expect(codes).toHaveLength(5)
    expect(new Set(codes).size).toBe(5)
  })
})

describe("quantity validation", () => {
  it.each([
    ["", t.quantityRequired],
    ["   ", t.quantityRequired],
    ["abc", t.quantityNotInteger],
    ["1e2", t.quantityNotInteger],
    ["1.5", t.quantityNotInteger],
    ["0", t.quantityTooLow],
    ["-3", t.quantityTooLow],
    ["51", t.quantityTooHigh],
    ["1000", t.quantityTooHigh],
  ])("%j gives the hint", (raw, hint) => {
    expect(checkQuantityInput(raw)).toEqual({ valid: false, hint })
  })

  it.each([
    ["1", 1],
    [" 7 ", 7],
    ["50", 50],
    ["05", 5],
  ])("%j gives count %i", (raw, count) => {
    expect(checkQuantityInput(raw)).toEqual({ valid: true, count })
  })

  it("schema mirrors the bounds with es-PE messages", () => {
    expect(GenerateCodesSchema.safeParse({ count: 50 }).success).toBe(true)
    const hi = GenerateCodesSchema.safeParse({ count: 51 })
    expect(!hi.success && hi.error.issues[0].message).toBe(t.quantityTooHigh)
    const lo = GenerateCodesSchema.safeParse({ count: 0 })
    expect(!lo.success && lo.error.issues[0].message).toBe(t.quantityTooLow)
  })
})

describe("modal helpers", () => {
  it("maps action errors to es-PE messages", () => {
    expect(generationErrorMessage("UNAUTHENTICATED")).toBe(
      t.errorUnauthenticated,
    )
    expect(generationErrorMessage("FORBIDDEN")).toBe(t.errorForbidden)
    expect(generationErrorMessage("INVALID_INPUT")).toBe(t.errorGeneric)
    expect(generationErrorMessage("UNEXPECTED")).toBe(t.errorGeneric)
  })

  it("joins codes one per line", () => {
    expect(joinCodes(["A", "B", "C"])).toBe("A\nB\nC")
  })

  it("copyToClipboard reports ok, rejection and missing clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await copyToClipboard("x", { writeText })).toBe("ok")
    expect(writeText).toHaveBeenCalledWith("x")
    expect(
      await copyToClipboard("x", {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      }),
    ).toBe("failed")
    expect(await copyToClipboard("x", undefined)).toBe("failed")
  })
})
