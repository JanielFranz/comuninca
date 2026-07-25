# CHECKPOINTS — Final-state evaluation

> In multi-agent systems the destination is evaluated, not the path. These are
> the objective checkpoints a judge (human or AI) uses to decide whether the
> project is healthy. The reviewer agent walks every box before a session
> closure is accepted.

## C1 — The harness is complete

- [ ] Base files exist: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`,
      `feature_list.json`, `progress/current.md`, `progress/history.md`,
      `opencode.json`.
- [ ] The rules exist: `.opencode/rules/architecture.md`,
      `.opencode/rules/conventions.md`, `.opencode/rules/verification.md`.
- [ ] The specs exist: `docs/user-stories.md`,
      `docs/technical-blueprint.md`.
- [ ] The agents exist: `.opencode/agent/leader.md`,
      `.opencode/agent/implementer.md`, `.opencode/agent/reviewer.md`.
- [ ] `bash init.sh` finishes with exit code 0.

## C2 — The state is coherent

- [ ] At most one feature is `in_progress` in `feature_list.json`.
- [ ] No feature is `in_progress` or `done` while one of its `depends_on` is
      not `done`.
- [ ] Every `done` feature has passing tests (or, for config/doc-only
      features, the artifact named in `paths` exists).
- [ ] `progress/current.md` is the empty template or describes the active
      session — no leftovers from previous sessions.

## C3 — The code respects the architecture

- [ ] Layering holds: components don't fetch data or import Prisma;
      persistence goes only through Server Actions (`lib/actions/*`) and
      `lib/db.ts`; the Prisma client is constructed only in `lib/db.ts`;
      Supabase clients only in `lib/supabase/*`; `lib/selectors.ts` and
      `lib/dateUtils.ts` stay pure.
- [ ] Auth/role is enforced inside every Server Action
      (`requireUser`/`requireAdmin`); middleware gates `/calendar`, `/admin/*`,
      `/onboarding`.
- [ ] No `redirect()` / `notFound()` inside programmatically-invoked Server
      Actions — they return typed results.
- [ ] No secret is hard-coded, defaulted in code, logged, or referenced from a
      client component; only `NEXT_PUBLIC_*` reaches the browser; `.env*`
      stays untracked and `.env.example` lists every key with empty values.
- [ ] All user-facing copy lives in `lib/strings.ts` (es-PE); dates/times via
      `lib/dateUtils.ts`.
- [ ] Dependencies are pnpm-managed (committed `pnpm-lock.yaml`, no
      `package-lock.json`/`yarn.lock`); no debug `console.log`, no
      context-free TODOs.

## C4 — Verification is real

- [ ] `tests/` has at least one test covering each new unit/action, asserting
      the concrete result (not just "no throw") plus an error path.
- [ ] Unit tests never invoke real Supabase (Auth/Postgres/Storage) — clients
      are mocked; the suite passes offline.
- [ ] DB-backed tests use a disposable local Supabase Postgres, never your
      working database.
- [ ] `pnpm test` shows > 0 tests, all green; `pnpm lint` and
      `pnpm exec tsc --noEmit` are clean (once configured, features #5+).

## C5 — The session was closed correctly

- [ ] No suspicious untracked files (`*.tmp`, build output) outside
      `.gitignore`.
- [ ] `progress/history.md` has an entry for the last session.
- [ ] The last feature worked on is in its correct state in
      `feature_list.json`.
- [ ] New artifacts/routes are documented (a rules file, the blueprint, or a
      module note), per the Definition of Done.

---

**How to use this file:** the reviewer (`.opencode/agent/reviewer.md`) goes
through each checkbox, marks `[x]` or `[ ]`, and rejects the session closure
if any box in C1–C5 remains empty.
