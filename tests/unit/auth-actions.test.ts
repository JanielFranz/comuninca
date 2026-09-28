import { beforeEach, describe, expect, it, vi } from "vitest"

const signInWithPassword = vi.fn()
const authSignOut = vi.fn()
const findUnique = vi.fn()
const createClient = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}))
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))

import { signIn, signOut } from "@/lib/actions/auth"

const valid = { email: "ava@seed.comuninca.test", password: "s3cret-pass" }

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue({
    auth: { signInWithPassword, signOut: authSignOut },
  })
  authSignOut.mockResolvedValue({ error: null })
})

describe("signIn", () => {
  it("routes an ADMIN to /admin", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "u-admin" } },
      error: null,
    })
    findUnique.mockResolvedValue({ role: "ADMIN" })

    expect(await signIn(valid)).toEqual({ ok: true, redirectTo: "/admin" })
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u-admin" },
      select: { role: true },
    })
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith("/admin")
  })

  it("routes a USER to /calendar and trims the email", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    })
    findUnique.mockResolvedValue({ role: "USER" })

    const result = await signIn({ ...valid, email: `  ${valid.email} ` })
    expect(result).toEqual({ ok: true, redirectTo: "/calendar" })
    expect(signInWithPassword).toHaveBeenCalledWith(valid)
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
  })

  it("returns the identical generic result for wrong password and unknown email", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: {
        status: 400,
        code: "invalid_credentials",
        message: "Invalid login credentials",
      },
    })
    const wrongPassword = await signIn(valid)

    signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 400, code: "user_not_found", message: "User not found" },
    })
    const unknownEmail = await signIn({ ...valid, email: "nobody@x.test" })

    expect(wrongPassword).toEqual({ ok: false, error: "INVALID_CREDENTIALS" })
    expect(unknownEmail).toEqual(wrongPassword)
    expect(findUnique).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ["empty email", { email: "", password: "x" }],
    ["malformed email", { email: "not-an-email", password: "x" }],
    ["empty password", { email: valid.email, password: "" }],
  ])(
    "rejects %s as INVALID_INPUT without calling Supabase",
    async (_n, input) => {
      expect(await signIn(input)).toEqual({ ok: false, error: "INVALID_INPUT" })
      expect(signInWithPassword).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it("maps a thrown auth call to UNEXPECTED", async () => {
    signInWithPassword.mockRejectedValue(new Error("network down"))
    expect(await signIn(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([500, 429, undefined])(
    "maps auth status %s to UNEXPECTED, not invalid credentials",
    async (status) => {
      signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { status, message: "boom" },
      })
      expect(await signIn(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it("signs out and returns UNEXPECTED when public.User row is missing", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "ghost" } },
      error: null,
    })
    findUnique.mockResolvedValue(null)

    expect(await signIn(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(authSignOut).toHaveBeenCalledTimes(1)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("maps a database failure to UNEXPECTED", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    })
    findUnique.mockRejectedValue(new Error("db down"))
    expect(await signIn(valid)).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("signOut", () => {
  it("returns ok on success", async () => {
    expect(await signOut()).toEqual({ ok: true })
    expect(authSignOut).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledTimes(3)
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/admin")
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding")
  })

  it("returns UNEXPECTED when Supabase reports an error", async () => {
    authSignOut.mockResolvedValue({ error: { message: "x" } })
    expect(await signOut()).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns UNEXPECTED when the call throws", async () => {
    authSignOut.mockRejectedValue(new Error("network"))
    expect(await signOut()).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
