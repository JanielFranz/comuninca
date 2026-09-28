import { beforeEach, describe, expect, it, vi } from "vitest"

type Code = { id: string; code: string; status: string; usedAt: Date | null }

const store = {
  codes: [] as Code[],
  users: [] as { id: string; email: string }[],
}

const findUniqueCode = vi.fn()
const updateManyCode = vi.fn()
const findFirstUser = vi.fn()
const updateUser = vi.fn()
const transaction = vi.fn()
const createUser = vi.fn()
const deleteUser = vi.fn()
const signInWithPassword = vi.fn()
const createAdminClient = vi.fn()
const revalidatePath = vi.fn()

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    inviteCode: {
      findUnique: (...a: unknown[]) => findUniqueCode(...a),
      updateMany: (...a: unknown[]) => updateManyCode(...a),
    },
    user: { findFirst: (...a: unknown[]) => findFirstUser(...a) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword } }),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}))

import { register } from "@/lib/actions/auth"

const valid = {
  fullName: "  Ana Pérez ",
  email: " Ana@Example.com ",
  password: "s3cret-pass",
  code: "SEED-0001",
}

function seedCode(status = "UNUSED", code = "SEED-0001"): Code {
  const c = { id: "code-1", code, status, usedAt: null }
  store.codes = [c]
  return c
}

// Small in-memory fake honoring the same conditional semantics as the DB.
beforeEach(() => {
  vi.clearAllMocks()
  store.codes = []
  store.users = []
  seedCode()
  findUniqueCode.mockImplementation(async ({ where }) => {
    const c = store.codes.find((x) => x.code === where.code)
    return c ? { id: c.id, status: c.status } : null
  })
  updateManyCode.mockImplementation(async ({ where, data }) => {
    const c = store.codes.find(
      (x) => x.id === where.id && x.status === where.status,
    )
    if (!c) return { count: 0 }
    Object.assign(c, data)
    return { count: 1 }
  })
  findFirstUser.mockImplementation(
    async ({ where }) =>
      store.users.find(
        (u) => u.email.toLowerCase() === where.email.equals.toLowerCase(),
      ) ?? null,
  )
  updateUser.mockResolvedValue({})
  transaction.mockImplementation((fn) => fn({ user: { update: updateUser } }))
  createUser.mockImplementation(async ({ email }) => {
    store.users.push({ id: "auth-1", email })
    return { data: { user: { id: "auth-1" } }, error: null }
  })
  deleteUser.mockResolvedValue({ error: null })
  createAdminClient.mockReturnValue({
    auth: { admin: { createUser, deleteUser } },
  })
  signInWithPassword.mockResolvedValue({ data: {}, error: null })
})

function nothingCreated() {
  expect(createUser).not.toHaveBeenCalled()
  expect(updateUser).not.toHaveBeenCalled()
}

