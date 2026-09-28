import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { decideRoute } from "@/lib/routeGuard"
import { updateSession } from "@/lib/supabase/middleware"

// Next 16: `proxy` replaces the deprecated `middleware` convention (Node.js
// runtime). Defense in depth only: every Server Action re-verifies via
// lib/auth.ts.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response: NextResponse
  let hasUser = false
  let role: string | null = null
  let onboardingCompleted = false

  try {
    const session = await updateSession(request)
    response = session.response
    if (session.user) {
      // One lookup for every matched path: role + onboarding flag.
      const row = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, onboardingCompleted: true },
      })
      role = row?.role ?? null
      onboardingCompleted = row?.onboardingCompleted === true
      hasUser = row !== null // Auth session without a public.User row
    }
  } catch {
    // Fail closed: never let the request through when we cannot verify it.
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const decision = decideRoute({ pathname, hasUser, role, onboardingCompleted })
  if (decision.type === "next") return response

  const redirect = NextResponse.redirect(new URL(decision.to, request.url))
  // Carry refreshed session cookies over, or a token refresh is lost.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export const config = {
  matcher: ["/calendar/:path*", "/admin/:path*", "/onboarding/:path*"],
}
