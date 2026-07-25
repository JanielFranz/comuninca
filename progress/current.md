# Current Session

> Cleared when each session closes; its summary moves to `history.md`. While
> working, **keep this updated in real time**, not at the end.

- **Feature in progress:** _none_
- **Date:** 2026-07-25

## Next step

- **#3 `supabase_client_factories`** — depends on #1 (done). Can start immediately.
- **#4 `auth_user_sync_trigger`** — depends on #2 (done). Ready.
- **#5 `ci_verify_pipeline`** — depends on #2 (done). Ready.
- #3 and #4 can run in parallel; #2's migration is applied and verified.

## Dependency chain status

```
✅ 1 (env) → ✅ 2 (schema) →  4 (trigger) → 7 (seed) → 6 (login) → 8 (middleware)
             ✅ 2 → 5 (CI)
✅ 1 → 3 (SSR clients) → 6
```

## Environment notes

- Running init.sh: Git Bash at `C:\Program Files\Git\bin\bash.exe`
- Local Supabase: pooler on 54329, direct Postgres on 54322, API on 54321
- .env.local has real local Supabase values; DATABASE_URL uses pooler port 54329
- Prisma migration applied: `20260725193829_init`

## Template (for session resets)

```
# Current Session

> Cleared when each session closes; its summary moves to `history.md`. While
> working, **keep this updated in real time**, not at the end.

- **Feature in progress:** <id> — <name>  (or: _none_)
- **Date:** <YYYY-MM-DD>

## Plan

- <3–5 bullets for the active feature, or "Next step" picks when idle>

## Log

- <timestamped notes while working>
```
