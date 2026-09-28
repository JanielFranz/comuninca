# Review — feature 13 admin_codes_list

**Verdict:** APPROVED (live/manual items pending, listed at the end)

## Executed evidence (by me)
- `bash init.sh` exit 0: ESLint 0 errors (2 pre-existing warnings), typecheck clean, Vitest 11 files / **310 passed** (266 existing, including all `admin-users` tests after the `computePageCount(matching, pageSize = USERS_PAGE_SIZE)` change, `lib/usersQuery.ts:57-62`, + 44 new).
- `pnpm build` passes; `/admin/codes` is dynamic (`ƒ`).
- Own dev server on port 3100, no cookies: `/admin/codes`, `/admin/codes?status=USED&page=2`, `/admin/codes?status=bogus` all 307 -> `/login`. Stopped by PID (15664); port 3100 free; port 3000 untouched. Log/pid temp files removed.
- Hygiene greps: no `redirect(`, `console.`, `any` in `lib/actions/invites.ts`, `lib/codesQuery.ts`, `components/admin/{CodesTable,RevokeCodeButton,generateCodesModel}`; no `prisma`/`supabase` reference anywhere under `components/`. `git status --short prisma/migrations` empty. `proxy.ts`, `lib/auth.ts`, `lib/actions/auth.ts`, `lib/actions/admin.ts`, `prisma/**`, `supabase/**` have mtimes earlier than this feature's files (untracked, so no diff possible; mtimes are the evidence). No probe files.

## Acceptance criteria
- AC 2.3.1 "USED code shows consumer name + email and the usage date" -> met by code/unit (evidence: `lib/actions/invites.ts:103-116` select with `usedBy{fullName,email}` + `usedAt`, mapping test with exact output; `CodesTable.tsx:28-40` renders name, email, `t.usedOn(fmtDate(row.usedAt))` via `lib/dateUtils.ts`). Rendering with real rows = live check.
- AC 2.3.2 "UNUSED code shows 'Sin usar'" -> met by code (`CodesTable.tsx:11,25`, `strings.ts` `statusUnused`/`usageUnused` = "Sin usar"). No render test exists (no component test harness); rendering = live/browser check.
- AC 2.3.3 "revoked code is distinct / cannot be used" -> met in logic (executed unit tests: revoke sets UNUSED -> EXPIRED with one conditional `updateMany`; claim after revoke is rejected in the fake store; `register` treats non-UNUSED as `CODE_INVALID`, `auth.ts:148,164`). Distinctness not by colour alone: badge text "Revocado" + muted struck-through code + text "Revocado: ya no se puede usar" (`CodesTable.tsx:25-27,58-63`). Visual result = browser check.
- US 2.2.7 / US 1.1.3 (revoked/USED code cannot register) -> met via unchanged `register` guards; live confirmation pending.

## Race and state-machine analysis (item 2)
All three writers are conditional single-statement UPDATEs: revoke `WHERE id AND status='UNUSED'` -> EXPIRED (`invites.ts:168`); claim `WHERE id AND status='UNUSED'` -> USED (`auth.ts:160`); compensation `WHERE id AND status='USED'` -> UNUSED (`auth.ts:236`).
- Revoke vs claim on one UNUSED row, READ COMMITTED: the second UPDATE blocks on the row lock, then re-evaluates its WHERE against the committed row (EvalPlanQual); status is no longer UNUSED so it affects 0 rows. Exactly one wins; both cannot succeed. EXPIRED-but-linked is impossible: the link (`inviteCodeId`) is only written after a successful claim, which requires UNUSED, and revoke needs UNUSED. USED-and-revoked is impossible: revoke never touches USED and no path sets EXPIRED from USED.
- Revoke wins after `register` passed its `findUnique` but before the claim: claim gets count 0 -> `CODE_INVALID` (`auth.ts:164`) returned before `claimedId` is set, before any auth user is created; `finally` runs `compensate(null, null)` which does nothing. Nothing created.
- Compensation vs revoke: the revert's `where` is `{ id, status: "USED" }`. While the code is USED (claimed), revoke gets count 0 -> `NOT_REVOKABLE`, so revoke cannot interleave inside a claim/compensate window. After a revert the code is UNUSED and an admin revoke is then legitimate. The revert can never flip an EXPIRED code to UNUSED (EXPIRED never matches `status: "USED"`), so **a revocation cannot be clobbered**. Conclusion: no defect. Only cosmetic case: an admin looking at a stale list may see USED for a code that was reverted to UNUSED; harmless.
- Follow-up `findUnique` on count 0 is read-only (`select: {id}`), cannot change state.

