/**
 * Dev seed script — idempotent, safe to re-run.
 *
 * Test credentials:
 *   Admin:        admin@comuninca.pe / admin123
 *   Normal users:
 *     Ava Reyes:    ava@comuninca.pe     / test123
 *     Marco Tanaka: marco@comuninca.pe   / test123
 *     Priya Kapoor: priya@comuninca.pe   / test123
 *     Jonas Berg:   jonas@comuninca.pe   / test123
 *
 * Seeds: 1 admin, 4 normal users, 10 invite codes, 12 events (with attendees).
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { prisma } from "../lib/db"
import { SEED_EVENTS } from "../lib/constants"

// ── Supabase admin client ────────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

// ── Invite codes (stable for idempotency) ────────────────────────────────────
const SEED_INVITE_CODES = [
  { id: "seed-code-001", code: "SEED-ALPHA-2026-01" },
  { id: "seed-code-002", code: "SEED-ALPHA-2026-02" },
  { id: "seed-code-003", code: "SEED-ALPHA-2026-03" },
  { id: "seed-code-004", code: "SEED-ALPHA-2026-04" },
  { id: "seed-code-005", code: "SEED-ALPHA-2026-05" },
  { id: "seed-code-006", code: "SEED-ALPHA-2026-06" },
  { id: "seed-code-007", code: "SEED-ALPHA-2026-07" },
  { id: "seed-code-008", code: "SEED-ALPHA-2026-08" },
  { id: "seed-code-009", code: "SEED-ALPHA-2026-09" },
  { id: "seed-code-010", code: "SEED-ALPHA-2026-10" },
]

// ── Normal users to create ───────────────────────────────────────────────────
const NORMAL_USERS = [
  { email: "ava@comuninca.pe", password: "test123", fullName: "Ava Reyes" },
  { email: "marco@comuninca.pe", password: "test123", fullName: "Marco Tanaka" },
  { email: "priya@comuninca.pe", password: "test123", fullName: "Priya Kapoor" },
  { email: "jonas@comuninca.pe", password: "test123", fullName: "Jonas Berg" },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string
  email: string
}

/**
 * Create a Supabase auth user (or look up the existing one).
 * Returns the auth user id/email.
 */
