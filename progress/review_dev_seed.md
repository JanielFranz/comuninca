# Review — feature 7 dev_seed (cycle 2 of 2)

**Verdict:** APPROVED

Required change 1 from cycle 1 is fixed and verified by execution. Acceptance criterion 2 remains NOT verifiable offline and must be checked by a live run before the feature is marked `done`.

## Acceptance criteria

- "pnpm db:seed is idempotent (safe to re-run)" -> met at unit level (evidence: tests/unit/seed.test.ts "is idempotent" asserts 5 users / 10 codes / 12 events / attendees unchanged and createUser called exactly 5 times across two runs; "never resets a USED invite code" asserts SEED-0003 stays USED; second run reports inviteCodesCreated 0). prisma/seed-runner.ts (unchanged since cycle 1): auth lookup by email before create (L69-99), `user.upsert` by id (L101-113) tolerating the trigger-created row, `createMany` with skipDuplicates for codes (L149) and attendees (L162), events upserted by deterministic id (L155-161). A partial failure recovers on re-run. Live idempotency against real Postgres/Auth not executed.
- "Local login works with the seeded admin; UNUSED codes and the 12 events exist in Postgres" -> NOT VERIFIABLE OFFLINE; requires a live run. Offline evidence only: the mapping/runner tests assert 12 events with valid hostIds, admin ADMIN + onboardingCompleted true, 10 codes all UNUSED. Not executed: real Auth admin createUser, trigger interaction, real Prisma writes, real login.

Recommendation: APPROVE the implementation with criterion 2 recorded as pending live verification. Do not set status `done` until the live check below is recorded in progress/current.md.

### What the live verification must check (with SEED_ALLOW_REMOTE=true and SEED_* set, since the only DB is hosted)

1. `pnpm db:seed` exits 0 and prints "Seed complete: 5 users, 10 new invite codes, 12 events, N attendee rows" (N = sum of attendeeIds in lib/constants.ts).
2. Re-run: exits 0, "0 new invite codes", no new auth users (dashboard count unchanged), no duplicate rows.
3. SQL: admin row (by SEED_ADMIN_EMAIL) is role ADMIN, onboardingCompleted true; 4 USER rows `*@seed.comuninca.test`; InviteCode where code like 'SEED-%' and status UNUSED = 10; Event where id like 'seed-event-%' = 12; every Event.hostId exists in User; seed-event-01 date is 2026-07-17 (no day shift).
4. Real login with the seeded admin through Supabase Auth (signInWithPassword, or the app once #6 exists) succeeds and resolves to ADMIN.
5. Mark one SEED code USED, re-run seed, confirm it stays USED.
6. Confirm the trigger-created User row (fullName from user_metadata.full_name) and the upsert do not conflict (no unique-email error).

## Executed evidence (cycle 2)

- `bash init.sh` -> exit 0.
- `pnpm test` -> 1 file, **28 passed (28)** (was 20).
- `NODE_ENV=production pnpm db:seed` -> `$ prisma db seed` / `Running seed command \`tsx prisma/seed.ts\` ...` / `Refusing to seed: production environment.` / `[ELIFECYCLE] Command failed with exit code 1.`; shell exit 1; no connection made, no secrets printed.
- Guard code (prisma/seed-data.ts L12-56): loops over `WRITE_TARGETS` = DIRECT_URL, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL; each must be set (else "<NAME> is not set."), parsable via `new URL` (else "<NAME> could not be parsed."), and local unless `SEED_ALLOW_REMOTE === "true"` exactly. Missing/unparsable are refused even with opt-in. Messages contain only the variable name and the hostname (`URL.hostname` excludes userinfo), never credentials.
- Bypass attempts, executed with tsx against the real `checkSeedGuard` (DIRECT_URL varied, the other two local), temporary probe file removed afterwards:
  - `postgresql://u:p@[::1]:5432/db` -> allowed (correct, local).
  - `postgresql://u:p@LOCALHOST:5432/db` -> refused (non-special scheme keeps case; fails closed, harmless).
  - `postgresql://localhost:x@evil.com:5432/db` and `postgresql://localhost@evil.com/db` (userinfo trick) -> refused, host "evil.com".
  - `localhost.evil.com`, `127.0.0.1.evil.com`, `localhost.` (trailing dot), `evil.com/localhost` (path), `localhost,evil.com` (multi-host), `0.0.0.0`, `127.1` -> all refused.
  - `http://LOCALHOST:1` for the API URL -> allowed (special scheme lowercases; correct).
  No bypass found.
- Tests (tests/unit/seed.test.ts L16-111) assert concrete values: exact production message; all-local allowed (`{ ok: true }`); all-remote refused with the exact message naming DIRECT_URL and host "db.abc.supabase.co"; opt-in "1" refused; all-remote allowed only with "true"; `it.each` over the three variables for mixed config (message contains "<NAME> points to remote host" and not "u:p"), missing (exact message, even with opt-in) and unparsable (exact message, even with opt-in). Tests remain fully offline and do not import dotenv or read real env.
- Scope check: only prisma/seed-data.ts (guard) and tests/unit/seed.test.ts were modified after cycle 1 (mtimes 12:49:51); seed-runner.ts, seed.ts, admin.ts are unchanged (mtimes 12:44-12:45, line counts 170/50/20 as before). `git status`: same file set as cycle 1 plus my review file; no temp files; only intentional console output in prisma/seed.ts L39, L48.

## Checkpoints

- C1: [x] init.sh green, 28/28 tests.
- C2: [x] Layering and boundaries unchanged and sound (Prisma via lib/db.ts, Supabase client via lib/supabase/admin.ts, no component involvement, secrets server-only and never logged).
- C3: [x] Guard now covers all write targets; cycle-1 defect resolved. Criterion 2 explicitly deferred to live verification (see above).
- C4: [x] Tests assert concrete results and error paths; Supabase/Prisma faked; suite offline.
- C5: [x] Repo clean, no secrets in tracked/untracked files (cycle 1 grep; no new files added since), lockfile churn verified benign in cycle 1 (only tsx/esbuild additions, nothing removed or re-versioned).

## Required changes

None.

## Observations (non-blocking)

- Uppercase hosts in non-special-scheme URLs (e.g. `postgresql://...@LOCALHOST`) are refused rather than allowed; fails closed. Lowercasing the host before the lookup would be a nicety.
- prisma/seed.ts L36 casts `prisma as unknown as SeedDb`, which removes compile-time coupling between the runner's interface and the Prisma client.
- The admin upsert forces role ADMIN, onboardingCompleted true and fullName "Admin Comuninca" on whichever account owns SEED_ADMIN_EMAIL; if it is a real existing user they are silently promoted and renamed. Choose SEED_ADMIN_EMAIL deliberately for the live run.
- Event upsert `update` overwrites manual edits to seed events on re-run; seed dates are July 2026 (today 2026-09-26), which may fall outside a future +/-3-month window (#19). Not a seed bug.
- Existing auth users' passwords are not reset on re-run; changing SEED_ADMIN_PASSWORD later will not change an existing login.
- Record the credentials-from-env deviation from the spec text ("documented test credentials in .env.example") in progress/current.md when closing.
