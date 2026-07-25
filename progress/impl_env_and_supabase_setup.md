# Feature 1 — env_and_supabase_setup — Implementation Report

**Date:** 2026-07-25  
**Status:** Implemented, awaiting review

## Files created / changed

| File | Action | Notes |
|---|---|---|
| `.env.example` | Replaced | 5 env vars with empty values + explanatory comment block |
| `.env.local` | Created | Local Supabase dev values (gitignored by `.env*` rule) |
| `.gitignore` | Edited line 21 | `.env*.local` → `.env*` (covers `.env`, `.env.local`, `.env.development`, etc.) |
| `package.json` | Updated by pnpm | 7 runtime deps + 2 dev deps added |
| `pnpm-lock.yaml` | Updated by pnpm | Lockfile regenerated |
| `package-lock.json` | Deleted | Stale npm lockfile removed (pre-existing hygiene) |
| `pnpm-workspace.yaml` | Updated by pnpm | pnpm detected workspace (only-if-needed) |

## Commands executed

### Runtime dependencies
```
pnpm add prisma @prisma/client @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers
```
**Result:** 145 packages added. Installed versions: prisma 7.9.0, @prisma/client 7.9.0, @supabase/ssr 0.12.3, @supabase/supabase-js 2.110.8, zod 4.4.3, react-hook-form 7.82.0, @hookform/resolvers 5.4.0.

### Dev dependencies
```
pnpm add -D vitest prettier
```
**Result:** 39 packages added. Installed versions: vitest 4.1.10, prettier 3.9.6.

### Build script approval
```
pnpm approve-builds prisma @prisma/engines
```
**Result:** Prisma postinstall scripts executed successfully.

### TypeScript check
```
pnpm exec tsc --noEmit
```
**Result:** Clean — zero type errors.

### Harness check
```
bash init.sh
```
**Result:** Exit code 0 — all checks green (lint and tests skipped as expected for feature #1).

## Acceptance criteria verification

| # | Criterion | Evidence |
|---|---|---|
| AC1 | `.env.example` lists every variable with empty values; no real secret in any tracked file | Verified: `.env.example` has 5 variables all `=`, `.env.local` gitignored by `.env*` rule |
| AC2 | Both DATABASE_URL (pooled, port 54329) and DIRECT_URL (direct, port 54322) connect to Supabase Postgres | `.env.local` uses `127.0.0.1:54329` (pooler) and `127.0.0.1:54322` (direct) per `supabase/config.toml` |
| AC3 | `pnpm install` completes with the new dependencies | `pnpm install` runs clean; `init.sh` §4 confirms `node_modules` present; §5 typecheck passes |

## Decisions

- Pooled connection uses port **54329** (from `supabase/config.toml [db.pooler]`), direct uses **54322** (standard Supabase local Postgres port).
- `pnpm approve-builds` was required because pnpm 11 ignores build scripts by default; Prisma needs its postinstall for the query engine.
- `.env*` in `.gitignore` covers all variants (`.env`, `.env.local`, `.env.development`, `.env.production`) — needed because Next.js reads `.env` directly and we must never commit real values.

## Blockers

None.
