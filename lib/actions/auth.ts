"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { inviteCodeCandidates } from "@/lib/inviteCodeInput"
import { checkRegisterInput, registerSchema } from "@/lib/validation/auth"
import type { RegisterFieldErrors } from "@/lib/validation/auth"

export type SignInResult =
  | { ok: true; redirectTo: "/admin" | "/calendar" }
  | { ok: false; error: "INVALID_INPUT" | "INVALID_CREDENTIALS" | "UNEXPECTED" }

export type RegisterResult =
  | { ok: true; redirectTo: "/calendar" | "/login" }
  | {
      ok: false
      error: "CODE_REQUIRED" | "CODE_INVALID" | "EMAIL_IN_USE" | "UNEXPECTED"
    }
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
 * Registers a normal user with a single-use invite code.
 *
 * A Supabase Auth call cannot join a Prisma transaction, so atomicity is built
 * from three pieces instead of one `$transaction`:
 * 1. the code is CLAIMED with a conditional `updateMany` (UNUSED -> USED); only
 *    one concurrent caller can win, which is what makes a code single-use;
 * 2. the auth user is created, then the trigger-made `public.User` row is
 *    linked to the code in one `$transaction`;
 * 3. every failure before the link is compensated: the claim is reverted and
 *    the auth user (if already created) is deleted.
 *
 * The auth user is created with the admin API and a pre-confirmed email rather
 * than `signUp`: the project may require email confirmation and its default
 * SMTP is heavily rate-limited, so `signUp` would return no session and could
 * fail; the invite code already vouches for the visitor.
 */
export async function register(input: {
  fullName: string
  email: string
  password: string
  code: string
}): Promise<RegisterResult> {
  const checked = checkRegisterInput(input)
  if (!checked.valid) {
    // A blank code is its own specific error (AC 1.1.2).
    const rawCode = (input as { code?: unknown } | null)?.code
    if (typeof rawCode === "string" && rawCode.trim() === "") {
      return { ok: false, error: "CODE_REQUIRED" }
    }
    return { ok: false, error: "INVALID_INPUT", fields: checked.errors }
  }
  // Only the schema's own keys survive: a `role` in the input is dropped here.
  const { fullName, email, password, code } = registerSchema.parse(input)

  let claimedId: string | null = null
  let authUserId: string | null = null
  let linked = false

  try {
    // (b) Look the code up. Unknown, USED and EXPIRED are indistinguishable.
    let invite: { id: string; status: string } | null = null
    for (const candidate of inviteCodeCandidates(code)) {
      invite = await prisma.inviteCode.findUnique({
        where: { code: candidate },
        select: { id: true, status: true },
      })
      if (invite) break
    }
    if (!invite || invite.status !== "UNUSED") {
      return { ok: false, error: "CODE_INVALID" }
    }

    // (c) Cheap pre-check, before the code is spent.
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    })
    if (existing) return { ok: false, error: "EMAIL_IN_USE" }

    // (d) Atomic claim: exactly one caller flips UNUSED -> USED.
    const claim = await prisma.inviteCode.updateMany({
      where: { id: invite.id, status: "UNUSED" },
      data: { status: "USED", usedAt: new Date() },
    })
    if (claim.count !== 1) return { ok: false, error: "CODE_INVALID" }
    claimedId = invite.id

    // (e) Create the (pre-confirmed) auth user.
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

    // (f) Fill in the trigger-created row. `role` is fixed here, never input.
    const inviteId = invite.id
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: created.data.user.id },
        data: { fullName, inviteCodeId: inviteId, role: "USER" },
      })
    })
    linked = true
  } catch {
    // Deliberately not logging the error object: it may carry credentials.
    return { ok: false, error: "UNEXPECTED" }
  } finally {
    if (!linked) await compensate(claimedId, authUserId)
  }

  // (g) Start the session. The account already exists at this point, so a
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
async function compensate(
  claimedId: string | null,
  authUserId: string | null,
): Promise<void> {
  if (authUserId) {
    let deleted = false
    try {
      const { error } =
        await createAdminClient().auth.admin.deleteUser(authUserId)
      deleted = !error
    } catch {
      // Treated as not deleted below.
    }
    // Fail closed: an auth user we could not remove must not leave its code
    // reusable, so the claim stays USED.
    if (!deleted) return
  }
  if (claimedId) {
    try {
      await prisma.inviteCode.updateMany({
        where: { id: claimedId, status: "USED" },
        data: { status: "UNUSED", usedAt: null },
      })
    } catch {
      // Same: best effort, never mask the original result.
    }
  }
}
