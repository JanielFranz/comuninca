import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getCurrentUser = vi.fn()
const findUnique = vi.fn()
const updateMany = vi.fn()
const updateSession = vi.fn()
const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
const revalidatePath = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }))
vi.mock("@/lib/currentUser", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}))
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (...a: unknown[]) => updateSession(...a),
}))

import { completeOnboarding } from "@/lib/actions/onboarding"
import { requireOnboardedUserOrRedirect } from "@/lib/auth"
import { decideRoute, type RouteDecision } from "@/lib/routeGuard"
import { STRINGS } from "@/lib/strings"
import { onboardingSchema } from "@/lib/validation/onboarding"
import { proxy } from "@/proxy"

const base = { id: "u1", email: "a@x.test", fullName: "A" }
const newUser = { ...base, role: "USER" as const, onboardingCompleted: false }
const doneUser = { ...newUser, onboardingCompleted: true }
const admin = {
  ...base,
  id: "u2",
  role: "ADMIN" as const,
  onboardingCompleted: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("onboardingSchema", () => {
  const t = STRINGS.onboarding

  it.each(["", "   ", undefined])("rejects occupation %j as required", (v) => {
    const r = onboardingSchema.safeParse({ occupation: v })
    expect(r.success).toBe(false)
    expect(!r.success && r.error.issues[0].message).toBe(t.occupationRequired)
  })

  it("rejects occupation over 100 chars, accepts exactly 100", () => {
    const r = onboardingSchema.safeParse({ occupation: "a".repeat(101) })
    expect(!r.success && r.error.issues[0].message).toBe(t.occupationTooLong)
    expect(
      onboardingSchema.safeParse({ occupation: "a".repeat(100) }).success,
    ).toBe(true)
  })

  it("enforces profession 100 and ikigai 500 max lengths", () => {
    const p = onboardingSchema.safeParse({
      occupation: "x",
      profession: "p".repeat(101),
    })
    expect(!p.success && p.error.issues[0].message).toBe(t.professionTooLong)
    const i = onboardingSchema.safeParse({
      occupation: "x",
      ikigai: "i".repeat(501),
    })
    expect(!i.success && i.error.issues[0].message).toBe(t.ikigaiTooLong)
    expect(
      onboardingSchema.safeParse({ occupation: "x", ikigai: "i".repeat(500) })
        .success,
    ).toBe(true)
  })

  it("trims and turns empty optionals into undefined", () => {
    const r = onboardingSchema.parse({
      occupation: "  Docente  ",
      profession: "   ",
      ikigai: "",
    })
    expect(r).toEqual({
      occupation: "Docente",
      profession: undefined,
      ikigai: undefined,
    })
    expect(
      onboardingSchema.parse({
        occupation: "a",
        profession: " Ing. ",
        ikigai: " meta ",
      }),
    ).toEqual({ occupation: "a", profession: "Ing.", ikigai: "meta" })
  })
})

describe("completeOnboarding", () => {
  const input = { profession: " Ing. ", occupation: " Docente ", ikigai: "" }

  it("unauthenticated -> UNAUTHENTICATED, Prisma untouched", async () => {
    getCurrentUser.mockResolvedValue(null)
    expect(await completeOnboarding(input)).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
    })
    expect(updateMany).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("ADMIN -> FORBIDDEN, no write", async () => {
    getCurrentUser.mockResolvedValue(admin)
    expect(await completeOnboarding(input)).toEqual({
      ok: false,
      error: "FORBIDDEN",
    })
    expect(updateMany).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("invalid input -> INVALID_INPUT with per-field message, no write", async () => {
    getCurrentUser.mockResolvedValue(newUser)
    expect(await completeOnboarding({ occupation: "  " })).toEqual({
      ok: false,
      error: "INVALID_INPUT",
      fields: { occupation: STRINGS.onboarding.occupationRequired },
    })
    expect(updateMany).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("success: one conditional write, empty optionals become null", async () => {
    getCurrentUser.mockResolvedValue(newUser)
    updateMany.mockResolvedValue({ count: 1 })
    expect(await completeOnboarding(input)).toEqual({
      ok: true,
      redirectTo: "/calendar",
    })
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1", role: "USER", onboardingCompleted: false },
      data: {
        profession: "Ing.",
        occupation: "Docente",
        ikigai: null,
        onboardingCompleted: true,
      },
    })
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith("/calendar")
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding")
  })

  it("count 0 -> ALREADY_COMPLETED", async () => {
    getCurrentUser.mockResolvedValue(newUser)
    updateMany.mockResolvedValue({ count: 0 })
    expect(await completeOnboarding(input)).toEqual({
      ok: false,
      error: "ALREADY_COMPLETED",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("thrown error -> UNEXPECTED without leaking text", async () => {
    getCurrentUser.mockResolvedValue(newUser)
    updateMany.mockRejectedValue(new Error("db exploded secret-host"))
    const r = await completeOnboarding(input)
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret-host")
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("ignores smuggled userId / role / onboardingCompleted keys", async () => {
    getCurrentUser.mockResolvedValue(newUser)
    updateMany.mockResolvedValue({ count: 1 })
    await completeOnboarding({
      occupation: "Docente",
      userId: "victim",
      id: "victim",
      role: "ADMIN",
      onboardingCompleted: false,
    } as never)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1", role: "USER", onboardingCompleted: false },
      data: {
        profession: null,
        occupation: "Docente",
        ikigai: null,
        onboardingCompleted: true,
      },
    })
  })
})

describe("requireOnboardedUserOrRedirect", () => {
  it("no session -> /login", async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireOnboardedUserOrRedirect()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
  })

  it("USER incomplete -> /onboarding", async () => {
    getCurrentUser.mockResolvedValue(newUser)
    await expect(requireOnboardedUserOrRedirect()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    )
  })

  it("USER completed -> the user", async () => {
    getCurrentUser.mockResolvedValue(doneUser)
    expect(await requireOnboardedUserOrRedirect()).toBe(doneUser)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("ADMIN is never gated, even with the flag false", async () => {
    getCurrentUser.mockResolvedValue(admin)
    expect(await requireOnboardedUserOrRedirect()).toBe(admin)
    expect(redirect).not.toHaveBeenCalled()
  })
})

type State = "anon" | "userIncomplete" | "userComplete" | "admin" | "noRow"
const PATHS = ["/calendar", "/calendar/x", "/onboarding", "/admin", "/admin/x"]

function decide(state: State, pathname: string): RouteDecision {
  switch (state) {
    case "anon":
    case "noRow":
      return decideRoute({ pathname, hasUser: false })
    case "userIncomplete":
      return decideRoute({
        pathname,
        hasUser: true,
        role: "USER",
        onboardingCompleted: false,
      })
    case "userComplete":
      return decideRoute({
        pathname,
        hasUser: true,
        role: "USER",
        onboardingCompleted: true,
      })
    case "admin":
      return decideRoute({
        pathname,
        hasUser: true,
        role: "ADMIN",
        onboardingCompleted: false,
      })
  }
}

describe("decideRoute onboarding matrix", () => {
  const next = { type: "next" }
  const to = (p: string) => ({ type: "redirect", to: p })
  const expected: Record<State, Record<string, unknown>> = {
    anon: Object.fromEntries(PATHS.map((p) => [p, to("/login")])),
    noRow: Object.fromEntries(PATHS.map((p) => [p, to("/login")])),
    userIncomplete: {
      "/calendar": to("/onboarding"),
      "/calendar/x": to("/onboarding"),
      "/onboarding": next,
      "/admin": to("/calendar"),
      "/admin/x": to("/calendar"),
    },
    userComplete: {
      "/calendar": next,
      "/calendar/x": next,
      "/onboarding": to("/calendar"),
      "/admin": to("/calendar"),
      "/admin/x": to("/calendar"),
    },
    admin: {
      "/calendar": next,
      "/calendar/x": next,
      "/onboarding": to("/admin"),
      "/admin": next,
      "/admin/x": next,
    },
  }

  for (const state of Object.keys(expected) as State[]) {
    for (const path of PATHS) {
      it(`${state} on ${path}`, () => {
        expect(decide(state, path)).toEqual(expected[state][path])
      })
    }
  }

  it("missing onboardingCompleted counts as incomplete (fail closed)", () => {
    expect(
      decideRoute({ pathname: "/calendar", hasUser: true, role: "USER" }),
    ).toEqual(to("/onboarding"))
  })

  it("every state/path terminates in at most 2 redirect hops", () => {
    for (const state of Object.keys(expected) as State[]) {
      for (const start of PATHS) {
        let path = start
        let hops = 0
        for (;;) {
          const d = decide(state, path)
          if (d.type === "next" || d.to === "/login") break
          path = d.to
          hops++
          expect(hops).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})

describe("proxy onboarding gate", () => {
  const req = (p: string) =>
    new NextRequest(new URL(p, "http://localhost:3000"))

  it("USER incomplete on /calendar -> 307 /onboarding, cookies carried", async () => {
    const refreshed = NextResponse.next()
    refreshed.cookies.set("sb-token", "fresh", { path: "/" })
    updateSession.mockResolvedValue({ response: refreshed, user: { id: "u1" } })
    findUnique.mockResolvedValue({ role: "USER", onboardingCompleted: false })
    const res = await proxy(req("/calendar"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding")
    expect(res.headers.get("set-cookie")).toContain("sb-token=fresh")
  })

  it("USER complete on /onboarding -> /calendar; ADMIN -> /admin", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
    })
    findUnique.mockResolvedValue({ role: "USER", onboardingCompleted: true })
    expect((await proxy(req("/onboarding"))).headers.get("location")).toBe(
      "http://localhost:3000/calendar",
    )
    findUnique.mockResolvedValue({ role: "ADMIN", onboardingCompleted: false })
    expect((await proxy(req("/onboarding"))).headers.get("location")).toBe(
      "http://localhost:3000/admin",
    )
  })

  it("USER incomplete on /onboarding passes through", async () => {
    const passthrough = NextResponse.next()
    updateSession.mockResolvedValue({
      response: passthrough,
      user: { id: "u1" },
    })
    findUnique.mockResolvedValue({ role: "USER", onboardingCompleted: false })
    expect(await proxy(req("/onboarding"))).toBe(passthrough)
  })

  it("no public.User row -> /login on every matched path", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "ghost" },
    })
    findUnique.mockResolvedValue(null)
    for (const p of ["/calendar", "/onboarding", "/admin"]) {
      expect((await proxy(req(p))).headers.get("location")).toBe(
        "http://localhost:3000/login",
      )
    }
  })

  it("lookup throwing -> /login without leaking text", async () => {
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
    })
    findUnique.mockRejectedValue(new Error("db exploded secret-host"))
    const res = await proxy(req("/calendar"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
    expect(await res.text()).not.toContain("secret-host")
  })
})
