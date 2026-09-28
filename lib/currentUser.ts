import "server-only"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export interface CurrentAppUser {
  id: string
  email: string
  fullName: string
  role: "ADMIN" | "USER"
  onboardingCompleted: boolean
}

/**
 * Read helper: the signed-in user joined with its `public.User` row, or null.
 * Verifies the session with `auth.getUser()` (server-validated), never
 * `getSession`. This is NOT an authorization guard: feature #8 builds
 * `requireUser` / `requireAdmin` on top of it.
 */
export async function getCurrentUser(): Promise<CurrentAppUser | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null

  const row = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      onboardingCompleted: true,
    },
  })
  return row
}
