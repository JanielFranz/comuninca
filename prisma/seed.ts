// Dev seed entrypoint: `pnpm db:seed`. Developer CLI, so messages are plain
// English (not user-facing copy, hence not in lib/strings.ts).
import "dotenv/config"
import { checkSeedGuard, parseSeedEnv } from "./seed-data"
import { runSeed, type SeedAuthAdmin, type SeedDb } from "./seed-runner"

async function main() {
  // Guard first: nothing below may connect anywhere until it passes.
  const guard = checkSeedGuard(process.env)
  if (!guard.ok) throw new Error(guard.reason)
  const creds = parseSeedEnv(process.env)

  // Dynamic imports so that a refused run never builds a DB/auth client.
  const { createAdminClient } = await import("../lib/supabase/admin")
  const { prisma } = await import("../lib/db")
  const admin = createAdminClient().auth.admin

  const auth: SeedAuthAdmin = {
    async listUsers(params) {
      const { data, error } = await admin.listUsers(params)
      return { users: data?.users ?? [], error }
    },
    async createUser({ email, password, fullName }) {
      const { data, error } = await admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
      return { user: data?.user ?? null, error }
    },
  }

  try {
    const summary = await runSeed(
      { auth, db: prisma as unknown as SeedDb },
      creds,
    )
    console.log(
      `Seed complete: ${summary.users} users, ${summary.inviteCodesCreated} new invite codes, ${summary.events} events, ${summary.attendees} attendee rows.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Seed failed.")
  process.exit(1)
})
