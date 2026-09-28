import { z } from "zod"
import { STRINGS } from "@/lib/strings"

const t = STRINGS.onboarding

export const PROFESSION_MAX = 100
export const OCCUPATION_MAX = 100
export const IKIGAI_MAX = 500

/** Optional text: trimmed; empty or whitespace-only becomes undefined. */
function optionalText(max: number, tooLong: string) {
  return z
    .string(tooLong)
    .trim()
    .max(max, tooLong)
    .optional()
    .transform((value) => (value ? value : undefined))
}

export const onboardingSchema = z.object({
  profession: optionalText(PROFESSION_MAX, t.professionTooLong),
  occupation: z
    .string(t.occupationRequired)
    .trim()
    .min(1, t.occupationRequired)
    .max(OCCUPATION_MAX, t.occupationTooLong),
  ikigai: optionalText(IKIGAI_MAX, t.ikigaiTooLong),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
export type OnboardingField = "profession" | "occupation" | "ikigai"
export type OnboardingFieldErrors = Partial<Record<OnboardingField, string>>

export type OnboardingCheck =
  | { valid: true; data: OnboardingInput }
  | { valid: false; errors: OnboardingFieldErrors }

/** Validates the form; first message per field. Unknown keys are stripped. */
export function checkOnboardingInput(input: unknown): OnboardingCheck {
  const parsed = onboardingSchema.safeParse(input)
  if (parsed.success) return { valid: true, data: parsed.data }
  const errors: OnboardingFieldErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (typeof field === "string" && !(field in errors)) {
      errors[field as OnboardingField] = issue.message
    }
  }
  return { valid: false, errors }
}
