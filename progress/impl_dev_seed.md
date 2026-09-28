# Implementation report — #7 `dev_seed`

## Files touched
- `prisma/seed.ts` (thin entrypoint), `prisma/seed-data.ts` (pure: guard, env parsing, users/codes/event mapping), `prisma/seed-runner.ts` (`runSeed` with injected `auth` + `db`)
- `lib/supabase/admin.ts` (new `createAdminClient()`)
- `tests/unit/seed.test.ts` (20 tests)
- `package.json` / `pnpm-lock.yaml` (`pnpm add -D tsx` -> tsx ^4.23.15)
- `.env.example`, `progress/current.md`, this report

## Decisions
- **server-only**: `lib/supabase/admin.ts` intentionally has no `import "server-only"` (it throws under plain tsx). It is imported only by `prisma/seed.ts`, reads `SUPABASE_SECRET_KEY` (non-`NEXT_PUBLIC`, never inlined by Next), and carries a comment forbidding client imports. `lib/db.ts` has no `server-only` import, so it works under tsx unchanged; I did not touch it. The seed loads `lib/db` and the admin client via dynamic `import()` AFTER the guard passes, so a refused run never builds a client. The seed uses the `lib/db.ts` singleton (pooled `DATABASE_URL`), keeping "persistence only via lib/db.ts".
- **Credentials deviation**: no documented test credentials. `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD` come from env; missing -> error listing names (never values). `.env.example` has these plus `SEED_ALLOW_REMOTE` empty with comments. Note: `.env.example` had no `SUPABASE_SECRET_KEY=` line (only its comment), so I added the empty variable line (needed by the admin client).
- **Guard** (`checkSeedGuard`): refuses NODE_ENV/VERCEL_ENV production, missing/unparsable `DIRECT_URL`, and non-local host unless `SEED_ALLOW_REMOTE=true` exactly.
- **Idempotency**: auth users looked up by email (case-insensitive, paginated 200/page, max 50 pages) before `createUser`; `User` rows via `upsert` by id (works whether or not the trigger already created the row; sets role, `onboardingCompleted: true`, fullName); invite codes `createMany({skipDuplicates})` (an existing USED code is never touched); events upserted by deterministic id `seed-event-01..12`; attendees `createMany({skipDuplicates})`. Re-runs do not reset passwords of existing auth users.
- **Data**: users `ava|marco|priya|jonas@seed.comuninca.test`, names from constants; 10 codes `SEED-0001..SEED-0010`; admin fullName "Admin Comuninca". Event dates kept exactly as in constants (stored as midnight UTC for the `@db.Date` column). Constants have no modality/meeting URL, so all events are `IN_PERSON` with the constant's `location`; `category` string kept as-is.
- Console messages are plain English (dev CLI, not in `lib/strings.ts`).
- Note: `vitest.config.ts` does not exist in the repo (the brief assumed it does); Vitest runs with defaults and picks up `tests/unit/*.test.ts`. Seed modules use relative imports (no `@/`) so they also run under tsx. Not added, to stay in scope.

## Verification
- `bash init.sh` -> exit 0 (ESLint: 0 errors, 2 pre-existing warnings in other files).
- `pnpm exec tsc --noEmit` -> clean.
- `pnpm test` -> 1 file, 20 tests passed.
- No-write dry checks (no DB/network touched; refused before any client is built):
  - `NODE_ENV=production pnpm exec tsx prisma/seed.ts` -> `Refusing to seed: production environment.` exit=1
  - normal env with the project's remote `DIRECT_URL` and no opt-in -> `Refusing to seed remote database host "<supabase pooler host>". Set SEED_ALLOW_REMOTE=true to allow it explicitly.` exit=1
- `pnpm-lock.yaml` diff is larger than a one-line addition: adding tsx (esbuild) made pnpm re-resolve peer-dependency suffixes (e.g. `jiti`, `debug` variants on eslint/next/vitest entries) plus the tsx/esbuild packages. No top-level versions of existing deps changed; `package.json` only gained `tsx`. pnpm also warned `Ignored build scripts: esbuild` (tsx works regardless; verified by the dry runs).

## NOT verified locally
- Real run against Supabase: admin user creation via the Auth admin API, the trigger-created `User` row, real Prisma upserts/`createMany`, real login with the seeded admin, and the rows existing in Postgres. Requires `pnpm db:seed` with `SEED_*` set and `SEED_ALLOW_REMOTE=true` (the only DB is hosted), which I did not run.
- That `prisma db seed` (Prisma 7 config `migrations.seed`) invokes tsx and passes env through as expected; I only ran `tsx prisma/seed.ts` directly (with `dotenv/config` loading `.env`).

## Review cycle 1 fixes
- `checkSeedGuard` (prisma/seed-data.ts) now checks every write target: `DIRECT_URL`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`. Each must be set and parsable (refused even with opt-in) and local (`localhost`/`127.0.0.1`/`::1`) unless `SEED_ALLOW_REMOTE` is exactly `"true"`. Refusal names the variable and host only, never the URL or credentials.
- Tests: 20 -> 28 (all-local allowed; all-remote refused without opt-in and allowed with; mixed config refused for each of the 3 variables; missing and unparsable refused per variable, even with opt-in; production refusals kept).
- `bash init.sh` exit 0; `pnpm test` 28 passed; tsc clean.
- Dry checks (no connection): `NODE_ENV=production tsx prisma/seed.ts` -> `Refusing to seed: production environment.` exit 1; remote without opt-in -> `Refusing to seed: DIRECT_URL points to remote host "<supabase pooler host>". Set SEED_ALLOW_REMOTE=true to allow it explicitly.` exit 1.
- Note: a live run now needs all three URLs remote-consistent plus `SEED_ALLOW_REMOTE=true`.
