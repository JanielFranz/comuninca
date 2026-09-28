# Implementation report: #6 login_logout

Status: implemented, awaiting reviewer. NOT marked done.

## Files touched
New:
- `lib/actions/auth.ts` (`signIn`, `signOut` Server Actions)
- `lib/currentUser.ts` (server-only read helper `getCurrentUser()`; NOT a guard. Feature #8 should build `requireUser`/`requireAdmin` on top of it.)
- `lib/userDisplay.ts` (pure `displayName`, `initialsFor`)
- `app/(auth)/login/page.tsx`, `app/calendar/page.tsx`, `app/admin/page.tsx` + `app/admin/page.module.css`
- `components/LogoutButton.tsx` + `.module.css`
- `vitest.config.ts` (only adds the `@` alias so tests can mock `@/lib/db` etc. Smaller than rewriting imports; tsc and next build unaffected.)
- `tests/unit/auth-actions.test.ts`, `tests/unit/userDisplay.test.ts`
Modified:
- `components/LoginScreen.tsx` (now client component owning form state, `useTransition` + `signIn`, `router.push` + `router.refresh`; email `type="email"`, `noValidate` so es-PE messages show; autoComplete attrs; `role="alert"` on error)
- `components/LoginScreen.module.css` (dead `.demoTip` removed)
- `components/CalendarApp.tsx` (fake login state and `LoginScreen` render removed; takes `user` prop; `currentUser.id` kept as `"me"` because `lib/selectors.ts` and event handlers compare against `"me"`; logout = `signOut` then `/login` + refresh; removed one now-unused eslint-disable)
- `app/page.tsx` (redirects by session/role)
- `lib/strings.ts` (emailLabel "CORREO", removed `demoTip`, added `invalidCredentialsError`, `unexpectedError`, `admin.*`, `fallbackUserName`)
- `lib/types.ts` (removed now-unused `Screen` type)
- `progress/current.md`

Note: I ran prettier once over `lib app components`, which flipped CRLF to LF on many files; I restored CRLF on every tracked file (`git diff --ignore-cr-at-eol` shows only intended changes). `lib/supabase/*` show small diffs that were already present before this session.

## Decisions
- Any 4xx Auth error except 429 -> `INVALID_CREDENTIALS` (single identical result); 429, 5xx, network, undefined status, thrown errors -> `UNEXPECTED`. Errors are never logged.
- Role read via Prisma using the id from the `signInWithPassword` response; missing `public.User` row -> `signOut()` then `UNEXPECTED`.
- No `redirect()` in actions. Pages use `getUser()` (via `getCurrentUser`) not `getSession`.
- `LogoutButton` and `CalendarApp` navigate to `/login` even if `signOut` returned an error (no error UI specified).
- Route protection is only page-level redirects; middleware/`lib/auth.ts` remain feature #8.

## Verification
- `bash init.sh`: exit 0. ESLint 0 errors (1 pre-existing warning in `app/layout.tsx`), tsc clean, Vitest 3 files / 49 tests passed (21 new: 12 for actions incl. identical-result deep equality, INVALID_INPUT without calling Supabase, throw/5xx/429 -> UNEXPECTED, missing row signs out, signOut ok/error/throw; 6 for helpers).
- `pnpm build` passed. Routes: `ƒ /`, `○ /_not-found`, `ƒ /admin`, `ƒ /calendar`, `○ /login`.
- Dev smoke without cookies: `/login` 200 (1 form, `type="email"`, label CORREO, 0 matches for demo tip text); `/calendar` 307 -> `/login`; `/admin` 307 -> `/login`; `/` 307 -> `/login`. Dev server stopped; port 3000 free.
- grep for `demoTip` / `submitLogin` in app, components, lib, tests: no matches.

## NOT verified by me
- Any real login/logout against the hosted Supabase project (no passwords used).
- Cookie session persistence, role read from the real `public.User` table, and `router.refresh()` behavior in a browser.
- `getUser()` path in pages with a real session (only the no-session redirect was exercised).

## Manual steps for the user (npm-free: `pnpm dev`, open http://localhost:3000)
1. Log in with the admin (`SEED_ADMIN_EMAIL` + its password): expect landing on `/admin` showing the title, your email and "Cerrar sesión".
2. Click "Cerrar sesión": expect `/login`; then visit `/admin` and `/calendar`: both redirect to `/login`.
3. Log in as `ava@seed.comuninca.test` (`SEED_USER_PASSWORD`): expect `/calendar` with the real name/initials in the header and profile menu; visiting `/admin` redirects to `/calendar`.
4. Profile menu -> "Cerrar sesión": expect `/login`; `/calendar` redirects to `/login`.
5. Wrong password for ava, and an unknown email: both show exactly "Correo o contraseña incorrectos."
6. Submit empty fields: "Ingresa tu correo y tu contraseña para continuar."
7. Visiting `/` when logged in redirects by role.
