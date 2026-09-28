# Review — feature 12 admin_users_table

**Verdict:** APPROVED (live/manual checks pending, listed at the bottom)

## Executed evidence
- `bash init.sh` exit 0 (typecheck clean, vitest green). `pnpm test`: 10 files, 264 passed (215 existing + 49 in `tests/unit/admin-users.test.ts`); the other 9 files are untouched and green.
- `pnpm build` OK; route table lists `ƒ /admin/users` (also `/admin`, `/admin/codes`).
- Dev smoke on my own port 3100, no cookies: `/admin/users`, `/admin/users?q=%25&page=2`, `/admin/users?page=abc` (and `?q=%00`) all 307 -> `/login`. I stopped only my own PID 23212; port 3100 confirmed free; port 3000 not touched.
- Throwaway probes (deleted; no probe file remains) of `escapeLike` and the date helpers, run with runtime-set `process.env.TZ` (confirmed effective on Windows Node: `getDate()` of 1990-05-15T00:00Z is 14 in Pago_Pago/Lima/Kiritimati and 15 in UTC/Auckland):
  - `escapeLike`: `100%` -> `100\%`, `a_b` -> `a\_b`, `\` -> `\\`, `\%` -> `\\\%`, `%%` -> `\%\%`, `x\` -> `x\\`, `é😀` unchanged, NUL unchanged.
  - `fmtDateOnly("1990-05-15T00:00:00.000Z")` = "15 may. 1990" in all five zones. `fmtDate` of 2026-05-16T00:30Z = "15 may. 2026" (Lima 19:30 on the 15th); 05:00Z -> 16 may and 04:59:59Z -> 15 may in every zone (Lima boundary exact).

## Acceptance criteria
- AC 2.1.1 columns (name, email, createdAt, birthday, occupation, invite code) plus profession/ikigai (US 1.4.7) -> met by reading `components/admin/UsersTable.tsx:19-56`; native `<details>` at :43-51; dash for null/blank via `orDash`; row shaping and the select whitelist are asserted by executed tests ("shapes rows...", "selects only whitelisted fields"). The rendering itself is not executed (no jsdom): live/browser.
- AC 2.1.2 / 2.1.6 only role USER, admin-gated -> met in code: `role: "USER"` in every `where` branch and in both counts (`lib/actions/admin.ts:51-64`), asserted with exact `where`; `requireAdmin()` first (`admin.ts:43`), tested with garbage input and Prisma untouched; page uses `requireAdminOrRedirect` (`page.tsx:17`); proxy 307 executed. A non-admin USER session is not executed: live.
- AC 2.1.3 total header "Total de usuarios: N" -> met by reading (`page.tsx:43-48`, `strings.ts` `total`); total (all USER) vs matching (27 vs 3) asserted. Live count needed.
- AC 2.1.4 pagination 20/page server-side -> `take 20`, `skip (page-1)*20`, order `createdAt desc, id asc` (total order, id breaks ties) asserted with exact values; clamp and `page=abc/0/-3/2.7/huge/999` asserted; `pageCount = max(1, ceil(m/20))` table-tested (0,1,20,21,40,41). Links preserve `q` via `URLSearchParams` (round-trip tested). 27 users split 20+7 is live.
- AC 2.1.5 search by name/email, case-insensitive, server-side -> `OR[{fullName contains},{email contains}]`, `mode: insensitive`, role kept, asserted; trimmed and capped at 100. Real ILIKE behaviour is live.
- US 1.4.7 -> met (details element).

## Focus items
1. Search escaping (correct). Prisma passes `contains` as `ILIKE ('%' || $1 || '%')` with a bound parameter, so there is no injection and `standard_conforming_strings` is irrelevant (the value never appears in a SQL literal). Postgres' default LIKE escape is backslash; every `\`, `%`, `_` is prefixed with `\` in one regex pass (a `\` is never re-escaped). A trailing backslash becomes `\\` (literal), so "LIKE pattern must not end with escape character" cannot occur; `\%` -> literal backslash then literal percent; `%%`, `100%`, `a_b` are literal. Non-BMP text is untouched. NUL in `q` (`?q=%00`): Postgres rejects the parameter, the `try/catch` returns `UNEXPECTED`, and the page shows the es-PE alert (no 500, no error text leaked). A `slice(0,100)` can cut a surrogate pair; pg encodes a lone surrogate as U+FFFD, no error. The worst a crafted `q` can do is an empty result or that error state. Not executed against Postgres (reasoning + captured SQL): live check.
2. Pagination stability: total order, every row reachable. Count and page fetch are separate, non-transactional queries (`admin.ts:61-85`); a concurrent insert/delete can shift a boundary row or leave an empty last page. Benign for an admin list.
3. Exposure: select is whitelisted (no role, onboardingCompleted, hash). `UserRow.id` is used only as a React key, not rendered. No `dangerouslySetInnerHTML`; names/emails/occupations are React text. Pagination hrefs are relative `/admin/users?...` built with `URLSearchParams`: no open redirect or `javascript:` vector. `q` is echoed only via `defaultValue`. ADMIN rows are never selected.
4. Dates: all via `lib/dateUtils.ts` (`fmtDate`, `fmtDateOnly`); the only `toLocaleDateString` calls live in that file. My view: Lima for `createdAt` is right (deterministic regardless of server TZ, es-PE product, instant vs date-only distinction is correct). The calendar's `dateKey/parseDateKey` use local time and `Event.date` is not persisted yet, so revisit when events are stored.
5. Layering/hygiene: no Prisma/Supabase import in `components/`; no `redirect(` in `lib/actions/*.ts`; no `any`, no `console.*`; the `"use server"` file exports one async function plus erased types; pure helpers in `lib/usersQuery.ts`. All copy in `lib/strings.ts` (the only aria-label uses `t.paginationLabel`). CSS Modules co-located. `git status --short prisma/migrations` empty; `prisma/`, `supabase/`, `proxy.ts`, `lib/auth.ts` were last modified before this feature's files (#8/#11/seed work); `app/admin/page.tsx` only gained the link. No leftover temp files.

## Checkpoints
- C1: [x] `bash init.sh` exit 0; harness files present.
- C2: [x] #12 is the only in_progress feature; depends_on 8 and 11 are done (history entries).
- C3: [x] layering, in-action guard before Prisma, no redirect in actions, strings/dateUtils, no secrets.
- C4: [x] 49 new tests with concrete `where/orderBy/skip/take/select` assertions, guard and error paths; Prisma/auth mocked, offline. Weaknesses below are non-blocking.
- C5: [x] no stray files. History entry, status `done` and `current.md` reset are the leader's closure steps after the live check.

## Required changes
None.

## Observations (non-blocking)
1. Weak test: "fmtDateOnly is stable in a UTC+ timezone too" (Pacific/Auckland) would also pass with a local-time formatter (local day is 15 there); only the Lima test discriminates. A UTC-negative zone would be stronger. The `fmtDate` test uses an instant that never crosses Lima midnight (I checked the boundary manually).
2. No test covers the NUL case, and `escapeLike` is never exercised against real Postgres. A `?q=%00` shows the "could not load" alert instead of "no results"; consider stripping `\u0000` in `normalizeSearch`.
3. `page.tsx` calls `requireAdminOrRedirect()` and `listUsers` calls `requireAdmin()` again: two auth+role lookups per request. Acceptable (defence in depth).
4. The `fullName` cell has no word-break class (only email does); a very long unbroken name widens the table inside the scroll container (min-width 860px). Cosmetic.
5. No rendering tests for `UsersTable`/the page (no jsdom/RTL); #22 Playwright should cover.

## Pending live/manual checks
Leader (hosted project, ADMIN session, live DB):
- 27 USER accounts: page 1 has 20 rows, page 2 has 7, the union equals all 27 with no duplicates or gaps; header "Total de usuarios: 27"; "Página 1 de 2" / "Página 2 de 2"; Anterior disabled on page 1, Siguiente disabled on page 2.
- The ADMIN account never appears on any page or in any search and is not counted in the total.
- Search by name substring and by email substring, in upper and lower case, returns the same rows; header shows the matching count with total unchanged; a search narrowing to 20 or fewer shows "Página 1 de 1".
- Literal search: `%`, `_`, `\`, `\%`, `%%`, `100%` match only users whose name/email contain exactly those characters (for example `a_b` must not match `axb`); none errors; `?q=%00` shows the alert, not a 500.
- `page=999` renders the last page; `page=abc`, `0`, `-3`, `2.7` render page 1; a page past the end while searching clamps to the last matching page; pagination links keep `q`.
- A user registered with an invite code shows that code and one without shows a dash; birthday 1990-05-15 shows "15 may. 1990" (not the 14th); createdAt shows the Lima date; a user whose fullName contains `<b>x</b>` or `<script>` renders as literal text.
- profession/ikigai only inside `<details>`; occupation column visible.
- Anonymous session -> 307 /login (also executed here); non-admin USER session -> redirected to /calendar; ADMIN -> 200.
User browser: visual layout, horizontal scroll at narrow width, `<details>` open/close, search submit/clear, clicking the label focuses the input, pagination link clicks, es-PE copy and accents.