async function createOrGetAuthUser(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthUser> {
  const { data: created, error } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

  if (!error && created?.user) {
    return { id: created.user.id, email: created.user.email! }
  }

  // If the user already exists, look them up via listUsers.
  if (error && isAlreadyRegistered(error)) {
    const {
      data: { users },
    } = await supabaseAdmin.auth.admin.listUsers()

    const existing = users.find((u) => u.email === email)
    if (existing) {
      return { id: existing.id, email: existing.email! }
    }
    throw new Error(
      `User ${email} reported as existing but not found in listUsers.`,
    )
  }

  throw new Error(`Failed to create auth user ${email}: ${error?.message}`)
}

function isAlreadyRegistered(error: { message?: string }): boolean {
  const msg = error.message ?? ""
  return (
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("User already registered")
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding Comuninca dev database…\n")

  // ── Step 1: Admin user ─────────────────────────────────────────────────
  console.log("── Step 1: Admin user ──")

  const admin = await createOrGetAuthUser(
    "admin@comuninca.pe",
    "admin123",
    "Administrador",
  )
  console.log(`  Auth user: ${admin.email} (${admin.id})`)

  // The trigger created a public.User row with role=USER. Promote to ADMIN.
  await prisma.user.upsert({
    where: { id: admin.id },
    update: { fullName: "Administrador", role: "ADMIN" },
    create: {
      id: admin.id,
      email: admin.email,
      fullName: "Administrador",
      role: "ADMIN",
    },
  })
  console.log("  Public User upserted → role=ADMIN, onboardingCompleted=false\n")

  // ── Step 2: Normal users ───────────────────────────────────────────────
  console.log("── Step 2: Normal users ──")

  const normalUserIds: Record<string, string> = {}
  // Map: old prototype id → real auth UUID

  for (let i = 0; i < NORMAL_USERS.length; i++) {
    const nu = NORMAL_USERS[i]
    const authUser = await createOrGetAuthUser(
      nu.email,
      nu.password,
      nu.fullName,
    )
    console.log(`  Auth user: ${authUser.email} (${authUser.id})`)

    // The trigger created the User row. Upsert to ensure correct name,
    // role=USER (already default), onboardingCompleted=true (skip onboarding).
    await prisma.user.upsert({
      where: { id: authUser.id },
      update: {
        fullName: nu.fullName,
        role: "USER",
        onboardingCompleted: true,
      },
      create: {
        id: authUser.id,
        email: authUser.email,
        fullName: nu.fullName,
        role: "USER",
        onboardingCompleted: true,
      },
    })

    // Map old prototype IDs (u1, u2, u3, u4) to real UUIDs
    normalUserIds[`u${i + 1}`] = authUser.id
  }
  console.log("  Public Users upserted → role=USER, onboardingCompleted=true\n")

  // ── Step 3: Invite codes ───────────────────────────────────────────────
  console.log("── Step 3: Invite codes ──")

  const codesResult = await prisma.inviteCode.createMany({
    data: SEED_INVITE_CODES.map((c) => ({
      id: c.id,
      code: c.code,
      status: "UNUSED" as const,
    })),
    skipDuplicates: true,
  })
  console.log(`  Created ${codesResult.count} new invite codes (skipped duplicates)\n`)

  // ── Step 4: Seed events + attendees ────────────────────────────────────
  console.log("── Step 4: Seed events ──")

  const attendeeRows: { eventId: string; userId: string }[] = []
  let eventsCreated = 0
  let eventsSkipped = 0

  for (const seed of SEED_EVENTS) {
    // Check if this event already exists (natural key: title + date + host).
    // We use the mapped real host UUID for the lookup.
    const hostId = normalUserIds[seed.hostId]
    if (!hostId) {
      console.warn(
        `  ⚠ Skipping event "${seed.title}" — host ${seed.hostId} not found in user map.`,
      )
      continue
    }

    const eventDate = new Date(seed.date)

    const existing = await prisma.event.findFirst({
      where: {
        title: seed.title,
        date: eventDate,
        hostId,
      },
    })

    let eventId: string

    if (existing) {
      eventId = existing.id
      eventsSkipped++
    } else {
      const created = await prisma.event.create({
        data: {
          title: seed.title,
          category: seed.category,
          date: eventDate,
          startTime: seed.startTime,
          endTime: seed.endTime,
          modality: "IN_PERSON", // all seed events have physical locations
          location: seed.location,
          description: seed.description,
          hostId,
        },
      })
      eventId = created.id
      eventsCreated++
    }

    // Collect attendee rows
    for (const oldId of seed.attendeeIds) {
      const userId = normalUserIds[oldId]
      if (userId) {
        attendeeRows.push({ eventId, userId })
      }
    }
  }

  // Insert attendees (composite PK handles dedup)
  const attendResult = await prisma.eventAttendee.createMany({
    data: attendeeRows,
    skipDuplicates: true,
  })

  console.log(
    `  Events: ${eventsCreated} created, ${eventsSkipped} skipped (already exist)`,
  )
  console.log(`  Attendees: ${attendResult.count} inserted (skipped duplicates)\n`)

  // ── Step 5: Summary ────────────────────────────────────────────────────
  const [userCount, codeCount, eventCount] = await Promise.all([
    prisma.user.count(),
    prisma.inviteCode.count(),
    prisma.event.count(),
  ])

  console.log("── Seed summary ──")
  console.log(`  Users:         ${userCount}`)
  console.log(`  Invite codes:  ${codeCount}`)
  console.log(`  Events:        ${eventCount}`)
  console.log("\n✅ Seed complete.")
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
