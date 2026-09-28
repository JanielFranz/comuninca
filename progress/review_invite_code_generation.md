# Review — feature 9 invite_code_generation

**Verdict:** APPROVED (live DB check and manual browser check recorded as pending below)

## Executed evidence
- `bash init.sh` exit 0: ESLint 0 errors (1 pre-existing font warning, app/layout.tsx:26), tsc clean, Vitest 5 files, **130 passed** (90 original + 40 new; original suites still green).
- `pnpm build` passes with no warnings; route table lists `ƒ /admin/codes` (plus `/admin`, `/calendar`, `/login`, `/`).
- Throwaway probe (deleted): 200,000 codes from the real `crypto` path, 200,000 unique, 0 format violations against `^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}-[0-9A-HJKMNP-TV-Z]$`, worst per-position/per-symbol deviation from uniform 3.9% (cell expectation 6250, about 3 sigma of the expected max; no bias).
- Dev smoke without cookies: `/admin/codes` 307 -> /login, `/admin` 307 -> /login, `/login` 200, POST with `Next-Action` header to `/admin/codes` 307 -> /login (proxy redirects, action not executed). Dev server killed; `netstat` shows port 3000 free.
- Greps: no `Math.random` anywhere outside node_modules/.next; no `console.*` or `any` in the feature files; no secret-like strings (only CI dummy `test:test@localhost` URLs and a `.env.example` comment); `prisma/migrations` untouched; `feature_list.json` #9 still `in_progress`; no probes or temp files left.

## Acceptance criteria
- AC 2.2.1/2.2.2 (modal step 1, quantity 1..50 integer, invalid disables confirm with hint) -> met for logic (lib/validation/invites.ts:26-37; tests/unit/invite-codes.test.ts quantity table: "", "   ", abc, 1e2, 1.5, 0, -3, 51, 1000 give exact hints; 1, " 7 ", 50, "05" valid). `canSubmit = check.valid && !pending` (GenerateCodesModal.tsx:32) disables the button; the guard at :68 also blocks Enter. Real rendering is **pending manual check**.
- AC 2.2.3 (exactly N unique persisted codes, UNUSED + createdAt, admin only) -> met against mocks: N=37 returns 37 unique format-valid codes, createdAt ISO string, insert rows contain only `code` (DB defaults give UNUSED/createdAt per schema.prisma:43-50); boundaries 1 and 50; wrong row count returns UNEXPECTED. Persistence to the hosted DB is **pending leader live check**.
- AC 2.2.4 (copy all, one click, confirmation) -> logic met: `joinCodes` newline-joined and a single `writeText` per click (GenerateCodesModal.tsx:173-175; tests "joins codes one per line", `copyToClipboard`). Clipboard and toast in a real browser **pending manual check**.
- AC 2.2.5 (per-row copy) -> logic met (`handleCopy(c.code, ...)`, :150); manual check pending.
- AC 2.2.6-2.2.8 / closing and reset -> met by reading: `closeModal` resets raw/error/codes/pending; `openModal` resets again; manual check pending.
- US 4.1.4 (>= 128-bit, CSPRNG) -> met: 26 x 5 = 130 bits (test asserts 130); `crypto.randomBytes` is the only default (lib/inviteCode.ts:10); `byte & 31` on a 32-symbol alphabet is unbiased (256 % 32 == 0); hyphen grouping is 5-5-5-5-5-1. The injectable `random` is an optional parameter of a server-only helper; the action never passes it and nothing from user input reaches it.

