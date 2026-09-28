import "server-only"

import { redirect } from "next/navigation"
import { getCurrentUser, type CurrentAppUser } from "@/lib/currentUser"

export type RequireUserResult =
  { ok: true; user: CurrentAppUser } | { ok: false; error: "UNAUTHENTICATED" }

export type RequireAdminResult =
  | { ok: true; user: CurrentAppUser }
  | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" }

async function safeCurrentUser(): Promise<CurrentAppUser | null> {
  try {
    return await getCurrentUser()
  } catch {
    // Fail closed; never propagate error text.
    return null
  }
}

/** Guard for Server Actions: returns a typed result, never redirects. */
export async function requireUser(): Promise<RequireUserResult> {
  const user = await safeCurrentUser()
  return user ? { ok: true, user } : { ok: false, error: "UNAUTHENTICATED" }
}

/** Guard for Server Actions: returns a typed result, never redirects. */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const user = await safeCurrentUser()
  if (!user) return { ok: false, error: "UNAUTHENTICATED" }
  if (user.role !== "ADMIN") return { ok: false, error: "FORBIDDEN" }
  return { ok: true, user }
}

/**
 * Page-level wrappers. They call `redirect()`, so use them ONLY in Server
 * Components (pages/layouts), NEVER inside a Server Action.
 */
export async function requireUserOrRedirect(): Promise<CurrentAppUser> {
  const result = await requireUser()
  if (!result.ok) redirect("/login")
  return result.user
}

export async function requireAdminOrRedirect(): Promise<CurrentAppUser> {
  const result = await requireAdmin()
  if (!result.ok) {
    redirect(result.error === "FORBIDDEN" ? "/calendar" : "/login")
  }
  return result.user
}

/**
 * Page-level gate for screens that need a finished profile (/calendar).
 * ADMIN is never gated (AC 1.4.8); a USER who has not completed onboarding is
 * sent to /onboarding (AC 1.4.1, 1.4.6). Server Components only.
 */
export async function requireOnboardedUserOrRedirect(): Promise<CurrentAppUser> {
  const user = await requireUserOrRedirect()
  if (user.role !== "ADMIN" && !user.onboardingCompleted) {
    redirect("/onboarding")
  }
  return user
}
