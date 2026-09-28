// Seed orchestration with injected dependencies so it can be tested offline.
import {
  buildInviteCodes,
  buildSeedUsers,
  mapSeedEvents,
  type SeedAttendeeRow,
  type SeedCredentials,
  type SeedEventRow,
} from "./seed-data"

interface AuthUserLite {
  id: string
  email?: string
}

export interface SeedAuthAdmin {
  listUsers(params: {
    page: number
    perPage: number
  }): Promise<{ users: AuthUserLite[]; error: { message: string } | null }>
  createUser(attrs: {
    email: string
    password: string
    fullName: string
  }): Promise<{ user: AuthUserLite | null; error: { message: string } | null }>
}

type SeedRole = "ADMIN" | "USER"

export interface UserUpsert {
  where: { id: string }
  update: { role: SeedRole; onboardingCompleted: boolean; fullName: string }
  create: {
    id: string
    email: string
    fullName: string
    role: SeedRole
    onboardingCompleted: boolean
  }
}

export interface SeedDb {
  user: { upsert(args: UserUpsert): Promise<unknown> }
  inviteCode: {
    createMany(args: {
      data: { code: string }[]
      skipDuplicates: boolean
    }): Promise<{ count: number }>
  }
  event: {
    upsert(args: {
      where: { id: string }
      update: Omit<SeedEventRow, "id">
      create: SeedEventRow
    }): Promise<unknown>
  }
  eventAttendee: {
    createMany(args: {
      data: SeedAttendeeRow[]
      skipDuplicates: boolean
    }): Promise<{ count: number }>
  }
}

const PER_PAGE = 200
const MAX_PAGES = 50
const ADMIN_FULL_NAME = "Admin Comuninca"

async function findAuthUserId(
  auth: SeedAuthAdmin,
  email: string,
): Promise<string | null> {
  const wanted = email.toLowerCase()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { users, error } = await auth.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`Failed to list auth users: ${error.message}`)
    const hit = users.find((u) => u.email?.toLowerCase() === wanted)
    if (hit) return hit.id
    if (users.length < PER_PAGE) return null
  }
  return null
}

async function ensureAuthUser(
  auth: SeedAuthAdmin,
  email: string,
  password: string,
  fullName: string,
): Promise<string> {
  const existing = await findAuthUserId(auth, email)
  if (existing) return existing
  const { user, error } = await auth.createUser({ email, password, fullName })
  if (error || !user) {
    throw new Error(
      `Failed to create auth user ${email}: ${error?.message ?? "no user returned"}`,
    )
  }
  return user.id
}

async function upsertUserRow(
  db: SeedDb,
  id: string,
  email: string,
  fullName: string,
  role: SeedRole,
) {
  await db.user.upsert({
    where: { id },
    update: { role, onboardingCompleted: true, fullName },
    create: { id, email, fullName, role, onboardingCompleted: true },
  })
}

export interface SeedSummary {
  users: number
  inviteCodesCreated: number
  events: number
  attendees: number
}

export async function runSeed(
  deps: { auth: SeedAuthAdmin; db: SeedDb },
  creds: SeedCredentials,
): Promise<SeedSummary> {
  const { auth, db } = deps

  const adminId = await ensureAuthUser(
    auth,
    creds.adminEmail,
    creds.adminPassword,
    ADMIN_FULL_NAME,
  )
  await upsertUserRow(db, adminId, creds.adminEmail, ADMIN_FULL_NAME, "ADMIN")

  const authIds: Record<string, string> = {}
  for (const u of buildSeedUsers()) {
    const id = await ensureAuthUser(
      auth,
      u.email,
      creds.userPassword,
      u.fullName,
    )
    authIds[u.key] = id
    await upsertUserRow(db, id, u.email, u.fullName, "USER")
  }

  // createMany + skipDuplicates never touches an existing (e.g. USED) code.
  const codes = await db.inviteCode.createMany({
    data: buildInviteCodes().map((code) => ({ code })),
    skipDuplicates: true,
  })

  const { events, attendees } = mapSeedEvents(authIds)
  for (const { id, ...rest } of events) {
    await db.event.upsert({
      where: { id },
      update: rest,
      create: { id, ...rest },
    })
  }
  await db.eventAttendee.createMany({ data: attendees, skipDuplicates: true })

  return {
    users: 1 + Object.keys(authIds).length,
    inviteCodesCreated: codes.count,
    events: events.length,
    attendees: attendees.length,
  }
}