## Boundaries and security analysis
- Import boundary: only `lib/actions/invites.ts` (server) imports `lib/inviteCode`, `lib/db`, `lib/auth`. The client modal imports the action (allowed), `lib/validation/invites.ts` (zod + strings only) and `generateCodesModel.ts` (strings and a type-only import from the action). No `@prisma`, `server-only`, `lib/auth` or `lib/db` reachable from client code; build clean. `lib/actions/invites.ts` exports only an async function plus types, OK for `"use server"`.
- Guard ordering: `requireAdmin()` is the first awaited call (actions/invites.ts:29) and returns before Zod and Prisma; tests "UNAUTHENTICATED ... even with bad input" (count 999) and FORBIDDEN (count 5 and 0) assert `createManyAndReturn` not called.
- Validation: `z.number().int().min(1).max(50)` rejects "5", 5.5, NaN, Infinity, -0 (fails min), huge numbers, null, missing key, non-objects; `z.object` strips extra keys so nothing extra is inserted. Tests cover 0, 51, -1, 1.5, NaN, undefined, "5", {} (null/Infinity/-0/extra keys untested but correct by zod semantics).
- Atomicity and retry: one `createManyAndReturn` is a single `INSERT ... RETURNING`, all-or-nothing in Postgres, so a failed attempt (unique violation aborts the statement) leaves no rows; a retry regenerates a fresh set, so it cannot duplicate or orphan earlier rows. Retry is bounded (`attempt < 3`), only on `P2002`; other errors return UNEXPECTED immediately (test asserts 1 call). A wrong row count returns UNEXPECTED (no partial set). Results are typed enums with no error text (test asserts a "secret" message never appears); nothing is logged; `createdAt.toISOString()`.
- P2002 with Prisma 7.9.0 + @prisma/adapter-pg 7.9.0: the adapter maps pg SQLSTATE `23505` to `kind: "UniqueConstraintViolation"` (adapter-pg dist/index.js:472-475) and the client runtime maps that kind to `P2002` (client.js), surfaced as `PrismaClientKnownRequestError` with `.code === "P2002"`. `isUniqueViolation` (actions/invites.ts:20-26) matches that shape. `createManyAndReturn` exists in the 7.9 runtime and is supported for PostgreSQL. Confirmation against a real violation remains for the leader's live probe.
- Copy/layering: all UI copy comes from `STRINGS.admin.codes` (es-PE, accents correct); no literal JSX text, `aria-label` or `placeholder`; CSS Modules co-located; no Prisma/Supabase import under `components/`; `app/admin/codes/page.tsx` uses `requireAdminOrRedirect()`; `app/admin/page.tsx` has just the one added `Link`; `components/Modal.tsx` unchanged; `prisma/`, `supabase/`, `proxy.ts` show nothing new from this feature (untracked entries there belong to earlier features). The `lib/strings.ts` diff also changes login strings, which belongs to feature #7.
- Modal by reading: label/input associated (`htmlFor`/`id`), hint via `aria-describedby`, `role="alert"` error box showing only mapped es-PE text; keys `c.code` unique; clipboard missing/rejecting gives `copyFailed`, never a false success; toast timer cleared on unmount and reset on each new toast; double-submit blocked by the `pending` guard and disabled button.

## Checkpoints
- C1: [x] harness files present, `bash init.sh` exit 0
- C2: [x] only #9 is in_progress (dependencies 7, 8 done); progress/current.md describes the active session
- C3: [x] layering holds, admin check inside the action, no redirect in the action, copy in strings.ts, no secrets or console
- C4: [x] 40 new tests assert concrete values with error paths; Prisma and `@/lib/auth` mocked; offline. Live and browser evidence explicitly pending (below)
- C5: [x] no leftover temp files, dev server stopped, port free, implementer report present

## Required changes
None.

## Pending (recorded, not blocking this verdict)
Leader live check against the hosted DB as a real admin, asserting:
1. `generateInviteCodes({count: N})` (e.g. 3, then 50) returns `ok:true` with exactly N codes in the right format, all distinct, and N persisted rows with `status = UNUSED`, non-null `createdAt`, `usedAt` null.
2. A USER-role session gets `FORBIDDEN` with zero rows created; no session gets `UNAUTHENTICATED`.
3. count 0, 51, 5.5 give `INVALID_INPUT` and create zero rows.
4. A real unique violation (insert an existing code) surfaces with `code === "P2002"` through the pg adapter and leaves no rows from the failed statement; then clean up all test rows.

User manual browser check (no jsdom/RTL exists): open /admin/codes and click "Generar código de invitación"; input autofocuses; confirm disabled for empty/0/-1/1.5/abc/51 with the right hint and the neutral hint when empty; Enter submits only when valid; step 2 shows exactly N codes; "Copiar todos" puts N newline-separated codes on the clipboard and shows the toast; each "Copiar" copies exactly one code and shows the toast; clipboard failure (e.g. non-secure origin) shows the failure toast; toast is visible above the modal (z-index 200 vs 100) and disappears after about 2.6 s; X, backdrop and Cerrar all close and reopening starts at step 1; layout at phone width.

## Observations (non-blocking)
1. Stale response race (GenerateCodesModal.tsx:66-84): closing during a pending request sets `pending=false`, and the late response still calls `setCodes` while closed; if the admin reopens before it lands, step 2 appears unexpectedly, and codes linger in state until the next `openModal`. Codes are already persisted, so no data loss; a request-id ref would fix it.
2. Closing while pending is allowed, so the admin may lose sight of freshly generated codes until list view #13 exists.
3. Test weaknesses: no test for null/Infinity/-0/extra-key input; real-crypto tests check only format, uniqueness and symbol coverage (my probe covered distribution); nothing asserts that a retry after P2002 regenerates different codes; modal disable/close/toast behavior has no automated coverage (pure helpers only).
4. `checkQuantityInput` accepts "+5" and "5.0" as 5; harmless and consistent with the server.
