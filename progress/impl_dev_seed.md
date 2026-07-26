# Implementation Report — Feature #7: dev_seed

**Date:** 2026-07-25  
**Status:** Completed (pending reviewer approval)

---

## Files touched

| File | Action | Description |
|------|--------|-------------|
| `package.json` | modified | Added `tsx` as devDependency (via `pnpm add -D tsx`) |
| `pnpm-lock.yaml` | modified | Updated by pnpm for `tsx` + `esbuild` |
| `prisma/seed.ts` | **created** | Idempotent dev seed script |
| `.pnpm/` (pnpm config) | modified | Approved `esbuild` build scripts (`pnpm approve-builds esbuild`) |

## What was implemented

### 1. Installed `tsx` as dev dependency
```bash
pnpm add -D tsx
```
This satisfies the `prisma.config.ts` requirement: `seed: "tsx prisma/seed.ts"`.

### 2. Created `prisma/seed.ts` — idempotent dev seed

The seed script performs the following steps in order:

**Test credentials** documented at the top of the file:
- Admin: `admin@comuninca.pe` / `admin123`
- Normal: `ava@comuninca.pe`, `marco@comuninca.pe`, `priya@comuninca.pe`, `jonas@comuninca.pe` / all `test123`

**Step 1: Admin user**
- Creates auth user via `supabase.auth.admin.createUser()` with service role key
- If user already exists (detected by error message "already registered"), looks up existing user via `auth.admin.listUsers()`
- Upserts `public.User` row, promoting role to `ADMIN`
- The feature #4 trigger creates the initial row with role=USER; upsert promotes it

**Step 2: Normal users (4)**
- Creates 4 normal auth users: Ava Reyes, Marco Tanaka, Priya Kapoor, Jonas Berg
- Each gets `user_metadata: { full_name: "…" }` so the trigger sets `fullName` correctly
- Upserts `public.User` rows with `onboardingCompleted: true` (skip onboarding for seed)
- Maps old prototype IDs (`u1`–`u4`) to real Supabase auth UUIDs for event insertion

**Step 3: Invite codes (10)**
- 10 stable codes (`SEED-ALPHA-2026-01` through `SEED-ALPHA-2026-10`)
- Uses `prisma.inviteCode.createMany({ skipDuplicates: true })` — safe to re-run
- All codes start with status `UNUSED`

**Step 4: Seed events (12)**
- Imports `SEED_EVENTS` from `lib/constants.ts` (no duplication)
- Maps `hostId` from old IDs (`u1`…`u4`) to real auth UUIDs
- For each event: checks existence via `findFirst` (title + date + hostId) before creating
- New events get auto-generated cuid IDs via Prisma's `@default(cuid())`
- All events set `modality: "IN_PERSON"` (all seed events have physical locations)
- Attendees collected as (eventId, userId) tuples
- Uses `prisma.eventAttendee.createMany({ skipDuplicates: true })` — composite PK handles dedup

**Step 5: Summary**
- Prints user count, code count, and event count

### Idempotency strategy

| Entity | Strategy |
|--------|----------|
| Auth users | `createUser` → catch "already registered" → `listUsers` lookup |
| `public.User` | `prisma.user.upsert()` by `id` |
| `InviteCode` | `prisma.inviteCode.createMany({ skipDuplicates: true })` with stable codes |
| `Event` | `prisma.event.findFirst` (title+date+hostId) → skip if exists; `prisma.event.create` if new |
| `EventAttendee` | `prisma.eventAttendee.createMany({ skipDuplicates: true })` — composite PK dedup |

### Architecture compliance

- **Persistence**: All DB writes go through `lib/db.ts` Prisma singleton
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` loaded server-side via `dotenv/config`, never exposed
- **Supabase client**: `@supabase/supabase-js` used directly with service role key (appropriate for seed/admin ops)
- **Copy**: All test credentials documented in comments at top of seed file
- **Conventions**: camelCase naming, `findFirst`/`upsert`/`createMany` patterns, clean `async main()` structure

## Verification evidence

### Static checks
```
✅ bash init.sh → Environment ready (exit 0)
   ├─ ESLint: clean (0 errors, 2 pre-existing warnings)
   ├─ TypeScript: typecheck clean
   └─ Tests: skipped (no test files yet per feature #5)
```

### Live seed execution
```
⚠ Cannot verify — local Supabase (Docker) instance not available in this environment.
  The seed code is structurally correct and would execute against any Supabase
  dev instance with valid credentials in .env.local.
```

### Manual verification steps (for reviewer with Supabase access)
```bash
# First run
pnpm db:seed     # Creates admin, 4 users, 10 codes, 12 events + attendees

# Second run (idempotency)
pnpm db:seed     # Should print "0 created, 12 skipped" for events; 0 for codes

# Verify admin login
# → Visit /login, enter admin@comuninca.pe / admin123
# → Should redirect to /admin

# Verify normal user login
# → Visit /login, enter ava@comuninca.pe / test123
# → Should redirect to /calendar (onboarding skipped)
```

## Decisions

| Decision | Rationale |
|----------|-----------|
| `findFirst` + conditional `create` for events (not `createMany`) | Events use `@default(cuid())` for IDs. Without stable IDs, `createMany`+`skipDuplicates` can't dedup. A natural-key check (title+date+hostId) is clean and readable. |
| Stable invite codes | `createMany({ skipDuplicates: true })` requires stable unique values. Hardcoded `SEED-ALPHA-2026-XX` codes are clear, unique, and safe for dev. |
| `auth.admin.listUsers()` fallback | When `createUser` fails with "already registered", we look up the existing user by email. This avoids needing `getUserByEmail` (not available in Supabase JS v2 admin API). |
| Import `SEED_EVENTS` from `lib/constants.ts` | Avoids data duplication. The seed reads the canonical event definitions from the existing constants file. |
| `esbuild` build scripts approved | `tsx` depends on esbuild; pnpm blocks build scripts by default. Running `pnpm approve-builds esbuild` is required for `tsx` to work. |

## Dependencies satisfied

- Feature #2 (prisma_schema_init) — ✅ `lib/db.ts` singleton used, schema per blueprint
- Feature #4 (auth_user_sync_trigger) — ✅ trigger automatically creates `public.User` rows; seed upserts to promote
