// Pure, offline-testable pieces of the dev seed (see prisma/seed.ts).
// Relative imports only: this runs under plain tsx, not Next's bundler.
import { SEED_EVENTS, USERS } from "../lib/constants"

export const SEED_EMAIL_DOMAIN = "seed.comuninca.test"
export const SEED_INVITE_CODE_COUNT = 10

// ---- Safety guard ---------------------------------------------------------

export type SeedGuardResult = { ok: true } | { ok: false; reason: string }

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

// Every target the seed writes to: Prisma (DIRECT_URL, and DATABASE_URL via
// lib/db.ts) and the Supabase Auth admin API (NEXT_PUBLIC_SUPABASE_URL).
const WRITE_TARGETS = [
  "DIRECT_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const

export function checkSeedGuard(
  env: Record<string, string | undefined>,
): SeedGuardResult {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    return { ok: false, reason: "Refusing to seed: production environment." }
  }
  const allowRemote = env.SEED_ALLOW_REMOTE === "true"
  for (const name of WRITE_TARGETS) {
    const value = env[name]
    if (!value) {
      return { ok: false, reason: `Refusing to seed: ${name} is not set.` }
    }
    let host: string
    try {
      host = new URL(value).hostname
    } catch {
      return {
        ok: false,
        reason: `Refusing to seed: ${name} could not be parsed.`,
      }
    }
    if (!LOCAL_HOSTS.has(host) && !allowRemote) {
      return {
        ok: false,
        reason: `Refusing to seed: ${name} points to remote host "${host}". Set SEED_ALLOW_REMOTE=true to allow it explicitly.`,
      }
    }
  }
  return { ok: true }
}

// ---- Credentials ----------------------------------------------------------

export interface SeedCredentials {
  adminEmail: string
  adminPassword: string
  userPassword: string
}

export function parseSeedEnv(
  env: Record<string, string | undefined>,
): SeedCredentials {
  const names = [
    "SEED_ADMIN_EMAIL",
    "SEED_ADMIN_PASSWORD",
    "SEED_USER_PASSWORD",
  ] as const
  const missing = names.filter((n) => !env[n]?.trim())
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`)
  }
  return {
    adminEmail: env.SEED_ADMIN_EMAIL!.trim(),
    adminPassword: env.SEED_ADMIN_PASSWORD!,
    userPassword: env.SEED_USER_PASSWORD!,
  }
}

// ---- Data mapping ---------------------------------------------------------

export interface SeedUserSpec {
  key: string // demo id, e.g. "u1"
  email: string
  fullName: string
}

export function buildSeedUsers(): SeedUserSpec[] {
  return USERS.map((u) => ({
    key: u.id,
    email: `${u.name.split(" ")[0].toLowerCase()}@${SEED_EMAIL_DOMAIN}`,
    fullName: u.name,
  }))
}

export function buildInviteCodes(): string[] {
  return Array.from(
    { length: SEED_INVITE_CODE_COUNT },
    (_, i) => `SEED-${String(i + 1).padStart(4, "0")}`,
  )
}

export interface SeedEventRow {
  id: string
  title: string
  category: string
  date: Date
  startTime: string
  endTime: string
  modality: "IN_PERSON"
  location: string
  description: string
  hostId: string
}

export interface SeedAttendeeRow {
  eventId: string
  userId: string
}

/** `authIds` maps demo user key (u1..u4) to the real Supabase auth user id. */
export function mapSeedEvents(authIds: Record<string, string>): {
  events: SeedEventRow[]
  attendees: SeedAttendeeRow[]
} {
  const idFor = (key: string): string => {
    const id = authIds[key]
    if (!id) throw new Error(`No seeded user for demo id "${key}"`)
    return id
  }
  const events: SeedEventRow[] = []
  const attendees: SeedAttendeeRow[] = []
  SEED_EVENTS.forEach((e, i) => {
    const id = `seed-event-${String(i + 1).padStart(2, "0")}`
    events.push({
      id,
      title: e.title,
      category: e.category,
      // Prisma @db.Date: midnight UTC keeps the calendar day unchanged.
      date: new Date(`${e.date}T00:00:00.000Z`),
      startTime: e.startTime,
      endTime: e.endTime,
      modality: "IN_PERSON",
      location: e.location,
      description: e.description,
      hostId: idFor(e.hostId),
    })
    for (const a of e.attendeeIds) {
      attendees.push({ eventId: id, userId: idFor(a) })
    }
  })
  return { events, attendees }
}
