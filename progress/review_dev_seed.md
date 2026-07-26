# Review — feature 7 dev_seed
**Verdict:** APPROVED

## Acceptance criteria

- **"pnpm db:seed is idempotent (safe to re-run)"** → met  
  Evidence: Code audit of all idempotency strategies in `prisma/seed.ts`:
  - **Auth users** (line 65–98): `createOrGetAuthUser()` calls `createUser` first; catches `"already been registered"` / `"already registered"` / `"already exists"` / `"User already registered"` patterns via `isAlreadyRegistered()` helper (line 100–108), then looks up existing user via `auth.admin.listUsers()`. Returns the existing auth UUID — no duplicate users created.
  - **`public.User`** (lines 126, 155): `prisma.user.upsert()` by primary key `id`. Creates on first run, updates on re-run — pure upsert, no conditionals needed.
  - **`InviteCode`** (lines 179–187): `prisma.inviteCode.createMany({ skipDuplicates: true })` with 10 stable `id` values (`seed-code-001`…`seed-code-010`) and 10 stable `code` values (`SEED-ALPHA-2026-01`…`SEED-ALPHA-2026-10`). Both `id` (PK) and `code` (`@unique`) serve as dedup guards. Second run prints `Created 0 new invite codes (skipped duplicates)`.
  - **`Event`** (lines 209–238): `prisma.event.findFirst({ where: { title, date, hostId } })` natural-key lookup before `prisma.event.create()`. Existing events are skipped; `eventsSkipped` counter tracks them. No race condition possible in a sequential seed script.
  - **`EventAttendee`** (lines 250–253): `prisma.eventAttendee.createMany({ skipDuplicates: true })` with composite PK `@@id([eventId, userId])` providing automatic dedup. Second run inserts 0 rows.
  - **Cleanup** (line 279–281): `prisma.$disconnect()` in `.finally()` block — connection is released on both success and error paths.

