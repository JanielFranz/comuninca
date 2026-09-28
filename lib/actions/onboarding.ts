"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import {
  checkOnboardingInput,
  type OnboardingFieldErrors,
} from "@/lib/validation/onboarding"

export type CompleteOnboardingResult =
  | { ok: true; redirectTo: "/calendar" }
  | {
      ok: false
      error:
        "UNAUTHENTICATED" | "FORBIDDEN" | "ALREADY_COMPLETED" | "UNEXPECTED"
    }
  | { ok: false; error: "INVALID_INPUT"; fields: OnboardingFieldErrors }

/**
 * One-time onboarding step for normal users. The user id and role come only
 * from the session; the write is a single conditional `updateMany`, so a
 * second submit (or a race) can never overwrite an existing profile.
 */
export async function completeOnboarding(input: {
  profession?: string
  occupation: string
  ikigai?: string
}): Promise<CompleteOnboardingResult> {
  const auth = await requireUser()
  if (!auth.ok) return { ok: false, error: "UNAUTHENTICATED" }
  // Admins never onboard (AC 1.4.8).
  if (auth.user.role !== "USER") return { ok: false, error: "FORBIDDEN" }

  const checked = checkOnboardingInput(input)
  if (!checked.valid) {
    return { ok: false, error: "INVALID_INPUT", fields: checked.errors }
  }
  const { profession, occupation, ikigai } = checked.data

  try {
    const result = await prisma.user.updateMany({
      where: { id: auth.user.id, role: "USER", onboardingCompleted: false },
      data: {
        profession: profession ?? null,
        occupation,
        ikigai: ikigai ?? null,
        onboardingCompleted: true,
      },
    })
    if (result.count === 0) return { ok: false, error: "ALREADY_COMPLETED" }
    revalidatePath("/calendar")
    revalidatePath("/onboarding")
    return { ok: true, redirectTo: "/calendar" }
  } catch {
    // Deliberately no error text.
    return { ok: false, error: "UNEXPECTED" }
  }
}
