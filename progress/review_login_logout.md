# Review — feature 6 login_logout

**Verdict:** APPROVED (implementation). The live end-to-end check against hosted Supabase is recorded as PENDING for the leader; `done` must not be set until it passes.

## Executed evidence (this review)

- `bash init.sh`: exit 0. ESLint 0 errors (1 pre-existing warning `app/layout.tsx:26`), tsc clean, Vitest 3 files / 49 tests passed (includes `tests/unit/seed.test.ts`).
- `pnpm build`: passes; routes `ƒ /`, `ƒ /admin`, `ƒ /calendar`, `○ /login`, `○ /_not-found`.
- Dev smoke, no cookies (Git Bash mangled the `/` argument in the echo label only, results are correct): `GET /login` 200, 1 `<form>`, 1 `type="email"`, label "CORREO", 0 matches for the demo tip; `/`, `/calendar`, `/admin` all 307 to `http://localhost:3000/login`. Dev server killed; port 3000 has 0 connections and curl returns 000.
- `git status --short prisma/migrations` is empty. No `middleware.ts`, `lib/auth.ts`, `requireUser`, `requireAdmin` exist (feature #8 not pre-empted).
- Greps: no `@/lib/db`, `@supabase`, `@prisma`, `lib/supabase` import under `components/` or `app/`; no `redirect(`/`notFound(` under `lib/`; no `getSession` call anywhere (only a doc-comment mention `lib/currentUser.ts:16`); no `any`; no `console.*` in the feature files (the only hits are `prisma/seed.ts:39,48`, the seed feature's CLI output, not this feature); no JWT/key-like strings in tracked or untracked files (test password `"s3cret-pass"` is an obvious fake); `.env` is gitignored.

## Security review of `lib/actions/auth.ts`

- (a) Identical generic result: PASS. Every 4xx except 429 returns the literal `{ ok: false, error: "INVALID_CREDENTIALS" }` (lines 24-26, 43-45), so wrong password, unknown user and unconfirmed email (400 `email_not_confirmed`) are indistinguishable. The result has no extra fields and no error text/code passed through. There is no code path that differs for "user exists" before Supabase answers: Zod failure short-circuits on input shape only (fine), and the Prisma lookup happens only after a successful auth. Test `auth-actions.test.ts:57-74` deep-equals wrong-password vs unknown-user results and asserts `findUnique` not called. No dedicated unconfirmed-email test, but it is the same status class (non-blocking).
- (b) 429, 5xx, undefined status, thrown error map to `UNEXPECTED` (line 25 excludes 429; `catch` line 65). Supabase message text never leaves the action. Tested for 500/429/undefined (`:88-98`) and thrown (`:82-85`).
- (c) `redirectTo` is typed and constructed as one of two literals from the DB role (line 63); the client only does `router.push(result.redirectTo)`; no client-supplied target exists. PASS.
- (d) No `getSession` use; `lib/currentUser.ts:21` uses `auth.getUser()`; the three pages go through it.
- (e) No logging; the `catch` swallows the error object deliberately; nothing but the typed result is returned.
- (f) `"use server"` file exports only two async functions plus types. PASS (build confirms).
- (g) The only role lookup is `findUnique({ where: { id: data.user.id } })` with the id from the just-authenticated Supabase response (line 50-53); no caller-supplied id. PASS. Asserted in test `:26-40`.
- (h) Missing `public.User` row: `signOut()` then `UNEXPECTED` (lines 55-59). Tested (`:100-110`). One nit: if this `signOut` itself throws, the outer `catch` still returns `UNEXPECTED`, which is fine.

## Layering, copy, conventions

- Components import only `lib/actions/auth` (Server Actions), `lib/strings`, `lib/userDisplay`; Prisma/Supabase only in `lib/db.ts`, `lib/supabase/server.ts`, `lib/currentUser.ts` (`server-only`, `lib/currentUser.ts:1`). Names `getCurrentUser`/`CurrentAppUser` do not shadow feature #8's `requireUser`/`requireAdmin`.
- New copy is in `lib/strings.ts:18-21,71-74,75` (es-PE, accents correct: "Inténtalo", "contraseña", "administración", "Sesión"). No hard-coded UI strings in the new pages/components. CSS Modules are co-located (`LogoutButton.module.css`, `app/admin/page.module.css`); dead `.demoTip` removed.
- `git diff --ignore-cr-at-eol components/CalendarApp.tsx` contains only the intended changes: fake login state/handlers/`LoginScreen` render removed, `user` prop + `currentUser` derived (id kept `"me"` with an explanatory comment), `logout` now `signOut` then push/refresh, the calendar block de-indented (only because the `screen === "calendar"` wrapper was removed, same JSX), and one now-unneeded eslint-disable removed (lint is clean). No unrelated reformatting. `--stat` for the other touched files is proportionate. `lib/supabase/{client,middleware,server}.ts` diffs (ANON_KEY to PUBLISHABLE_KEY) are pre-existing, not from this feature.
- `vitest.config.ts` is minimal (only the `@` alias). `.opencode` docs edits and `.github/workflows/ci.yml` etc. are prior-session changes, out of scope here.

## Client wiring

- `LoginScreen`: `useTransition` sets `isPending`, which disables the button and shows the spinner plus `signingIn` text; the client empty-field check gives `missingFieldsError`; `INVALID_CREDENTIALS` gives the one generic string; `INVALID_INPUT` gives `missingFieldsError`; anything else gives `unexpectedError`; success does `router.push(redirectTo)` then `router.refresh()`. Error has `role="alert"`. `noValidate` is used so es-PE messages appear rather than browser ones.
- `LogoutButton` and `CalendarApp.logout`: `signOut()` then `/login` + refresh, even when `signOut` returns `ok: false`. Acceptable: the spec defines no error UI, and if the cookie survived, `/login` remains reachable and the next protected page re-validates via `getUser()`. Logging out has no safe "stay" alternative, so navigating is a reasonable choice (see observation 2).
- Pages: `/calendar` and `/admin` redirect to `/login` with no user; `/admin` redirects a USER to `/calendar`; `/` redirects by role.

## Acceptance criteria

1. "Valid credentials start a session; an admin lands on /admin and a normal user on /calendar" -> met offline for the logic, LIVE CHECK PENDING. Proven by executed tests: ADMIN gives `/admin`, USER gives `/calendar`, id passed to the role lookup, email trim, `INVALID_INPUT` without calling Supabase; plus the smoke test that unauthenticated `/`, `/calendar`, `/admin` go to `/login`. NOT provable offline: that a real session cookie is set and persisted, that the real `public.User` row returns the right role, that `getUser()` pages render with a real session, that `router.push` + `refresh` land correctly in a browser.
2. "Invalid credentials show one generic error message" -> met at action level (deep equality test, 429/5xx separated), LIVE CHECK PENDING for the rendered string. Proven: action result identical for wrong password/unknown user; component maps it to a single string. NOT proven: real Supabase status/code for bad password and unknown email (that they really are 400 and not a status that maps to `UNEXPECTED`), and the rendered text in a browser.
3. "Cerrar sesión ends the session and returns to /login" -> action tests cover ok/error/throw; navigation code read; LIVE CHECK PENDING. NOT proven: the cookie is actually cleared and `/calendar` then redirects.

## Live check the leader must run (real hosted Supabase, seeded accounts)

1. Admin login (`SEED_ADMIN_EMAIL`): assert URL `/admin`, page shows the title, the admin's email and "Cerrar sesión". Reload: still signed in (cookie persisted). Visit `/` gives `/admin`; visit `/calendar` is allowed (no guard yet) or acceptable per #8.
2. Click "Cerrar sesión": assert URL `/login`; then `/admin`, `/calendar` and `/` all redirect to `/login` (session cookie cleared, checked by a fresh request).
3. Login as `ava@seed.comuninca.test`: assert `/calendar`, header initials and profile menu show the real name/email from `public.User`; `/admin` redirects to `/calendar`. Profile menu "Cerrar sesión" gives `/login`, then `/calendar` redirects to `/login`.
4. Wrong password for ava AND an unknown email: both must show exactly "Correo o contraseña incorrectos." (this also confirms Supabase returns 4xx, not 5xx, for both). Empty fields give "Ingresa tu correo y tu contraseña para continuar." No "unexpected" message may appear in these cases.
5. Confirm the button shows the pending state during submit and the demo tip is not on `/login`.

## Checkpoints

- C1: [x] All harness/rules/spec/agent files present; `bash init.sh` exits 0.
- C2: [x] Only #6 is `in_progress`; deps #3 and #7 are `done`; `progress/current.md` describes the active session. (Status must stay `in_progress` until the live check passes.)
- C3: [x] Layering holds, no `redirect()` in actions, generic login error, no secrets logged/client-referenced, copy in `lib/strings.ts`, pnpm lockfile committed. Note on the "auth enforced inside every Server Action" box: `signIn`/`signOut` are the pre-auth actions and correctly have no `requireUser` (which is feature #8); nothing that mutates data is added.
- C4: [x] 21 new tests, concrete assertions (deep equality, `not.toHaveBeenCalled`, exact `findUnique` args) with error paths; Supabase and Prisma fully mocked; suite passes offline with no `.env`; `pnpm test` 49 green, lint/tsc clean.
- C5: [x] No stray temp files or build output; `prisma/migrations` untouched. Closure items (`history.md` entry, moving `current.md`, `status: "done"`) are intentionally the leader's step after the live check passes, so they are not counted against the implementation.

## Required changes

None.

## Observations (non-blocking)

1. Add a test case for an unconfirmed-email 400 (`email_not_confirmed`) to lock the generic mapping explicitly; today it is covered only through the status-class logic.
2. If `signOut` fails, the user is navigated to `/login` while a session cookie might survive; feature #8's middleware should make `/login` bounce a signed-in user to their landing page (or the login page should tolerate it). Worth noting when #8 is planned.
3. There is no rate limiting or lockout of our own on `signIn`; it relies on Supabase's 429, which correctly surfaces as `unexpectedError` (a more specific "too many attempts" message is possible later).
4. `app/admin/page.tsx` and `app/calendar/page.tsx` gate only at page level, as decided; `/calendar` is not restricted for admins (an admin may view it). Intended for now, revisit in #8/#12.
5. `CalendarApp` still uses `id: "me"` for the current user (decided, to be replaced in #14); events and attendees remain seed data.
6. `lib/supabase/*` show unrelated ANON to PUBLISHABLE key renames in the working tree that belong to an earlier feature; make sure they are committed with the right scope.