## Details (item 3, 4)
- `revokeInviteCode`: guard first (`:158`), Zod `id` string 1..100 (`validation/invites.ts:41-43`), so number/object/array/empty/5000-char -> `INVALID_INPUT` (tests cover `5`, `{ $ne }`, `["a"]`, `""`, 101 chars; 5000 is the same branch). catch -> `UNEXPECTED` with no text. Returns only a code, no row data.
- `listInviteCodes`: guard first; `parseCodeStatus` exact-match whitelist (arrays, lowercase, trailing space, non-strings -> all); `parsePage` regex `^\d+$` and clamp; exact `select`; ISO dates; empty table page 1 of 1. Hrefs built with `URLSearchParams` from a whitelisted status and numeric page (`codesQuery.ts:19-27`), so no injection/encoding issue; filter links reset to page 1, pagination keeps status. React-escaped text only, no `dangerouslySetInnerHTML`.
- `RevokeCodeButton`: two-step confirm (first click only opens the prompt; destructive button only appears after), buttons `disabled={pending}` (no double submit), errors in `role="alert"` mapped per code, `router.refresh()` also on action failure; on a thrown error (catch) no refresh, only message (acceptable). All copy in `lib/strings.ts` with accents; no hard-coded literals.
- `GenerateCodesModal`: `router.refresh()` re-renders the server tree only; the client component keeps its state, so the modal stays open showing step 2 codes. It adds no new race: if the modal is closed while pending, the existing behaviour (#9 observation: late `setCodes` on a closed modal, reset on next `openModal`) is unchanged; the extra refresh is idempotent and harmless.

## Checkpoints
- C1: [x] init.sh green, 310 tests, build passes.
- C2: [x] layering holds (no Prisma/Supabase in components, actions do auth first, no `redirect` in actions, `"use server"` file exports only async functions and types, pure helpers in `lib/codesQuery.ts`).
- C3: [x] TS strict, no `any`, Zod at the boundary, typed results, CSS Modules co-located, es-PE copy in `strings.ts`, dates via `dateUtils`.
- C4: [x] tests assert exact where/data/select, `update`/`delete` not called, guard-before-Prisma, error paths (see Observations for weaknesses).
- C5: [x] repo clean of probes/debug; no secrets; status left `in_progress` as required until live check.

## Required changes
None.

## Observations (non-blocking)
1. Race test (`tests/unit/admin-codes-list.test.ts`, "revoke vs registration race") uses a local `claim()` that copies `register`'s `updateMany` call rather than invoking `register`, and `Promise.all` on an in-memory fake is effectively sequential. It models the conditional-update semantics correctly (not a tautology) but does not prove the true Postgres race nor that `register` keeps that exact `where`; a change in `register` would not fail it. The live check covers the real thing.
2. Every row's revoke button has the same accessible name "Revocar" (and confirm "Sí, revocar"); a screen-reader user cannot tell which code. Consider a per-row label containing the code via `lib/strings.ts`.
3. The confirm prompt is not a live region and focus is not moved to it; minor a11y polish.
4. `RevokeCodeButton` `catch` path does not `router.refresh()` (only failure result path does). Fine.
5. No component render tests exist for `CodesTable`/page; AC 2.3.1-2.3.3 rendering is verified only by reading.
6. `listInviteCodes` runs `count` and `findMany` as two queries (small skew possible under concurrent inserts); clamping covers it.

## Pending live/manual checks (leader / user browser)
With the hosted DB and a real admin session:
1. `/admin/codes` renders real UNUSED ("Sin usar"), USED (consumer full name, email, "Usado el <es-PE date, America/Lima>") and EXPIRED ("Revocado" badge, struck-through code, "Revocado: ya no se puede usar") rows; revoke button only on UNUSED rows.
2. Revoke on UNUSED: confirm step required, row flips to EXPIRED after refresh; register with that code returns the `CODE_INVALID` message and creates no user/auth row; code stays EXPIRED.
3. Revoke on a USED code (e.g. from a stale tab) -> "ya fue usado o revocado" message, DB row unchanged (USED, `usedAt`, user link intact); same for an already-revoked code. Missing id via action -> `NOT_FOUND`.
4. Anon and USER cannot reach the page (redirect `/login` / `/calendar`) or call the actions (`UNAUTHENTICATED`/`FORBIDDEN`, no DB effect).
5. Race: revoke and register submitted together on one UNUSED code, exactly one winner; final state is USED+linked or EXPIRED+unlinked, never mixed.
6. Pagination (25/page) and status filter with real data: filter links reset page, prev/next keep status, `?status=bogus` shows all, out-of-range page clamps.
7. Generate codes with the modal open: list refreshes underneath while the modal keeps showing the new codes.
