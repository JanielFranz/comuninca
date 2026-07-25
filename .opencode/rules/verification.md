# Verification — how to prove the work functions

> Golden rule: the agent doesn't say "it works", it **proves it**. Every
> feature ends with executable evidence, not assertions.

The harness gate is `bash init.sh` — it must finish with exit code 0 before a
session starts and again before any feature is declared `done`. It runs lint,
typecheck, and the test suite (each step activates once its tooling exists).

## Verification levels

### Level 1 — Unit tests (mandatory for every feature with logic)

Tests live under `tests/` mirroring the source (`tests/unit/…`); config is
`vitest.config.ts` (added by feature #5). Pure logic is the primary target:

- `lib/validation/*` — each Zod schema: valid payload passes; each acceptance
  criterion's invalid case fails with the exact es-PE message (e.g. past date,
  end ≤ start, Presencial without address, Ocupación empty).
- `lib/selectors.ts` — the week-overlap packing (feature #18): identical
  pair, triple overlap, chained partial overlaps, non-overlapping.
- `lib/dateUtils.ts` — the ±3-month navigation window clamp (feature #19).

Each test must assert the **concrete result** (returned fields, rendered
output, error value) — not merely "did not throw" — and cover at least one
error path when the unit can fail.

```bash
pnpm test            # vitest run (what init.sh runs)
pnpm test:watch
```

### Level 2 — Integration tests (DB-backed / actions)

- Server Action tests (`tests/integration/`) run against a **disposable local
  Supabase Postgres** (`supabase start`), never your working database.
  Cover: register consumes a code atomically (and rolls back on failure), a
  used/invalid code is rejected, `toggleJoin` never duplicates an attendee,
  role guards deny non-admin calls.
- Supabase Auth/Storage clients are **mocked** at the module boundary — no
  test performs a real network call; the suite passes offline.
- Keep DB-touching tests compatible with a single-fork pool so they never
  race.

### Level 3 — Manual smoke + E2E (user-facing features)

Boot the app and exercise the real path; record evidence in
`progress/current.md`:

```bash
pnpm dev                     # http://localhost:3000
# register with a seeded code → onboarding → calendar
# admin login → generate codes → copy all → codes list / users table
# create event (incl. each validation error + Virtual-without-address)
# join/leave an event; check the week view with two identical-time events
pnpm build                   # production build must pass
```

Feature #22 adds the Playwright suite (`tests/e2e/`) covering those flows end
to end as a CI gate; until then the manual checklist above is the Level 3
evidence.

## Anti-patterns (don't do these)

- ❌ "I added the action, it should work." → no executable test.
- ❌ A test that mocks the framework itself or asserts only "no exception".
- ❌ A test that silently calls **real** Supabase/Auth/Storage — the suite
  must pass with no network.
- ❌ Tests that touch the **dev** database instead of a disposable one.
- ❌ Marking a feature `done` without `bash init.sh` green **and** reviewer
  approval.
- ❌ A secret added to a tracked file, or referenced from a client component.

## Final verification before closing

```bash
bash init.sh        # must end with [OK] Environment ready
```

If `init.sh` is red, do **not** mark anything `done`. Log the blocker in
`progress/current.md` and set the feature's status to `blocked` in
`feature_list.json`.
