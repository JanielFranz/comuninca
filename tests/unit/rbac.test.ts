import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getCurrentUser = vi.fn()
const findUnique = vi.fn()
const updateSession = vi.fn()
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }))
vi.mock("@/lib/currentUser", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (...a: unknown[]) => updateSession(...a),
}))

import {
  requireAdmin,
  requireAdminOrRedirect,
  requireUser,
  requireUserOrRedirect,
} from "@/lib/auth"
import { decideRoute } from "@/lib/routeGuard"
import { config, proxy } from "@/proxy"

const user = {
  id: "u1",
  email: "a@x.test",
  fullName: "A",
  role: "USER" as const,
  onboardingCompleted: true,
}
const admin = { ...user, id: "u2", role: "ADMIN" as const }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("decideRoute", () => {
  it.each(["/calendar", "/admin", "/admin/users/1", "/onboarding"])(
    "unauthenticated %s -> /login",
    (pathname) => {
      expect(decideRoute({ pathname, hasUser: false })).toEqual({
        type: "redirect",
        to: "/login",
      })
    },
  )

  it.each(["/admin", "/admin/x"])("USER on %s -> /calendar", (pathname) => {
    expect(decideRoute({ pathname, hasUser: true, role: "USER" })).toEqual({
      type: "redirect",
      to: "/calendar",
    })
  })

  it("ADMIN on /admin/x -> next", () => {
    expect(
      decideRoute({ pathname: "/admin/x", hasUser: true, role: "ADMIN" }),
    ).toEqual({ type: "next" })
  })

  it("completed USER on /calendar -> next", () => {
    expect(
      decideRoute({
        pathname: "/calendar",
        hasUser: true,
        role: "USER",
        onboardingCompleted: true,
      }),
    ).toEqual({ type: "next" })
  })

  it.each(["/administrator", "/adminx"])("%s is not an admin path", (p) => {
    expect(
      decideRoute({
        pathname: p,
        hasUser: true,
        role: "USER",
        onboardingCompleted: true,
      }),
    ).toEqual({ type: "next" })
  })

  it.each([undefined, null, "SUPERUSER"])(
    "role %s is denied /admin",
    (role) => {
      expect(decideRoute({ pathname: "/admin", hasUser: true, role })).toEqual({
        type: "redirect",
        to: "/calendar",
      })
    },
  )
})

function req(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"))
}

describe("proxy", () => {
  it("redirects unauthenticated requests to /login with 307", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
    })
    const res = await proxy(req("/calendar"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("redirects a USER on /admin to /calendar", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
    })
    findUnique.mockResolvedValue({ role: "USER" })
    const res = await proxy(req("/admin/users"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/calendar")
  })

  it("treats an Auth session without a public.User row as unauthenticated", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "ghost" },
    })
    findUnique.mockResolvedValue(null)
    const res = await proxy(req("/admin"))
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
  })

  it("fails closed when the role lookup throws, without leaking text", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
    })
    findUnique.mockRejectedValue(new Error("db exploded secret-host"))
    const res = await proxy(req("/admin"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
    expect(JSON.stringify([...res.headers])).not.toContain("secret-host")
    expect(await res.text()).not.toContain("secret-host")
  })

  it("fails closed when the session refresh throws", async () => {
    updateSession.mockRejectedValue(new Error("boom"))
    const res = await proxy(req("/calendar"))
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
  })

  it("carries refreshed cookies onto the redirect response", async () => {
    const refreshed = NextResponse.next()
    refreshed.cookies.set("sb-token", "fresh-value", { path: "/" })
    updateSession.mockResolvedValue({ response: refreshed, user: null })
    const res = await proxy(req("/calendar"))
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
    expect(res.headers.get("set-cookie")).toContain("sb-token=fresh-value")
  })

  it("returns the updateSession response for allowed requests", async () => {
    const passthrough = NextResponse.next()
    updateSession.mockResolvedValue({
      response: passthrough,
      user: { id: "u2" },
    })
    findUnique.mockResolvedValue({ role: "ADMIN" })
    expect(await proxy(req("/admin/users"))).toBe(passthrough)
  })

  it("looks up role + onboarding flag for /calendar too", async () => {
    const passthrough = NextResponse.next()
    updateSession.mockResolvedValue({
      response: passthrough,
      user: { id: "u1" },
    })
    findUnique.mockResolvedValue({ role: "USER", onboardingCompleted: true })
    expect(await proxy(req("/calendar"))).toBe(passthrough)
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { role: true, onboardingCompleted: true },
    })
  })
})

describe("config.matcher", () => {
  it("is exactly the three protected areas", () => {
    expect(config.matcher).toEqual([
      "/calendar/:path*",
      "/admin/:path*",
      "/onboarding/:path*",
    ])
  })

  // `/x/:path*` semantics: the bare path or anything below it.
  const matches = (p: string) =>
    config.matcher.some((m) => {
      const base = m.replace("/:path*", "")
      return p === base || p.startsWith(`${base}/`)
    })

  it.each(["/calendar", "/admin", "/admin/users", "/onboarding"])(
    "matches %s",
    (p) => expect(matches(p)).toBe(true),
  )

  it.each([
    "/",
    "/login",
    "/register",
    "/auth/callback",
    "/_next/static/x.js",
    "/favicon.ico",
    "/administrator",
    "/api/x",
  ])("does not match %s", (p) => expect(matches(p)).toBe(false))
})

describe("requireUser / requireAdmin", () => {
  it("no user -> UNAUTHENTICATED", async () => {
    getCurrentUser.mockResolvedValue(null)
    expect(await requireUser()).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(await requireAdmin()).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
    })
  })

  it("USER: ok for requireUser, FORBIDDEN for requireAdmin", async () => {
    getCurrentUser.mockResolvedValue(user)
    expect(await requireUser()).toEqual({ ok: true, user })
    expect(await requireAdmin()).toEqual({ ok: false, error: "FORBIDDEN" })
  })

  it("ADMIN: ok for both with the same user object", async () => {
    getCurrentUser.mockResolvedValue(admin)
    const u = await requireUser()
    const a = await requireAdmin()
    expect(u).toEqual({ ok: true, user: admin })
    expect(a).toEqual({ ok: true, user: admin })
    expect(a.ok && a.user).toBe(admin)
  })

  it("fails closed and does not leak when getCurrentUser throws", async () => {
    getCurrentUser.mockRejectedValue(new Error("connection string leak"))
    const u = await requireUser()
    const a = await requireAdmin()
    expect(u).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(a).toEqual({ ok: false, error: "UNAUTHENTICATED" })
    expect(JSON.stringify([u, a])).not.toContain("leak")
  })
})

describe("page wrappers", () => {
  it("requireUserOrRedirect -> /login without session, user otherwise", async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireUserOrRedirect()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
    getCurrentUser.mockResolvedValue(user)
    expect(await requireUserOrRedirect()).toBe(user)
  })

  it("requireAdminOrRedirect -> /login, /calendar, or the admin", async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireAdminOrRedirect()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
    getCurrentUser.mockResolvedValue(user)
    await expect(requireAdminOrRedirect()).rejects.toThrow(
      "NEXT_REDIRECT:/calendar",
    )
    getCurrentUser.mockResolvedValue(admin)
    expect(await requireAdminOrRedirect()).toBe(admin)
  })
})
