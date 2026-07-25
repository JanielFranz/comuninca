# Session History (append-only)

> When a session closes, the summary from `progress/current.md` is appended
> here: date, feature, what was done, verification evidence, final status.

## 2026-07-24 — Harness created (Claude Code → OpenCode port)

- Ported the leader/implementer/reviewer agent harness from the Aplika
  project (`C:\Users\janie\Documents\projects`, which ran on Claude Code) to
  this repo, adapted to **OpenCode** and to the Comuninca stack (Next.js 16 /
  React 19 / TypeScript / pnpm / Supabase + Prisma / CSS Modules / es-PE).
- Added: `AGENTS.md` (navigation map, OpenCode's native entry point),
  `CHECKPOINTS.md`, `init.sh` (environment + harness gate with a
  `feature_list.json` validator; lint/test steps activate once features #5+
  add the tooling), `progress/{current,history}.md`,
  `.opencode/agent/{leader,implementer,reviewer}.md` (OpenCode agent files:
  `mode` + `permission` frontmatter — the leader is a primary agent whose edit
  permission denies application-code edits), `.opencode/rules/{architecture,
  conventions,verification}.md` (binding rules adapted from the Claude
  versions: CSS Modules instead of Tailwind, `lib/strings.ts` copy rule,
  `lib/db.ts` / `lib/actions/*` / `lib/supabase/*` layering, offline test
  rule), and `opencode.json` (`default_agent: "leader"`, bash permissions for
  `init.sh`/`pnpm`/`node`).
- Already present from prior sessions: `docs/user-stories.md` (Epics 1–4,
  US/AC), `docs/technical-blueprint.md` (Phases 0–4), and `feature_list.json`
  (23 features, all `pending`, dependencies wired to the blueprint phases).
- No application code changed. The build begins with feature #1
  (`env_and_supabase_setup`).
- Environment fix during setup: set `allowBuilds: { sharp: true }` in
  `pnpm-workspace.yaml` (was an unset placeholder) so pnpm 11 approves sharp's
  build script — `pnpm exec tsc --noEmit` was failing the gate with
  `ERR_PNPM_IGNORED_BUILDS` before the fix.
- Verified: `bash init.sh` (via Git Bash at `C:\Program Files\Git\bin\bash.exe`
  — no WSL on this machine) finishes green: harness files present,
  `feature_list.json` valid (23 features, 0 done), `tsc --noEmit` clean; lint
  and tests warn-skip until features #5+ add the tooling.

## 2026-07-25 — Feature #1: env_and_supabase_setup ✅ done

- **Feature:** Supabase project + env wiring (Phase 0, no dependencies)
- **What was done:** Created `.env.example` with 5 variables (DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) all with empty values and clear comment blocks. Created `.env.local` with the user's local Supabase dev values (pooler on port 54329, direct on 54322). Updated `.gitignore` from `.env*.local` to `.env*` (covers all env variants). Installed 7 runtime deps (prisma, @prisma/client, @supabase/ssr, @supabase/supabase-js, zod, react-hook-form, @hookform/resolvers) and 2 dev deps (vitest, prettier) via pnpm. Removed stale package-lock.json.
- **Verification:** `bash init.sh` green — typecheck clean, node_modules present, feature_list.json valid (1 done, 0 in_progress). Reviewer approved with no changes requested.
- **Review:** progress/review_env_and_supabase_setup.md (APPROVED) — all 3 acceptance criteria met, no secrets in tracked files, pooler/direct ports correctly mapped.
