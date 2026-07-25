# AGENTS.md — Navigation map for AI agents

> Entry point for any agent working in this repo. This is **not** a rulebook —
> it's a **map**. Read only what you need, when you need it (progressive
> disclosure).

Comuninca is a community events calendar (Next.js 16 App Router · React 19 ·
TypeScript · pnpm · CSS Modules · es-PE UI). The repo starts as an in-memory
prototype (demo login, seed data in `lib/constants.ts`) and is being built
into a persistent RBAC app on **Supabase (Postgres + Auth + Storage) +
Prisma**: an **admin** role (normal-users table + invite/access code
generation) and a **normal user** role (register with invite code, first-login
onboarding, post/join/browse events). That work is tracked in
`feature_list.json`, sourced from `docs/user-stories.md` (Epics 1–4) and
`docs/technical-blueprint.md` (Phases 0–4).

---

## 1. Before you start (mandatory)

1. Run `bash init.sh` and verify it finishes with exit code 0 (harness files +
   feature list validity + lint/typecheck/tests once they exist). If it fails,
   **stop** and fix the environment before touching code.
2. Read `progress/current.md` for the state of the last session.
3. Read `feature_list.json` and choose **one** `pending` task whose
   `depends_on` are all `done`. Work on one at a time.

## 2. Repository map

| File / folder | What it contains | When to read it |
|---|---|---|
| `feature_list.json` | Build tasks with status + dependencies (23 features, Phase 0–4) | Always, at the start |
| `docs/user-stories.md` | Product spec: epics, user stories, acceptance criteria (US/AC) | When a feature is ambiguous |
| `docs/technical-blueprint.md` | Stack, Prisma data model, auth/RBAC design, CI/CD, roadmap | When a feature is ambiguous |
| `progress/current.md` | State of the current session | Always, at the start |
| `progress/history.md` | Append-only log of past sessions | For historical context |
| `.opencode/rules/architecture.md` | Layering, module map, boundaries (binding) | Before implementing |
| `.opencode/rules/conventions.md` | TS / Next / Prisma / CSS-Modules style rules | Before writing code |
| `.opencode/rules/verification.md` | How to prove work is functional | Before declaring `done` |
| `CHECKPOINTS.md` | Objective "healthy final state" criteria | To self-assess |
| `.opencode/agent/` | Agent definitions (leader, implementer, reviewer) | If orchestrating |
| `opencode.json` | OpenCode config: default agent + permissions | Config changes |
| `app/`, `components/`, `lib/` | Application code | For implementation |
| `prisma/`, `supabase/` | Schema, migrations, SQL triggers (from feature #2/#4) | For DB work |
| `tests/` | Vitest + Playwright suites (from features #5/#18/#22) | For verification |

## 3. Hard rules (non-negotiable)

- **One feature at a time.** Don't mix changes from multiple tasks in a
  session.
- **Respect dependencies.** Don't start a feature whose `depends_on` isn't
  fully `done`.
- **No `done` without green `init.sh` and reviewer approval.**
- **pnpm only.** `pnpm add` / `pnpm exec`; never `npm`/`yarn`, never hand-edit
  `package.json` versions, never commit a stale `pnpm-lock.yaml` (and do not
  resurrect `package-lock.json`).
- **Document as you work** in `progress/current.md`, not at the end.
- **All user-facing copy lives in `lib/strings.ts` (es-PE)**; dates/times via
  `lib/dateUtils.ts`.
- **Never call real Supabase (Auth/Postgres/Storage) in unit tests** — mock
  the clients. The suite must pass offline.
- **Leave the repo clean** before closing (see §5).
- **If you don't know something, read `docs/` / the rules** before inventing.

## 4. How to choose a task

```
1. Open feature_list.json
2. Filter status == "pending"
3. Discard any whose depends_on contains a feature not yet "done"
4. Take the remaining one with the lowest "id"
5. Set its status to "in_progress" and save
6. Note in progress/current.md: feature, start date, brief plan
```

## 5. Session closure (lifecycle)

1. Run `bash init.sh` — all green.
2. If finished **and the reviewer approved**: set `status: "done"` in
   `feature_list.json`.
3. Move the `progress/current.md` summary to the end of `progress/history.md`.
4. Reset `progress/current.md` to its template.
5. No leftover temp files, debug `console.log`, or context-free TODOs.

## 6. If you get stuck

- Reread the feature's `plan_ref` in `docs/user-stories.md` /
  `docs/technical-blueprint.md` and the rules files.
- If a tool doesn't do what you expect, **do not invent a workaround**: log
  the block in `progress/current.md`, set the feature's status to `blocked`,
  and stop the session.

## 7. Role

In this repo the primary session acts as the **`leader`** agent
(`.opencode/agent/leader.md`, set as `default_agent` in `opencode.json`) for
code tasks — it decomposes and coordinates, dispatching `implementer` and
`reviewer` subagents via the Task tool, and never edits application code
directly (its permission ruleset enforces this). Pure reading, conceptual
questions, and non-code edits (docs, `progress/`, `feature_list.json` status)
are handled directly without subagents.

> Working outside the harness on a quick fix? Switch the agent (e.g. to
> `build`) in the TUI — the leader's edit restrictions apply only to the
> leader agent.
