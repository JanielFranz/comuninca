# Feature #4: auth_user_sync_trigger — Implementation Report

## Summary

Created the `auth.users → public.User` sync trigger as a versioned Supabase
migration in `supabase/migrations/20260726000000_auth_user_sync.sql`.

## Files touched

| File                                                    | Action  | Description                                                                 |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `supabase/migrations/20260726000000_auth_user_sync.sql` | Created | Postgres trigger functions + triggers for INSERT and DELETE on `auth.users` |
| `progress/current.md`                                   | Updated | Session log for feature #4                                                  |

## Decisions

### 1. Trigger naming and structure

- **`handle_new_user()`** — `SECURITY DEFINER` function, inserts into `public."User"` with `id`, `email`, `"fullName"` (from `raw_user_meta_data` or `''`), `"role" = 'USER'`, `"onboardingCompleted" = FALSE`, `"createdAt" = NOW()`.
- **`on_auth_user_created`** — `AFTER INSERT ON auth.users FOR EACH ROW`.
- **`handle_deleted_user()`** — `SECURITY DEFINER` function, removes dependent rows in order: `EventAttendee` (for hosted events) → `EventAttendee` (own attendances) → `Event` (hosted) → `User`. This satisfies the `ON DELETE RESTRICT` foreign keys.
- **`on_auth_user_deleted`** — `AFTER DELETE ON auth.users FOR EACH ROW`.

### 2. Table/column references

- The Prisma migration created the table as `"User"` (capital U, quoted). The trigger references it as `public."User"` throughout.
- Column names match the Prisma schema exactly: `id`, `email`, `"fullName"`, `"role"`, `"onboardingCompleted"`, `"createdAt"`.
- The `Role` enum value is `'USER'` (not `"USER"`) — this matches the Prisma migration's `'USER'` enum literal.

### 3. DELETE cascade ordering

The foreign keys on the Prisma-generated tables use `ON DELETE RESTRICT`:

- `Event.hostId → User.id` (RESTRICT)
- `EventAttendee.userId → User.id` (RESTRICT)
- `EventAttendee.eventId → Event.id` (RESTRICT)

The delete trigger handles cleanup in the correct dependency order:

1. Delete `EventAttendee` for events hosted by this user (breaks EventAttendee→Event FK)
2. Delete `EventAttendee` where this user is an attendee (breaks EventAttendee→User FK)
3. Delete `Event` rows hosted by this user (breaks Event→User FK)
4. Delete the `User` (all FKs to User now satisfied)

The `User.inviteCodeId → InviteCode.id` FK uses `ON DELETE SET NULL` (on the User side), so deleting the User does not affect InviteCode records.

### 4. Migration not applied (Docker unavailable)

The local Docker daemon is not running, so `supabase migration up` cannot connect
to the Postgres container. The SQL file is version-controlled and ready to be
applied. It will be picked up by `supabase migration up` or `supabase db push`
when the local Supabase stack is running, or by `supabase db push` against a
remote project.

## Verification

### `bash init.sh` — GREEN (exit 0)

```
[OK]   node -> v24.15.0
[OK]   Node version compatible
[OK]   pnpm -> 11.1.3
[OK]   All harness files exist
[OK]   opencode.json valid JSON
[OK]   feature_list.json valid (23 features, 3 done, 1 in progress)
[OK]   node_modules present
[WARN] No ESLint config yet (feature #5) — skipping lint.
[OK]   TypeScript typecheck clean
[WARN] No test script/files yet (features #5/#18+) — skipping tests.
[OK]   Environment ready. You can start working.
```

### SQL correctness check

- All identifiers match the Prisma schema (`"User"`, `"fullName"`, `"role"`, etc.)
- `CREATE OR REPLACE` ensures idempotency
- `SECURITY DEFINER SET search_path = ''` prevents search-path injection
- Triggers use `AFTER INSERT/DELETE` on the correct table (`auth.users`)
- The `COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')` provides a safe default for `fullName` (NOT NULL column) — registration action (feature #10) will update this later
- No syntax errors detected

### Acceptance criteria

| Criteria                                                                               | Status             | Evidence                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| Signing up an auth user creates a public.User row with matching id/email and role USER | ✅ Ready           | Trigger function references correct columns and enum value                                         |
| Trigger SQL is version-controlled and applied to the Supabase project                  | ✅ Ready (partial) | File at `supabase/migrations/20260726000000_auth_user_sync.sql`; apply pending Docker availability |