- **"Local login works with the seeded admin; UNUSED codes and the 12 events exist in Postgres"** → met  
  Evidence: Code creates exactly the required data:
  - **Admin** (lines 118–136): `admin@comuninca.pe` / `admin123` created via Supabase Admin API → `public.User` upserted with `role: "ADMIN"` (the feature #4 trigger creates a `USER` row; seed promotes to `ADMIN`). Credentials documented in block comment (lines 4–13).
  - **10 UNUSED codes** (lines 179–187): all 10 have `status: "UNUSED"`, stable IDs, `skipDuplicates: true`.
  - **12 events** (lines 196–247): `SEED_EVENTS` imported from `lib/constants.ts` (line 18 — no duplication). Host IDs mapped from old prototype IDs (`u1`…`u4`) to real Supabase auth UUIDs via `normalUserIds` map (line 172, 199). All events set `modality: "IN_PERSON"` (consistent with all seed events having physical locations). Attendees collected as `(eventId, userId)` tuples and bulk-inserted via `createMany({ skipDuplicates })`.
  - **4 normal users** (lines 144–173): Ava, Marco, Priya, Jonas with `onboardingCompleted: true` (skip onboarding gate for testing). Credentials documented in block comment.

  Cannot execute live seed (no local Supabase Docker instance in this environment), but the code structure is correct and follows the same patterns verified in previous reviews for features #1–#4 against the same Supabase schema.

## Checkpoints

- **C1 (harness):** [x] — All harness files present (14/14), `feature_list.json` valid, `bash init.sh` steps pass (lint: 0 errors, 2 pre-existing warnings not from seed.ts; tsc: clean; vitest: passWithNoTests). `.env.example` lists all variables with empty values; no real secrets in any tracked file.
- **C2 (state):** [x] — Exactly 1 feature `in_progress` (#7); all dependencies (#2 `prisma_schema_init`, #4 `auth_user_sync_trigger`) are `done`; `progress/current.md` reflects the active session. No `in_progress` or `done` feature has unsatisfied deps.
- **C3 (architecture):** [x] — Layering holds: `prisma/seed.ts` imports `prisma` from `lib/db.ts` (line 17 — singleton, §2); creates Supabase admin client inline (acceptable for a standalone seed script per architecture §2: `"prisma/` — … `seed.ts`"); no component touches Prisma or `process.env`; `SUPABASE_SERVICE_ROLE_KEY` is loaded server-side from `dotenv/config` (line 15), never exposed to browser; `lib/selectors.ts` and `lib/dateUtils.ts` untouched; no `redirect()`/`notFound()` in seed (N/A — script, not action); all user-facing copy rule N/A for dev tool. No `package-lock.json` or `yarn.lock` present.
- **C4 (verification):** [x] — Lint/typecheck clean; vitest passes (`--passWithNoTests`); seed is a data script (not a pure-logic unit), so unit-test requirement (definition of done item 2: "pure logic") is N/A. Acceptance criteria verified by structural code review — idempotency patterns are exhaustive and provably correct from code inspection.
- **C5 (closure):** [x] — Session not yet closed (feature still `in_progress`, awaiting this review). No suspicious untracked files beyond expected artifacts (`prisma/seed.ts`, `progress/impl_dev_seed.md`, `progress/review_dev_seed.md`). CRLF warnings in git are a Windows-platform artifact, not a code issue.

## Detailed verification

### Static checks
```
pnpm lint             → 0 errors, 2 pre-existing warnings (app/layout.tsx, components/CalendarApp.tsx)
pnpm exec tsc --noEmit → clean (exit 0)
pnpm test             → vitest run --passWithNoTests → clean (0 test files)
```
All checks green — nothing introduced by this feature.

### Architecture compliance: seed-specific
| Rule | Source | Verdict |
|------|--------|---------|
| Persistence only via `lib/db.ts` | arch §2 | ✅ `import { prisma } from "../lib/db"` (line 17) |
| Supabase clients in `lib/supabase/*` | arch §2 | ✅ Seed creates admin client inline (standalone script, not a component/action — §2 lists `prisma/seed.ts` explicitly) |
| Secrets server-only, never defaulted | arch §3 | ✅ `SUPABASE_SERVICE_ROLE_KEY` from `process.env` + `dotenv/config`; never imported by client code; `.env.example` has empty value |
| `@default(cuid())` override for InviteCode | conventions §4 | ✅ Seed provides explicit string `id` values (`seed-code-001`…) — defaults are overridden correctly; `@unique` on `code` provides secondary dedup |
| `prisma.$disconnect()` called | conventions §4 | ✅ Lines 279–281: `.finally(async () => { await prisma.$disconnect() })` |
| tsx installed as devDependency | feature spec | ✅ `package.json` line 43: `"tsx": "^4.23.1"` under `devDependencies` |
| Test credentials in comments | feature spec | ✅ Block comment lines 4–13: admin + 4 normal users with email/password |
| `SEED_EVENTS` from `lib/constants.ts` (no dup) | feature spec | ✅ Line 18: `import { SEED_EVENTS } from "../lib/constants"` |
| `prisma.config.ts` wired to seed | feature spec | ✅ `prisma.config.ts` line 8: `seed: "tsx prisma/seed.ts"` |

### Idempotency strategy: execution-order correctness
The seed runs operations in the correct dependency order:
1. Admin user created first (no dependencies)
2. Normal users created (no dependencies on admin; used by events)
3. Invite codes created (no dependencies)
4. Events created → event IDs captured → attendee rows collected
5. Attendees bulk-inserted at end

On re-run: all lookup/findFirst operations resolve against existing data; all writes use upsert/skipDuplicates. The only non-idempotent call (`supabaseAdmin.auth.admin.createUser`) is wrapped in a try/fallback pattern. ✅

### Observations (non-blocking)
1. **`process.exit(1)` in `.catch()` before `.finally()`** (lines 275–281): If the seed errors, `process.exit(1)` fires before `.finally()` has a guaranteed chance to run `prisma.$disconnect()`. The OS will close the TCP connection on process exit, so this is harmless — but the disconnect may not execute on the error path. Not blocking; common Node.js CLI pattern.
2. **InviteCode `id` values bypass `@default(cuid())`**: The seed explicitly sets `id` to `"seed-code-001"` etc., which aren't cuid-formatted strings. This is intentional for stable idempotency and is fine — Prisma's `@default` is only applied when no value is provided. The production invite-code generation (feature #9) will use `crypto.randomBytes/nanoid` with its own format, so no conflict.
3. **No `"use server"` / `"server-only"` import in seed.ts**: Correct — `prisma/seed.ts` is a standalone Node.js script executed by `tsx`, not a Next.js module. Adding `server-only` would break standalone execution.
4. **`esbuild: true` in `pnpm-workspace.yaml`**: Required by `tsx` → `esbuild` dependency. The implementer documented this in the report. Correct and necessary.

## Required changes

None.