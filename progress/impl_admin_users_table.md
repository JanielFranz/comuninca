# Implementation report: #12 admin_users_table

## Files
- `lib/actions/admin.ts` (new): `listUsers({page, q})`, guarded first by `requireAdmin()`, typed result, no redirect, catch -> `UNEXPECTED` (no text).
- `lib/usersQuery.ts` (new): pure helpers `parsePage`, `normalizeSearch`, `escapeLike`, `computePageCount`, `clampPage`, `buildUsersHref`, constants (page size 20, q max 100).
- `app/admin/users/page.tsx` + `page.module.css` (new): Server Component; `requireAdminOrRedirect()`, awaits `searchParams`, GET search form, total header, pagination links preserving `q`, empty states, error state.
- `components/admin/UsersTable.tsx` + `.module.css` (new): presentational table (horizontal scroll container), profession/ikigai in native `<details>`.
- `lib/dateUtils.ts`: added `fmtDate` (instant, America/Lima, es-PE) and `fmtDateOnly` (UTC parts).
- `lib/strings.ts`: `STRINGS.admin.usersLink` and `STRINGS.admin.users.*`.
- `app/admin/page.tsx`: second link to `/admin/users` (only change).
- `tests/unit/admin-users.test.ts` (new, 49 tests).

## Decisions
- LIKE wildcards: I captured the SQL Prisma 7.9 generates with a throwaway fake driver adapter (probe file removed): `contains` becomes `ILIKE ('%' || $1 || '%')` with the raw argument, i.e. NO escaping. So `escapeLike` backslash-escapes `\`, `%`, `_` (Postgres default escape char) before passing to `contains`.
- Birthday: DB `date` comes back as midnight UTC; serialized as ISO and formatted with `timeZone: "UTC"` in `fmtDateOnly`. Test runs under TZ=America/Lima (local `getDate()` would be 14, formatted output is 15) and Pacific/Auckland.
- createdAt formatted in America/Lima (deterministic regardless of server TZ; my choice, es-PE product).
- ICU output has a dot after month abbreviation ("15 may. 1990").
- Query: `role: "USER"` always; counts: total (all USER) and matching (only queried when a search is active); pageCount = max(1, ceil(matching/20)); page clamped to pageCount; `page` parsing accepts only `^\d+$` safe integers (huge unsafe -> 1, huge safe -> clamped to last page).
- `select` limited to the 8 fields plus `inviteCode.code`.
- Page: `UNAUTHENTICATED`/`FORBIDDEN` from the action redirect to `/login` / `/calendar`; `UNEXPECTED` renders an es-PE alert.

## Verification
- `bash init.sh` exit 0, 10 files, 264 tests passed (215 existing + 49 new).
- `pnpm build` OK; route table lists `ƒ /admin/users`.
- Dev smoke on port 3100, no cookies: `/admin/users` -> 307 /login; `/admin/users?q=x&page=2` -> 307 /login. Server stopped, port 3100 confirmed free (port 3000 untouched).
- Greps clean: no `redirect(` in `lib/actions/*.ts`; no prisma/supabase imports in `components/`; no `dangerouslySetInnerHTML`; no `console.*`; no hard-coded UI text in the new components/page.

## NOT verified by me
- Anything against the real database: 27-user split 20+7, every user reachable, real ILIKE behavior with escaped `%`/`_`/`\` (Postgres treats `\` as the default LIKE escape; only confirmed by reasoning + generated SQL), invite code shown, ADMIN never listed in live data, `page=999`/`page=abc` live.
- Anonymous is verified only via proxy 307; non-admin USER session not exercised.
- Visual appearance in a real browser, narrow-screen scroll, `<details>` interaction, HTML-in-name rendering (React-escaped by construction, not seen live).

## Follow-up fix
- `normalizeSearch` now strips U+0000-U+001F and U+007F before capping (100) and trimming; a NUL-only `q` becomes empty (no search, no `UNEXPECTED`; Postgres rejects NUL in text params). Tests added in `tests/unit/admin-users.test.ts` (NUL only, NUL inside, tab/newline/DEL, accents unchanged, cap after stripping, `listUsers({q:"\u0000"})` has no OR clause).
- `fmtDateOnly` timezone test already runs under America/Lima (UTC-5, asserts local `getDate()` would be 14 while output is 15) and Pacific/Auckland; unchanged.
