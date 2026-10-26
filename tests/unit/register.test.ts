import { beforeEach, describe, expect, it, vi } from "vitest"

const store = {
  users: [] as { id: string; email: string }[],
}

// Registration is open: nothing may read or spend an invite code. These spies
// exist so any such access fails the tests below.
const findUniqueCode = vi.fn()
const findFirstCode = vi.fn()
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
      findFirst: (...a: unknown[]) => findFirstCode(...a),
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
  birthday: "1990-05-15",
  email: " Ana@Example.com ",
  password: "s3cret-pass",
}

beforeEach(() => {
  vi.clearAllMocks()
  store.users = []
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

function inviteCodesUntouched() {
  expect(findUniqueCode).not.toHaveBeenCalled()
  expect(findFirstCode).not.toHaveBeenCalled()
  expect(updateManyCode).not.toHaveBeenCalled()
}

describe("register input validation", () => {
  it.each([
    ["empty name", { fullName: "  " }, "fullName"],
    ["name over 100", { fullName: "a".repeat(101) }, "fullName"],
    ["empty birthday", { birthday: "" }, "birthday"],
    ["future birthday", { birthday: "2999-01-01" }, "birthday"],
    ["impossible birthday", { birthday: "1990-02-30" }, "birthday"],
    ["malformed email", { email: "nope" }, "email"],
    ["password of 7", { password: "1234567" }, "password"],
    ["password of 73", { password: "x".repeat(73) }, "password"],
  ])("%s gives INVALID_INPUT for that field", async (_l, patch, field) => {
    const result = await register({ ...valid, ...patch })
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" })
    expect(Object.keys((result as { fields: object }).fields)).toContain(field)
    nothingCreated()
    expect(createAdminClient).not.toHaveBeenCalled()
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

describe("register is open (no invite code)", () => {
  it("succeeds without any code and never touches the invite codes", async () => {
    expect(await register(valid)).toEqual({ ok: true, redirectTo: "/calendar" })
    inviteCodesUntouched()
  })

  it.each([
    ["blank", ""],
    ["whitespace", "   "],
    ["unknown", "NOPE-0000"],
    ["oversized", "A".repeat(500)],
  ])(
    "a leftover %s `code` from an old client is ignored, not validated",
    async (_l, code) => {
      const result = await register({ ...valid, code } as never)
      expect(result).toEqual({ ok: true, redirectTo: "/calendar" })
      inviteCodesUntouched()
    },
  )

  it("does not link the new user to any invite code", async () => {
    await register({ ...valid, code: "SEED-0001" } as never)
    const data = updateUser.mock.calls[0][0].data
    expect(data).not.toHaveProperty("inviteCodeId")
  })
})

describe("register email checks", () => {
  it("duplicate email (pre-check, case-insensitive) gives EMAIL_IN_USE", async () => {
    store.users.push({ id: "x", email: "ana@example.com" })
    expect(await register(valid)).toEqual({ ok: false, error: "EMAIL_IN_USE" })
    nothingCreated()
    expect(deleteUser).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ["email_exists code", { status: 422, code: "email_exists" }],
    ["user_already_exists code", { status: 422, code: "user_already_exists" }],
  ])("auth %s gives EMAIL_IN_USE", async (_l, err) => {
    createUser.mockResolvedValueOnce({ data: { user: null }, error: err })
    expect(await register(valid)).toEqual({
      ok: false,
      error: "EMAIL_IN_USE",
    })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("register rollback paths", () => {
  it("HTTP 422 weak_password gives UNEXPECTED (not EMAIL_IN_USE)", async () => {
    createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, code: "weak_password" },
    })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("other auth failure gives UNEXPECTED", async () => {
    createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 500, code: "unexpected_failure" },
    })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(deleteUser).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("admin client throwing gives UNEXPECTED", async () => {
    createAdminClient.mockImplementationOnce(() => {
      throw new Error("missing env")
    })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("User update failing deletes the auth user and gives UNEXPECTED", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"))
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(deleteUser).toHaveBeenCalledWith("auth-1")
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deleteUser throwing never masks UNEXPECTED", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"))
    deleteUser.mockRejectedValueOnce(new Error("auth down"))
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deleteUser resolving an error still returns UNEXPECTED", async () => {
    updateUser.mockRejectedValueOnce(new Error("db down"))
    deleteUser.mockResolvedValueOnce({ error: { status: 500 } })
    expect(await register(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("register success", () => {
  it("creates the confirmed user, fills in the profile with role USER and starts a session", async () => {
    const result = await register({ ...valid, role: "ADMIN" } as never)

    expect(result).toEqual({ ok: true, redirectTo: "/calendar" })
    expect(createUser).toHaveBeenCalledWith({
      email: "Ana@Example.com",
      password: "s3cret-pass",
      email_confirm: true,
      user_metadata: { full_name: "Ana Pérez" },
    })
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "auth-1" },
      data: {
        fullName: "Ana Pérez",
        birthday: new Date("1990-05-15T00:00:00.000Z"),
        role: "USER",
      },
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

  it("two different people can register back to back with no code", async () => {
    expect(await register(valid)).toEqual({ ok: true, redirectTo: "/calendar" })
    const again = await register({ ...valid, email: "otra@example.com" })
    expect(again).toEqual({ ok: true, redirectTo: "/calendar" })
    expect(createUser).toHaveBeenCalledTimes(2)
    inviteCodesUntouched()
  })

  it("session start failing keeps the account and redirects to /login", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { status: 500 },
    })
    expect(await register(valid)).toEqual({ ok: true, redirectTo: "/login" })
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
