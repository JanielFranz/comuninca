# Impl: #10 registration_with_invite_code

## Files
- `lib/actions/auth.ts`: new `register` Server Action + `RegisterResult` (typed union: `CODE_REQUIRED | CODE_INVALID | EMAIL_IN_USE | UNEXPECTED`, plus `INVALID_INPUT` carrying per-field messages), `compensate()` helper.
- `lib/validation/auth.ts`: `registerSchema` (name trimmed 1..100, email, password 8..72, code trimmed 1..64) and `checkRegisterInput` (first message per field), shared client/server. Messages from `STRINGS.register`.
- `lib/inviteCodeInput.ts`: pure `inviteCodeCandidates(raw)`: trimmed uppercased exact input first (so `SEED-0001` works), then the regrouped 26-char Crockford form (spaces/hyphens stripped, I/L -> 1, O -> 0). Imports constants from `lib/inviteCode.ts` (which imports node:crypto), so server-only by usage.
- `components/RegisterScreen.tsx` (client, reuses `LoginScreen.module.css`), `app/(auth)/register/page.tsx`, register link on `components/LoginScreen.tsx`, `.footerLink` style in `LoginScreen.module.css`, `STRINGS.login.registerLink` + `STRINGS.register.*` in `lib/strings.ts`.
- Tests: `tests/unit/register.test.ts` (in-memory fake store), `register-validation.test.ts`, `invite-code-input.test.ts`.

## Decisions
- Order: validate -> blank code returns CODE_REQUIRED before any I/O -> lookup (unknown/USED/EXPIRED all CODE_INVALID) -> email pre-check (case-insensitive, code not consumed) -> atomic claim `updateMany({id, status: UNUSED})`, count != 1 => CODE_INVALID -> admin `createUser` -> one `$transaction` updating `User` (`fullName`, `inviteCodeId`, `role: "USER"` hard-coded; input is re-parsed through the schema so a `role` key is stripped) -> `signInWithPassword` on the cookie-bound client.
- Compensation (a Supabase Auth call cannot join a Prisma transaction): a `finally` runs `compensate()` whenever the link did not complete: deletes the auth user if it was created and reverts the claim (`USED -> UNUSED`, `usedAt: null`). Compensation is best-effort and never masks the returned result. The email-exists path reverts the claim too.
- `createUser` with `email_confirm: true` instead of `signUp`: the project may require email confirmation and its default SMTP is heavily rate-limited, so `signUp` would return no session and could fail; the invite code already vouches for the visitor. `email_exists` / HTTP 422 -> EMAIL_IN_USE, anything else UNEXPECTED.
- Session start failing after the account exists does NOT roll back: returns `{ ok: true, redirectTo: "/login" }` (sign in manually). Success returns `/calendar` (onboarding gate is feature #11). No `redirect()`; client navigates.
- No passwords/tokens/raw error text logged or returned.
- UI shows one message at a time (first invalid field in form order, else the server error mapped per code). Client submit is blocked with the required-code message when the code is blank (AC 1.1.2).

## Verification
- `bash init.sh` exit 0: ESLint clean (1 pre-existing font warning), typecheck clean, Vitest 8 files / 165 tests passed (130 existing + 35 new).
- `pnpm build` passes. Routes: `/`, `/_not-found`, `/admin`, `/admin/codes`, `/calendar`, `/login`, `/register` (static), Proxy (Middleware).
- Dev smoke, no cookies: `/register` 200 (fields `register-name/email/password/code` with autoComplete name/email/new-password/off, link to `/login`), `/login` 200 containing `href="/register"`, `/calendar` 307 -> `http://localhost:3000/login`. Dev server killed (PID 21468); port 3000 confirmed free.
- Greps: no `redirect(` in `lib/actions/auth.ts`; no prisma/supabase references under `components/`; no `console.*` in new files; only the literal brand glyph "C" is hard-coded (same as LoginScreen).
- Existing tracked-file diffs limited to intended changes (strings.ts, LoginScreen.tsx/.module.css also carry earlier features' changes).

## NOT verified by me
- A real registration against the hosted project: account created with role USER, code USED with `usedAt` and linked user, session works on `/calendar`, second attempt with same code rejected, duplicate email rejected without burning the code, missing/invalid code errors, cleanup (leader's live check). Also whether `admin.createUser` triggers the `public.User` row insert before the `$transaction` update runs (relied on per the DB notes).
- The register form in a real browser (no jsdom/RTL; component rendering untested, logic extracted into `checkRegisterInput` / `inviteCodeCandidates`, which are unit-tested).

## Review cycle 1 fixes
- `isEmailTaken` now matches only `code` `email_exists` / `user_already_exists`; other HTTP 422s (e.g. `weak_password`) return UNEXPECTED with the claim reverted. Tests updated/added.
- `compensate`: checks the `{ error }` returned by `deleteUser` (and thrown errors); if the auth user could not be deleted, the claim is NOT reverted (fail closed, code stays USED); result never masked. Tests added for resolved-error and thrown cases.
- Verification: see final `bash init.sh` result below.
- init.sh exit 0, 167 tests passing.
