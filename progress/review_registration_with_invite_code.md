# Review — feature 10 registration_with_invite_code

**Verdict:** APPROVED (cycle 2; live/manual checks pending)

## Cycle 2 re-review (executed evidence)

- `bash init.sh` exit 0; ESLint/typecheck clean; Vitest 8 files / 167 passed (130 original + 37 for #10); `pnpm build` passes and lists `/register`.
- Only `lib/actions/auth.ts` and `tests/unit/register.test.ts` changed since cycle 1 (mtimes 15:52; nothing else newer than the review file).
- Required 1 fixed: `isEmailTaken` (auth.ts:94-97) matches only `email_exists` / `user_already_exists`. Tests: both codes -> `EMAIL_IN_USE` with claim reverted; `422 weak_password` -> `UNEXPECTED` with claim reverted (register.test.ts:180-207).
- Required 2 fixed: `compensate` checks the returned `{error}` and thrown errors; when the auth user cannot be deleted it returns without reverting (claim stays USED, result never masked). Tests: deleteUser throwing and deleteUser resolving `{error}` both assert `UNEXPECTED` and status `USED`. Revert still happens when delete succeeds ("User update failing deletes the auth user, reverts the claim"); email_exists after claim still reverts; the success test asserts `deleteUser` not called.
- C3 and C4 now [x]; the sections below are the cycle-1 record (Required changes 1 and 2 are resolved).

Two small, well-scoped defects in `lib/actions/auth.ts` (both in failure paths that the in-memory test fake is too forgiving about). Everything else holds; once these are fixed (plus tests), this is approvable.

## Executed evidence

- `bash init.sh` -> exit 0. ESLint 0 errors (1 pre-existing font warning in `app/layout.tsx`), typecheck clean, Vitest **8 files / 165 tests passed** (130 pre-existing + 35 new; the pre-existing suites are among the 8 files and all green).
- `pnpm build` passes (Next 16.2.11); route table lists `/register` (static), `/login`, `/calendar`, `/admin`, `/admin/codes`, Proxy.
- Dev smoke without cookies (dev server started and killed; `netstat` shows nothing LISTENING on :3000): `/register` 200; `/login` 200 and contains `href="/register"`; `/calendar` 307 -> `http://localhost:3000/login`; POST to `/register` with `Next-Action: 000...0` and a valid-looking body -> 404 "Server action not found." (did not succeed).
- Import graph (grep): `lib/inviteCodeInput.ts` is imported only by `lib/actions/auth.ts` (server) and its test; `lib/validation/auth.ts` and `components/` never import it or `lib/inviteCode.ts`; build is clean (no node:crypto in a client bundle). `components/` has no prisma/supabase reference. No `any`, no `console.*`, no `redirect(` in the new code. `"use server"` file exports only async functions + types.
- Hygiene: no secret-like strings outside `.env` / lockfile (only test fixtures `postgresql://u:p@localhost`, CI's `test:test@localhost`, doc mentions of `sb_secret_`); no probe/temp files; `git status --short prisma/migrations` empty. `proxy.ts`, `lib/auth.ts`, `prisma/**`, `supabase/**` have mtimes from earlier features (all before this session's edits at 15:48); untouched by #10.

## Acceptance criteria

(US 1.1 AC 1.1.1-1.1.6, US 2.2.7 as covered by `feature_list.json` #10.)

- AC 1.1.1 link from login + form fields (name, email, password, code) -> **met by executed smoke + reading** (`/login` contains `href="/register"`; `/register` 200; `components/RegisterScreen.tsx` has the four labelled inputs with matching `htmlFor`/`id`, `autoComplete` name/email/new-password/off). Browser rendering not executed (no jsdom); see pending.
- AC 1.1.2 blank code blocks submit with the required message -> **met** (client: `checkRegisterInput` in `RegisterScreen.tsx:26-31` blocks before the action; server: `lib/actions/auth.ts:121-128` returns `CODE_REQUIRED`; executed tests `register.test.ts` "blank code ... CODE_REQUIRED without touching anything" and `register-validation.test.ts`).
- AC 1.1.3/1.1.4 valid unused code creates the account, code becomes USED with `usedAt` and is linked, role USER -> **met by executed tests against the fake** (`register.test.ts` success test asserts `updateMany` claim args, `createUser` args, `user.update` data incl. `inviteCodeId` and hard-coded `role:"USER"` even with `role:"ADMIN"` in input; extra keys stripped by `registerSchema.parse`, `auth.ts:131`). **Real DB behaviour needs the leader's live check.**
- AC 1.1.5 used/unknown/expired code and duplicate email rejected -> **met by executed tests** (identical `CODE_INVALID` for unknown/USED/EXPIRED; second registration with same code rejected; pre-check duplicate email does not claim). Live check needed to prove against Postgres/GoTrue (see below).
- AC 1.1.6 session starts, lands on `/calendar` -> **logic met by test** (success `/calendar`, sign-in failure `/login` with account kept); **real session cookie + `/calendar` access unproven** -> live/manual.
- US 2.2.7 (single-use enforcement) -> **met by reasoning + test** of the conditional claim (`auth.ts:159-164`), see concurrency below; real concurrent behaviour depends on Postgres row-level `UPDATE ... WHERE status='UNUSED'` semantics (sound: the second updater re-evaluates the WHERE after the first commits and matches 0 rows).

## Analysis requested

**Concurrency / single use.** Two simultaneous requests with the same code both pass the `findUnique` UNUSED check, then race on `updateMany({id, status:"UNUSED"})`. Postgres serialises the row update; only one gets `count === 1`, the other gets 0 and returns `CODE_INVALID` at `auth.ts:163` before `createAdminClient()`/`createUser` (test line 153 asserts `createUser` not called). Correct. Claim revert (`auth.ts:229-232`) is conditioned on `status:"USED"` and the id, not on this attempt's claim; but because a code can only be claimed by one attempt at a time and reverts only run for the attempt that owns the claim, it cannot un-burn a code owned by a different successful registration (a different attempt can only own it after this attempt's revert). `linked` guards the `finally`, so no revert after success and no double compensation (a single `finally`; early `return`s inside `try` also flow through it, which is intended). `compensate` wraps both steps in try/catch, so nothing thrown there can change the returned result (test 223). Process death between claim and link: code stays USED with no `usedBy` (and possibly an auth user + trigger-created `User` row with empty fullName and no code link). Not self-recoverable; needs manual SQL (no admin "release code" feature exists). Acceptable for this scope given the fail-closed direction (never double-spend a code), but note it.

**Trigger timing.** `on_auth_user_created` is `AFTER INSERT ON auth.users`, same transaction as GoTrue's insert, so the `public.User` row exists when `createUser` returns; if the trigger fails, GoTrue returns an error -> `UNEXPECTED` + claim revert. If the row were missing, real Prisma `update` throws P2025 -> caught -> compensate. The fake's `updateUser` never throws for a missing row (more forgiving), but the code path is safe.

**Email.** Attempt with `ANA@x.com` when `ana@x.com` exists: `findFirst({ email: { equals, mode:"insensitive" } })` matches -> `EMAIL_IN_USE` before the claim, code NOT burned (test line ~170). If a race slips past the pre-check, GoTrue lowercases and returns `email_exists` -> `EMAIL_IN_USE` and the claim is reverted. No orphan. (See Required change 1 for the 422 over-matching.)

**Security.** `role` never from input (schema strips; hard-coded `"USER"`; also the DB trigger defaults USER). No password/token/raw error text returned or logged (`catch {}` without binding; test "never returns the password"). Invalid-code responses are indistinguishable. 130-bit generated codes are not guessable; there is no rate limiting on `register` (guess attempts are unthrottled except by Supabase/host). `redirectTo` is one of two literals: no open redirect. Password bounds 8..72 chars: Supabase's project minimum could be higher than 8 (or require complexity) -> GoTrue `weak_password` (HTTP 422) -> currently mis-mapped (Required 1). Also 72 is counted in UTF-16 units while bcrypt cuts at 72 bytes (observation).

**Normalization.** Exact-trimmed-uppercase candidate first (so `SEED-0001` works); second candidate only when the compacted string is exactly 26 Crockford symbols after I/L->1, O->0; `U` is not in the alphabet, so a code containing U yields no second candidate (correct per Crockford's decode, which rejects it). At most 2 candidates, input capped at 64 chars, parameterised Prisma queries: no injection or absurd queries. A generated code typed with I/L/O would never match anyway since generated codes contain none.

**UI.** Each server error maps to a distinct es-PE message; `isPending` disables the button (no double submit); `role="alert"` on error; no raw error text; success does `router.push` + `router.refresh`. Copy is in `lib/strings.ts` with correct accents. The only hard-coded literal is the brand glyph "C" (same as `LoginScreen`).

## Checkpoints

- C1: [x] harness files present; `bash init.sh` exit 0.
- C2: [x] one feature `in_progress` (#10); dependencies of #10 are done (9 done per init.sh); `progress/current.md` covers the active session (not re-audited beyond init).
- C3: [ ] <- Reason: compensation ignores the `{error}` that supabase-js `deleteUser` returns and reverts the claim regardless (see Required 2), which can leave a live auth account with no code while the code is unburned (invariant "no account without a consumed code" violated). Layering, no `redirect()`, no secrets, pnpm, es-PE copy otherwise OK.
- C4: [ ] <- Reason: the rollback test for a failing `deleteUser` uses `mockRejectedValueOnce` (throw), which is not how supabase-js reports failures (it resolves `{data:null,error}`), so the real failure mode is untested; `HTTP 422` test (line 181) enshrines the over-broad mapping. Otherwise tests assert concrete results, error paths included, Supabase/Prisma mocked, 165 green offline.
- C5: [x] no leftover temp files, no debug logs; dev server stopped; port free.

## Required changes

1. `lib/actions/auth.ts:94-96` `isEmailTaken` treats any HTTP 422 as "email already registered". GoTrue also uses 422 for `weak_password` (Supabase's own password policy, plausible with a project minimum above 8) and other validation failures, so a valid-by-schema password would show "Ya existe una cuenta con ese correo." Match on `error.code === "email_exists"` only (optionally also `"user_already_exists"`); anything else stays `UNEXPECTED` (or add a distinct weak-password message). Update the `HTTP 422` case at `tests/unit/register.test.ts:181` accordingly.
2. `lib/actions/auth.ts:220-236` `compensate`: `auth.admin.deleteUser` returns `{ error }` instead of throwing, and the result is ignored; then the claim is reverted anyway. If the delete fails, an orphan auth user with a known password, `role USER` and no code link exists and the code is unburned (the person, or anyone with the code, can also register again). Check the returned `error`; when the auth user could not be deleted, do NOT revert the claim (leave the code burned: fail closed) and do not throw. Add tests for `deleteUser` resolving `{ error: {...} }` (assert the claim stays USED) in addition to the throw case at line 223.

## Observations (non-blocking)

- Deployment risk for the leader: the seeded `SEED-0001..0010` codes are short, guessable and UNUSED on the hosted database; anyone who finds `/register` can create USER accounts with them, and (since `EMAIL_IN_USE` is returned once a code is valid) enumerate registered emails. Consume/delete them or revoke them before any public exposure.
- No rate limiting on `register` (brute-force of short codes, email enumeration with a valid code).
- Client checks 72 UTF-16 units while bcrypt truncates at 72 bytes; multibyte passwords may exceed 72 bytes.
- Burned-code-with-no-user after a process crash is not self-healing; consider an admin "release" path later.
- The fake `updateMany`/`update` in tests is more forgiving than reality: it does not model P2025 on `update` of a missing row, unique violations on `inviteCodeId`/`email`, or supabase-js's returned-`error` style.
- Browser-only risks the pure tests cannot catch: server-action call from a client component under Next 16, `router.refresh()` picking up cookies set by `signInWithPassword` in the same action, `noValidate` + custom errors, autofill/`autoCapitalize` behaviour.

## Pending live / manual checks

Leader's live check on the hosted project (real registration; clean up afterwards). Must assert:
1. Register with a fresh UNUSED code + new email: `auth.users` row exists (email confirmed), `public."User"` row has `role=USER`, `fullName` set, `inviteCodeId` = the code id; the code has `status=USED`, `usedAt` non-null and `usedBy` = that user.
2. Response `redirectTo:"/calendar"`, session cookie set, `/calendar` loads for that user.
3. Same code again with another email -> `CODE_INVALID`; no new `auth.users` row.
4. New code + already-registered email in a different case -> `EMAIL_IN_USE`, that code still UNUSED, no new auth user.
5. Blank code -> `CODE_REQUIRED`; garbage code -> `CODE_INVALID`.
6. A password that GoTrue's policy might reject (after fix 1: not reported as email-in-use; code stays UNUSED).
7. Cleanup: delete the test auth user (cascades to `User` via trigger) and reset the code to UNUSED / delete generated test codes.

User's manual browser check: `/login` -> "Regístrate" link -> form; blank code shows the required message; each error message renders once at a time; button disabled and spinner while pending; success lands on `/calendar`; "Inicia sesión" link returns to `/login`.
