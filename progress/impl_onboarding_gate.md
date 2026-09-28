# Implementation report: #11 onboarding_gate

## Files
- New: `lib/validation/onboarding.ts`, `lib/actions/onboarding.ts`, `app/onboarding/page.tsx`, `components/OnboardingForm.tsx`, `components/OnboardingForm.module.css`, `tests/unit/onboarding.test.ts`.
- Modified: `lib/currentUser.ts` (+`onboardingCompleted` in type and select), `lib/auth.ts` (+`requireOnboardedUserOrRedirect`), `lib/routeGuard.ts` (`decideRoute` + `isOnboardingPath`), `proxy.ts` (single lookup for every matched path), `app/calendar/page.tsx` (uses the new wrapper), `lib/strings.ts` (`STRINGS.onboarding`), `tests/unit/rbac.test.ts` (adapted for the new field and the lookup on /calendar), `progress/current.md`.

## Decisions
- `completeOnboarding`: `requireUser` first, ADMIN -> FORBIDDEN, Zod (`INVALID_INPUT` + per-field messages), ONE `updateMany({ where: { id, role: "USER", onboardingCompleted: false } })`; count 0 -> `ALREADY_COMPLETED`; catch -> `UNEXPECTED`. No `redirect()`. Only schema keys survive, id from the session.
- `decideRoute`: unauthenticated / no User row -> `/login`; `/admin*` non-ADMIN -> `/calendar`; `/onboarding` ADMIN -> `/admin`, completed USER -> `/calendar`, incomplete -> next; other paths (`/calendar`) non-ADMIN with flag not `true` -> `/onboarding` (missing flag = incomplete, fail closed). Max 2 hops, tested.
- Proxy does one `findUnique` selecting `role` + `onboardingCompleted` on every matched authenticated request; a null row means `hasUser=false`. Fail-closed catch and cookie carry-over unchanged.
- Form: reuses `LoginScreen.module.css` visuals, no close/skip, client-side block with the Ocupación required message, pending state, error-code -> es-PE messages, success -> `router.push` + `router.refresh`; `ALREADY_COMPLETED` pushes to `/calendar`. Includes `LogoutButton`.
- Files in this working tree are LF on disk (not CRLF as briefed); I kept them LF, `git diff --ignore-cr-at-eol --stat` is clean of whole-file churn.

## Tests
- `bash init.sh` exit 0: 9 files, 215 tests passed (167 before + 48 new; ESLint 1 pre-existing warning in `app/layout.tsx`, typecheck clean).
- New suite covers schema, action (all error paths, smuggled keys, conditional where), `requireOnboardedUserOrRedirect` (4 branches), the full `decideRoute` matrix (5 states x 5 paths), the <= 2 hops property test, and `proxy()` (incomplete USER -> 307 /onboarding with cookies, completed/ADMIN on /onboarding, no User row, lookup throwing).

## Build and smoke
- `pnpm build` passes; route table lists `/onboarding` (dynamic) plus `Proxy`.
- Dev, no cookies: `/onboarding` 307 -> /login, `/calendar` 307 -> /login, `/admin` 307 -> /login, `/login` 200. Dev server stopped; port 3000 free.
- Greps: no `redirect(` in `lib/actions/*.ts`; no Prisma/Supabase imports in `components/` or `app/onboarding`; no `console.*`; no hard-coded UI text in the new component/page.

## NOT verified by me (leader's live check)
- A freshly registered USER is forced from `/calendar` to `/onboarding`.
- Empty Ocupación is rejected; a valid submit persists the three fields, flips the flag, then `/calendar` is reachable and `/onboarding` redirects away.
- A second submit gives `ALREADY_COMPLETED`.
- ADMIN is never gated and `/onboarding` sends ADMIN to `/admin`.
- Seeded users with the flag true reach `/calendar`.
- The onboarding form in a real browser (layout, textarea styling, logout button, pending state).
