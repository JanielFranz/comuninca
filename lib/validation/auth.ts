import { z } from "zod"
import { STRINGS } from "@/lib/strings"

const t = STRINGS.register

export const FULL_NAME_MAX = 100
export const PASSWORD_MIN = 8
// bcrypt (used by Supabase Auth) ignores bytes past 72.
export const PASSWORD_MAX = 72
export const INVITE_CODE_INPUT_MAX = 64

export const registerSchema = z.object({
  fullName: z
    .string(t.fullNameRequired)
    .trim()
    .min(1, t.fullNameRequired)
    .max(FULL_NAME_MAX, t.fullNameTooLong),
  email: z.string(t.emailInvalid).trim().pipe(z.email(t.emailInvalid)),
  password: z
    .string(t.passwordTooShort)
    .min(PASSWORD_MIN, t.passwordTooShort)
    .max(PASSWORD_MAX, t.passwordTooLong),
  code: z
    .string(t.codeRequired)
    .trim()
    .min(1, t.codeRequired)
    .max(INVITE_CODE_INPUT_MAX, t.codeInvalid),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterField = keyof RegisterInput
export type RegisterFieldErrors = Partial<Record<RegisterField, string>>

export type RegisterCheck =
  | { valid: true; data: RegisterInput }
  | { valid: false; errors: RegisterFieldErrors }

/** Validates the form; first message per field. Unknown keys are stripped. */
export function checkRegisterInput(input: unknown): RegisterCheck {
  const parsed = registerSchema.safeParse(input)
  if (parsed.success) return { valid: true, data: parsed.data }
  const errors: RegisterFieldErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (typeof field === "string" && !(field in errors)) {
      errors[field as RegisterField] = issue.message
    }
  }
  return { valid: false, errors }
}
