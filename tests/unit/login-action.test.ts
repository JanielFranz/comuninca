import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()
const mockRedirect = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signOut: mockSignOut,
      },
    }),
  ),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

describe("login Server Action", () => {
  let login: (
    prevState: { error: string } | null,
    formData: FormData,
  ) => Promise<{ error: string }>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import("@/lib/actions/auth")
    login = mod.login
  })

  it("returns generic error when email is missing", async () => {
    const formData = new FormData()
    formData.set("password", "somepass")

    const result = await login(null, formData)

    expect(result.error).toBe("Correo o contraseña incorrectos.")
  })

  it("returns generic error when password is missing", async () => {
    const formData = new FormData()
    formData.set("email", "admin@comuninca.pe")

    const result = await login(null, formData)

    expect(result.error).toBe("Correo o contraseña incorrectos.")
  })

  it("returns generic error when Supabase auth rejects credentials", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    })

    const formData = new FormData()
    formData.set("email", "wrong@comuninca.pe")
    formData.set("password", "wrongpass")

    const result = await login(null, formData)

    expect(result.error).toBe("Correo o contraseña incorrectos.")
  })

  it("returns generic error when public.User row is missing after auth success", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "user-123" } },
      error: null,
    })
    const mockFindUnique = (await import("@/lib/db")).prisma.user
      .findUnique as ReturnType<typeof vi.fn>
    mockFindUnique.mockResolvedValueOnce(null)

    const formData = new FormData()
    formData.set("email", "ghost@comuninca.pe")
    formData.set("password", "ghostpass")

    const result = await login(null, formData)

    expect(result.error).toBe("Correo o contraseña incorrectos.")
  })

  it("redirects ADMIN to /admin", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "admin-123" } },
      error: null,
    })
    const mockFindUnique = (await import("@/lib/db")).prisma.user
      .findUnique as ReturnType<typeof vi.fn>
    mockFindUnique.mockResolvedValueOnce({ role: "ADMIN" })

    const formData = new FormData()
    formData.set("email", "admin@comuninca.pe")
    formData.set("password", "admin123")

    await login(null, formData)

    expect(mockRedirect).toHaveBeenCalledWith("/admin")
  })

  it("redirects USER to /calendar", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "user-123" } },
      error: null,
    })
    const mockFindUnique = (await import("@/lib/db")).prisma.user
      .findUnique as ReturnType<typeof vi.fn>
    mockFindUnique.mockResolvedValueOnce({ role: "USER" })

    const formData = new FormData()
    formData.set("email", "user@comuninca.pe")
    formData.set("password", "user123")

    await login(null, formData)

    expect(mockRedirect).toHaveBeenCalledWith("/calendar")
  })
})

describe("logout Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls signOut and redirects to /login", async () => {
    const { logout } = await import("@/lib/actions/auth")
    await logout()

    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})