describe("register input validation", () => {
  it.each([[""], ["   "]])(
    "blank code %j gives CODE_REQUIRED without touching anything",
    async (code) => {
      expect(await register({ ...valid, code })).toEqual({
        ok: false,
        error: "CODE_REQUIRED",
      })
      expect(findUniqueCode).not.toHaveBeenCalled()
      expect(updateManyCode).not.toHaveBeenCalled()
      expect(createAdminClient).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["empty name", { fullName: "  " }, "fullName"],
    ["name over 100", { fullName: "a".repeat(101) }, "fullName"],
    ["malformed email", { email: "nope" }, "email"],
    ["password of 7", { password: "1234567" }, "password"],
    ["password of 73", { password: "x".repeat(73) }, "password"],
    ["code over 64", { code: "A".repeat(65) }, "code"],
  ])("%s gives INVALID_INPUT for that field", async (_l, patch, field) => {
    const result = await register({ ...valid, ...patch })
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" })
    expect(Object.keys((result as { fields: object }).fields)).toContain(field)
    expect(findUniqueCode).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("accepts the password and name bounds", async () => {
    const result = await register({
      ...valid,
      fullName: "a".repeat(100),
      password: "x".repeat(72),
    })
    expect(result).toEqual({ ok: true, redirectTo: "/calendar" })
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding")
  })

  it("rejects non-object garbage as INVALID_INPUT", async () => {
    const result = await register(undefined as never)
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("register code checks", () => {
  it("unknown, USED and EXPIRED codes give identical CODE_INVALID and create nothing", async () => {
    const results = []
    results.push(await register({ ...valid, code: "NOPE-0000" }))
    seedCode("USED")
    results.push(await register(valid))
    seedCode("EXPIRED")
    results.push(await register(valid))

    for (const r of results) {
      expect(r).toEqual({ ok: false, error: "CODE_INVALID" })
    }
    expect(updateManyCode).not.toHaveBeenCalled()
    nothingCreated()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("a lost claim race (count 0) gives CODE_INVALID and creates no auth user", async () => {
    updateManyCode.mockResolvedValueOnce({ count: 0 })
    expect(await register(valid)).toEqual({ ok: false, error: "CODE_INVALID" })
    expect(updateManyCode).toHaveBeenCalledTimes(1)
    nothingCreated()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("finds a hyphenless lowercase generated code via normalization", async () => {
    seedCode("UNUSED", "ABCDE-FGHJK-MNPQR-STVWX-YZ012-3")
    const result = await register({
      ...valid,
      code: " abcde fghjk mnpqr stvwx yz012 3 ",
    })
    expect(result).toEqual({ ok: true, redirectTo: "/calendar" })
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding")
  })
})

describe("register email checks", () => {
  it("duplicate email (pre-check, case-insensitive) gives EMAIL_IN_USE without claiming", async () => {
    store.users.push({ id: "x", email: "ana@example.com" })
    expect(await register(valid)).toEqual({ ok: false, error: "EMAIL_IN_USE" })
    expect(updateManyCode).not.toHaveBeenCalled()
    expect(store.codes[0].status).toBe("UNUSED")
    nothingCreated()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ["email_exists code", { status: 422, code: "email_exists" }],
    ["user_already_exists code", { status: 422, code: "user_already_exists" }],
  ])(
    "auth %s after claiming gives EMAIL_IN_USE and reverts the claim",
    async (_l, err) => {
      createUser.mockResolvedValueOnce({ data: { user: null }, error: err })
      expect(await register(valid)).toEqual({
        ok: false,
        error: "EMAIL_IN_USE",
      })
      expect(store.codes[0]).toMatchObject({ status: "UNUSED", usedAt: null })
      expect(deleteUser).not.toHaveBeenCalled()
      expect(updateUser).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )
})

describe("register rollback paths", () => {
  it("HTTP 422 weak_password gives UNEXPECTED (not EMAIL_IN_USE) and reverts the claim", async () => {
    createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, code: "weak_password" },
    })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(store.codes[0]).toMatchObject({ status: "UNUSED", usedAt: null })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("other auth failure gives UNEXPECTED and reverts the claim", async () => {
    createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 500, code: "unexpected_failure" },
    })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(store.codes[0]).toMatchObject({ status: "UNUSED", usedAt: null })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("admin client throwing gives UNEXPECTED and reverts the claim", async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error("missing env")
    })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(store.codes[0].status).toBe("UNUSED")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("User update failing deletes the auth user, reverts the claim, gives UNEXPECTED", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"))
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(deleteUser).toHaveBeenCalledWith("auth-1")
    expect(store.codes[0]).toMatchObject({ status: "UNUSED", usedAt: null })
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deleteUser throwing keeps the claim USED and never masks UNEXPECTED", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"))
    deleteUser.mockRejectedValueOnce(new Error("auth down"))
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(store.codes[0].status).toBe("USED")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deleteUser resolving an error keeps the claim USED and returns UNEXPECTED", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"))
    deleteUser.mockResolvedValueOnce({ error: { status: 500 } })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(store.codes[0].status).toBe("USED")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("register success", () => {
  it("claims the code, creates the confirmed user, links it with role USER and starts a session", async () => {
    const result = await register({ ...valid, role: "ADMIN" } as never)

    expect(result).toEqual({ ok: true, redirectTo: "/calendar" })
    expect(updateManyCode).toHaveBeenCalledWith({
      where: { id: "code-1", status: "UNUSED" },
      data: { status: "USED", usedAt: expect.any(Date) },
    })
    expect(store.codes[0].status).toBe("USED")
    expect(store.codes[0].usedAt).toBeInstanceOf(Date)
    expect(createUser).toHaveBeenCalledWith({
      email: "Ana@Example.com",
      password: "s3cret-pass",
      email_confirm: true,
      user_metadata: { full_name: "Ana Pérez" },
    })
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "auth-1" },
      data: { fullName: "Ana Pérez", inviteCodeId: "code-1", role: "USER" },
    })
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "Ana@Example.com",
      password: "s3cret-pass",
    })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding")
  })

  it("a second registration with the same code is CODE_INVALID", async () => {
    expect(await register(valid)).toEqual({ ok: true, redirectTo: "/calendar" })
    revalidatePath.mockClear()
    const again = await register({ ...valid, email: "otra@example.com" })
    expect(again).toEqual({ ok: false, error: "CODE_INVALID" })
    expect(createUser).toHaveBeenCalledTimes(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("session start failing keeps the account and redirects to /login", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { status: 500 },
    })
    expect(await register(valid)).toEqual({ ok: true, redirectTo: "/login" })
    expect(store.codes[0].status).toBe("USED")
    expect(deleteUser).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("session start throwing keeps the account and redirects to /login", async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("boom"))
    expect(await register(valid)).toEqual({ ok: true, redirectTo: "/login" })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("never returns the password or raw error text", async () => {
    createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 500, message: "leak s3cret-pass" },
    })
    expect(JSON.stringify(await register(valid))).not.toContain("s3cret")
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
