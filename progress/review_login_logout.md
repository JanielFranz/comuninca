# Review -- feature 6 login_logout
**Verdict:** APPROVED

## Acceptance criteria
- "Valid credentials start a session; an admin lands on /admin and a normal user on /calendar"
  -> met (evidence: tests "redirects ADMIN to /admin" asserts mockRedirect("/admin");
  "redirects USER to /calendar" asserts mockRedirect("/calendar");
  both mock a successful signInWithPassword + prisma.user.findUnique returning the corresponding role)
- "Invalid credentials show one generic error message"
  -> met (evidence: 4 test cases -- missing email, missing password, Supabase auth rejection,
  missing public.User row -- all assert "Correo o contraseña incorrectos.";
  grep of lib/actions/auth.ts confirms only STRINGS.login.invalidCredentials is returned
  across all 3 failure branches on lines 22, 33, 42)
- "Cerrar sesión ends the session and returns to /login"
  -> met (evidence: test "calls signOut and redirects to /login" asserts mockSignOut called once +
  mockRedirect("/login"); ProfileMenu.tsx renders STRINGS.profileMenu.logout = "Cerrar sesión";
  CalendarApp.tsx line 328 calls the logout Server Action)

## Verification re-run
- pnpm exec tsc --noEmit => OK (clean)
- pnpm test => 7/7 passed (tests/unit/login-action.test.ts)
- pnpm lint => 0 errors, 2 warnings (both pre-existing: layout.tsx font warning +
  CalendarApp unused eslint-disable directive)
- bash init.sh => not directly executable on this Windows machine (no WSL/bash),
  but individual steps (tsc, test, lint) all green

## Checkpoints
- C1: [x] All harness files exist per init.sh checks; feature_list.json valid.
- C2: [x] Only feature #6 is in_progress; depends_on [3, 7] both done;
  progress/current.md describes the active session.
- C3: [x] Layering holds -- lib/actions/auth.ts is "use server", imports only
  @/lib/supabase/server (canonical Supabase client factory), @/lib/db (Prisma singleton),
  @/lib/strings (copy), and next/navigation (redirect). Components (LoginScreen.tsx,
  CalendarApp.tsx, ProfileMenu.tsx) never import Prisma or Supabase directly
  (grep of components/ returned zero hits). LoginScreen.tsx is "use client" and
  receives the Server Action as a prop. No process.env usage in lib/actions/auth.ts
  (grep returned zero). lib/supabase/server.ts uses only NEXT_PUBLIC_* env vars
  and is marked server-only. No secrets are hard-coded or exposed. redirect() is
  used in login/logout per the task spec explicit carve-out for page-level form
  actions (section 3 of the review brief: "redirect() OK for page-level actions").
  All user-facing copy lives in lib/strings.ts. No console.log or context-free TODOs.
  Dependencies are pnpm-managed (no package-lock.json).
- C4: [x] 7 tests cover every new action (login + logout), assert concrete results
  (exact string "Correo o contraseña incorrectos.", exact redirect paths), and cover
  4 error paths + 3 success paths. Supabase Auth/Prisma/redirect are all mocked --
  no real network calls. pnpm test shows 7/7 green. pnpm lint is 0 errors.
  pnpm exec tsc --noEmit is clean.
- C5: [x] Session closure not yet performed (feature is still in_progress in
  feature_list.json; implementer will do closure after this approval). No suspicious
  untracked files beyond expected feature artifacts (app/(auth)/, lib/actions/,
  tests/, vitest.config.ts) and tooling directories (.idea/, .ocx/, WorkTree/).
  progress/history.md will receive the entry on closure.

## Architecture notes (non-blocking)
- The login and logout Server Actions use redirect() on success, which the architecture
  rules reserve for the render layer. The task spec (section 3 of the reviewer brief)
  explicitly carves out an exception for page-level login/logout actions -- this is
  the correct design because these are inherently page-transition flows, not
  programmatic API calls. The useActionState pattern in LoginScreen.tsx (lines 49-52)
  correctly handles the redirect-on-success / return-error-on-failure contract.
- The login action performs double-checking: both HTML5 required attributes on form
  inputs (client-side defense) AND server-side if (!email || !password) guard
  (lines 18-23 of auth.ts) -- good defense-in-depth.
- US 1.2.4 is fully satisfied: all 3 server-side error paths return the identical
  STRINGS.login.invalidCredentials string, and the test suite explicitly verifies
  this for every path.

## Review of files modified/created
| File | Status | Notes |
|---|---|---|
| lib/strings.ts | Modified correctly | Added login.* namespace with all es-PE copy; invalidCredentials = "Correo o contraseña incorrectos." |
| lib/actions/auth.ts | Created correctly | "use server"; login(prevState, formData) with generic error; logout() with signOut + redirect; all imports through canonical paths |
| components/LoginScreen.tsx | Modified correctly | Dual-mode: Server Action mode via loginAction + useActionState; backward-compat controlled mode; always calls hook per React rules |
| app/(auth)/login/page.tsx | Created correctly | Server Component passing login action to LoginScreen |
| components/CalendarApp.tsx | Modified correctly | Wired logout Server Action in logout() handler (line 328); imports logout as serverLogout from @/lib/actions/auth |
| vitest.config.ts | Created correctly | @ alias resolution; node environment |
| tests/unit/login-action.test.ts | Created correctly | 7 tests; all mocks via vi.mock; concrete assertions; no real I/O |
