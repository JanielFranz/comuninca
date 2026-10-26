"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseUtcDateKey } from "@/lib/dateUtils"
import { checkRegisterInput, registerSchema } from "@/lib/validation/auth"
import type { RegisterFieldErrors } from "@/lib/validation/auth"

export type SignInResult =
  | { ok: true; redirectTo: "/admin" | "/calendar" }
  | { ok: false; error: "INVALID_INPUT" | "INVALID_CREDENTIALS" | "UNEXPECTED" }

export type RegisterResult =
  | { ok: true; redirectTo: "/calendar" | "/login" }
  | { ok: false; error: "EMAIL_IN_USE" | "UNEXPECTED" }
  | { ok: false; error: "INVALID_INPUT"; fields: RegisterFieldErrors }

export type SignOutResult = { ok: true } | { ok: false; error: "UNEXPECTED" }

const SignInSchema = z.object({
  email: z.string().trim().pipe(z.email()),
  password: z.string().min(1),
})

/**
 * Whether a Supabase Auth failure means "these credentials are not valid".
 * 4xx auth errors (bad password, unknown user, unconfirmed email...) all map
 * to one generic result so nothing reveals which field was wrong (US 1.2.4).
 * Rate limiting (429), 5xx and network failures are genuinely unexpected.
 */
function isCredentialFailure(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 429
}

export async function signIn(input: {
  email: string
  password: string
}): Promise<SignInResult> {
  const parsed = SignInSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })

    if (error) {
      return isCredentialFailure(error.status)
        ? { ok: false, error: "INVALID_CREDENTIALS" }
        : { ok: false, error: "UNEXPECTED" }
    }

    // The id comes from the Auth response (verified by Supabase), because the
    // session cookies set in this same request are not readable back yet.
    const row = await prisma.user.findUnique({
      where: { id: data.user.id },
      select: { role: true },
    })

    if (!row) {
      // Should not happen (auth.users -> public.User sync trigger).
      await supabase.auth.signOut()
      return { ok: false, error: "UNEXPECTED" }
    }

    const redirectTo = row.role === "ADMIN" ? "/admin" : "/calendar"
    revalidatePath(redirectTo)
    return { ok: true, redirectTo }
  } catch {
    // Deliberately not logging the error object: it may carry credentials.
    return { ok: false, error: "UNEXPECTED" }
  }
}

export async function signOut(): Promise<SignOutResult> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()
    if (error) return { ok: false, error: "UNEXPECTED" }
    revalidatePath("/calendar")
    revalidatePath("/admin")
    revalidatePath("/onboarding")
    return { ok: true }
  } catch {
    return { ok: false, error: "UNEXPECTED" }
  }
}

/** Supabase Auth's "this email is already registered" failure. */
function isEmailTaken(error: { code?: string }): boolean {
  // Not HTTP 422 alone: GoTrue also uses it for weak_password etc.
  return error.code === "email_exists" || error.code === "user_already_exists"
}

/**
 * Registers a normal user. Registration is open: no invite code is asked for,
 * checked or consumed (the admin code tooling still exists but is not part of
 * this flow).
 *
 * A Supabase Auth call cannot join a Prisma transaction, so atomicity is built
 * from two pieces instead of one `$transaction`:
 * 1. the auth user is created, then the trigger-made `public.User` row is
 *    filled in (name, birthday, role);
 * 2. a failure after the auth user exists is compensated by deleting it.
 *
 * The auth user is created with the admin API and a pre-confirmed email rather
 * than `signUp`: the project may require email confirmation and its default
 * SMTP is heavily rate-limited, so `signUp` would return no session and could
 * fail. Consequence: the email address is not verified.
 */
export async function register(input: {
  fullName: string
  birthday: string
  email: string
  password: string
}): Promise<RegisterResult> {
  const checked = checkRegisterInput(input)
  if (!checked.valid) {
    return { ok: false, error: "INVALID_INPUT", fields: checked.errors }
  }
  // Only the schema's own keys survive: a `role` in the input is dropped here.
  const { fullName, birthday, email, password } = registerSchema.parse(input)

  let authUserId: string | null = null
  let linked = false

  try {
    // (b) Cheap pre-check, before an auth user is created.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    })
    if (existing) return { ok: false, error: "EMAIL_IN_USE" }

    // (c) Create the (pre-confirmed) auth user.
    const admin = createAdminClient()
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (created.error || !created.data?.user) {
      return {
        ok: false,
        error:
          created.error && isEmailTaken(created.error)
            ? "EMAIL_IN_USE"
            : "UNEXPECTED",
      }
    }
    authUserId = created.data.user.id

    // (d) Fill in the trigger-created row. `role` is fixed here, never input.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: created.data.user.id },
        data: {
          fullName,
          birthday: parseUtcDateKey(birthday),
          role: "USER",
        },
      })
    })
    linked = true
  } catch {
    // Deliberately not logging the error object: it may carry credentials.
    return { ok: false, error: "UNEXPECTED" }
  } finally {
    if (!linked) await compensate(authUserId)
  }

  // (e) Start the session. The account already exists at this point, so a
  // failure here is not rolled back: the person can sign in manually.
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) return { ok: true, redirectTo: "/login" }
    revalidatePath("/calendar")
    revalidatePath("/onboarding")
    return { ok: true, redirectTo: "/calendar" }
  } catch {
    return { ok: true, redirectTo: "/login" }
  }
}

/** Best-effort undo of a half-finished registration; never throws. */
async function compensate(authUserId: string | null): Promise<void> {
  if (!authUserId) return
  try {
    await createAdminClient().auth.admin.deleteUser(authUserId)
  } catch {
    // Best effort, never mask the original result.
  }
}
