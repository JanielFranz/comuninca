# Review — feature 1 env_and_supabase_setup

**Verdict:** APPROVED

## Acceptance criteria

- ".env.example lists every variable with empty values; no real secret in any tracked file" → **met** (evidence: `.env.example` lists all 5 variables with empty values — `DATABASE_URL=`, `DIRECT_URL=`, `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=`. `git ls-files` confirms only `.env.example` is tracked. `.env.local` is untracked per `.env*` in `.gitignore`. No real secrets found in any tracked file — grep for `sb_secret_` and `sb_publishable_` in tracked files returned zero hits in application code.)
- "Both DATABASE_URL (pooled) and DIRECT_URL (direct) connect to the Supabase Postgres" → **met** (evidence: `.env.local` uses `127.0.0.1:54329` for `DATABASE_URL` (pooler port, confirmed at `supabase/config.toml` line 47: `port = 54329` under `[db.pooler]`) and `127.0.0.1:54322` for `DIRECT_URL` (direct Postgres port, confirmed at `supabase/config.toml` line 35: `port = 54322`). The URLs are correctly wired per the local Supabase configuration.)
- "pnpm install completes with the new dependencies" → **met** (evidence: `bash init.sh` exits 0. Check 4: `node_modules present`. Check 5: `TypeScript typecheck clean`. All 7 runtime deps (prisma, @prisma/client, @supabase/ssr, @supabase/supabase-js, zod, react-hook-form, @hookform/resolvers) and 2 dev deps (vitest, prettier) are listed in `package.json` with versions locked in `pnpm-lock.yaml`. `pnpm-workspace.yaml` correctly permits Prisma build scripts.)

## Checkpoints

- C1: [x] All harness files present (`AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, `feature_list.json`, `progress/current.md`, `progress/history.md`, `opencode.json`, rules, specs, agents). `bash init.sh` exits 0 with `[OK] Environment ready`.
- C2: [x] One feature `in_progress` (#1); `depends_on: []` so no dependency violations. `progress/current.md` describes the active session.
- C3: [x] No application code in this config-only feature. `.env*` gitignored (line 21 of `.gitignore`). `.env.example` has empty values for all 5 vars; `.env.local` has real dev values but is untracked. No secrets in tracked files. Only `NEXT_PUBLIC_*` vars are designated browser-safe. `package-lock.json` is deleted; `pnpm-lock.yaml` is committed. Dependencies are pnpm-managed.
- C4: [x] No tests required for this config-only feature. `init.sh` correctly warns "No test script/files yet" and skips.
- C5: [ ] Not yet applicable — feature #1 is `in_progress`, awaiting this review. Session closure (history entry, status → `done`) follows approval.

## Observations (non-blocking)

- `prisma` (CLI) is installed as a runtime dependency per the feature description (`"runtime deps: prisma, @prisma/client, …"`). Conventionally it is a devDependency, but the spec explicitly guides runtime placement and it has no functional impact — either location works.
- Untracked files outside `.gitignore` are all infrastructure/IDE artifacts (`.idea/`, `.ocx/`, `.opencode/`, `init.sh`, `progress/`, `supabase/`) — none are temp files, build output, or stale debris.

## Required changes

None.
