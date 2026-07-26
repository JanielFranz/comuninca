# Implementation Report — Feature #6: login_logout

**Date:** 2026-07-25  
**Status:** Complete (pending reviewer approval)

---

## Files Touched

| File | Action | Description |
|---|---|---|
| `lib/strings.ts` | Modified | Added `login.title`, `login.invalidCredentials`, `login.registerLink`; updated `emailLabel`, `passwordLabel`, `submit` to match spec |
| `lib/actions/auth.ts` | Created | Server Actions: `login(prevState, formData)` and `logout()` |
| `components/LoginScreen.tsx` | Modified | Refactored to dual-mode: Server Action mode (via `loginAction` prop + `useActionState`) AND backward-compat controlled mode for CalendarApp |
| `app/(auth)/login/page.tsx` | Created | Server Component login page passing `login` action to `LoginScreen` |
| `components/CalendarApp.tsx` | Modified | Wired `logout` Server Action in the logout handler |
| `vitest.config.ts` | Created | Vitest config with `@` path alias |
| `tests/unit/login-action.test.ts` | Created | 7 unit tests covering error paths and success redirects |

---

## Decisions

### 1. Login Action Signature
The `login` Server Action uses the `(prevState, formData)` signature required by React 19's `useActionState` hook. This allows the login form to use `<form action={formAction}>` with `useActionState` seamlessly.

### 2. Generic Error Message (US 1.2.4 / AC 2.1.4)
All three failure paths (missing email/password, Supabase auth failure, missing `public.User` row) return the exact same string from `STRINGS.login.invalidCredentials`: `"Correo o contraseña incorrectos."`. The attacker cannot distinguish whether the email exists, the password is wrong, or the account lacks a database record.

### 3. Role-Aware Redirect
- **ADMIN** → `/admin`
- **USER** → `/calendar` (onboarding gate handled by feature #11)
- `redirect()` is explicitly allowed here per the task spec because these actions are called from form submissions/pages, not programmatic code.

### 4. LoginScreen Dual-Mode
`LoginScreen` supports two operational modes:
- **Server Action mode** (when `loginAction` prop is provided): Uses `useActionState` with uncontrolled form inputs (name attributes). Used by the new `app/(auth)/login/page.tsx`.
- **Controlled mode** (backward compat): Uses the original controlled props (`email`, `password`, `onSubmit`, etc.). Still used by `CalendarApp` prototype.

Both modes always call `useActionState` (with a noop fallback) to satisfy React's rules of hooks.

### 5. Logout Wiring
In `CalendarApp.tsx`, the `logout` function now:
1. Closes the profile menu immediately (`patchState({ showProfileMenu: false })`)
2. Calls the `logout` Server Action, which signs out via Supabase and redirects to `/login`

---

## Verification Evidence

### ESLint
```
✖ 2 problems (0 errors, 2 warnings)
```
Both warnings are pre-existing (layout.tsx font warning + CalendarApp unused directive).

### TypeScript
```
[OK] TypeScript typecheck clean
```
Zero type errors.

### Vitest (7/7 passed)
```
tests/unit/login-action.test.ts
  ✓ returns generic error when email is missing
  ✓ returns generic error when password is missing
  ✓ returns generic error when Supabase auth rejects credentials
  ✓ returns generic error when public.User row is missing after auth success
  ✓ redirects ADMIN to /admin
  ✓ redirects USER to /calendar
  ✓ calls signOut and redirects to /login
```

### `bash init.sh`
```
[OK] ESLint clean
[OK] TypeScript typecheck clean
[OK] Vitest suite green
[OK] Environment ready.
```
All checks green.

### Acceptance Criteria Coverage
| AC | Criterion | Covered By |
|---|---|---|
| AC 2.1.1 (US 1.2) | Valid credentials start a session | Tests: "redirects ADMIN to /admin", "redirects USER to /calendar" |
| AC 2.1.2 (US 1.2) | Admin → admin dashboard | Test: mock `findUnique` returns `{ role: "ADMIN" }` → `redirect("/admin")` |
| AC 2.1.3 (US 1.2) | Normal user → calendar | Test: mock `findUnique` returns `{ role: "USER" }` → `redirect("/calendar")` |
| AC 2.1.4 (US 1.2) | Generic error for invalid credentials | 4 test cases all asserting same `"Correo o contraseña incorrectos."` message |
| AC 3.1.1 (US 1.3) | Logout ends session → login | Test: signOut called, redirect("/login") called |
| AC 3.1.2 (US 1.3) | Protected screens redirect after logout | Covered by feature #8 (middleware) — not in scope for #6 |
