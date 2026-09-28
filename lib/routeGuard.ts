export type Role = "ADMIN" | "USER"

export type RouteDecision = { type: "next" } | { type: "redirect"; to: string }

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}

export function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding" || pathname.startsWith("/onboarding/")
}

/**
 * Pure routing decision for the proxy (no I/O). A user with no
 * `public.User` row must be passed as `hasUser: false`. A missing/unknown role
 * never grants access to `/admin`, and a missing `onboardingCompleted` counts
 * as "not completed" (fail closed).
 *
 * Redirect targets never loop: every path/state terminates in at most two
 * hops (e.g. USER incomplete on /admin -> /calendar -> /onboarding).
 */
export function decideRoute(input: {
  pathname: string
  hasUser: boolean
  role?: Role | string | null
  onboardingCompleted?: boolean | null
}): RouteDecision {
  const { pathname, role } = input
  if (!input.hasUser) return { type: "redirect", to: "/login" }

  const isAdmin = role === "ADMIN"
  const completed = input.onboardingCompleted === true

  if (isAdminPath(pathname)) {
    return isAdmin ? { type: "next" } : { type: "redirect", to: "/calendar" }
  }
  if (isOnboardingPath(pathname)) {
    if (isAdmin) return { type: "redirect", to: "/admin" }
    return completed ? { type: "redirect", to: "/calendar" } : { type: "next" }
  }
  // Any other protected path (/calendar): non-admins must be onboarded.
  if (!isAdmin && !completed) return { type: "redirect", to: "/onboarding" }
  return { type: "next" }
}
