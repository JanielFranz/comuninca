# Review — feature 11 onboarding_gate

**Verdict:** APPROVED (live/manual items pending, listed below)

## Executed evidence
- `bash init.sh`: exit 0 (ESLint 0 errors, 1 pre-existing warning in `app/layout.tsx`; typecheck clean; Vitest 9 files, 215/215).
- Per-file counts: onboarding 49, rbac 40, invite-codes 40, seed 28, register 27, auth-actions 15, invite-code-input 7, userDisplay 6, register-validation 3 (total 215, all green).
- `pnpm build` passes; route table lists `ƒ /onboarding` plus `Proxy (Middleware)`.
- `git diff --ignore-cr-at-eol tests/unit/rbac.test.ts` is EMPTY because `tests/` is untracked (`?? tests/`): there is no git baseline to diff. The adaptation was checked by reading the file: every #8 category is still asserted (unauthenticated -> /login incl. /onboarding; USER on /admin(/x) -> /calendar; ADMIN next; `/administrator`/`/adminx` not admin paths; role undefined/null/"SUPERUSER" denied /admin; 307 + cookie carry-over; no-User-row -> /login; fail-closed on lookup and refresh throw without leaking text; matcher list; requireUser/requireAdmin/page wrappers). Changes are additive (`onboardingCompleted` on fixtures, `/calendar` lookup now expected, matcher now 3 entries, "completed USER on /calendar" next). No weakened assertion found.
- Own dev server on port 3100 (stopped by PID; port 3000 untouched), no cookies, everything 307 -> `/login` (or 308 slash normalisation to a path that then 307s): `/calendar`, `/calendar/x`, `/calendar/`, `/%63alendar`, `/calendar%2Fx`, `/calendar/..`, `/calendar/../onboarding`, `/calendar?__nextDataReq=1`, `/calendar.rsc`, `/calendar?_rsc=abc`, `/onboarding`, `/onboarding/x`, `/onboarding//x`, `/admin`, `/admin/x`, `/admin/codes`, `/%61dmin`, `//calendar`; `RSC: 1` and `RSC: 1` + `Next-Router-Prefetch: 1` on `/calendar` -> 307 /login; Server Action POST (`Next-Action` header) to `/calendar` and plain POST to `/onboarding` -> 307 /login; `/_next/data/dev/calendar.json` 307; `/Calendar` 404. No unauthenticated path reaches content.
- Throwaway `decideRoute` probe (deleted afterwards) over role {USER, SUPERUSER, null} x flag {true, null} x paths incl. `/onboardingx`, `/calendarx`: null/missing flag on any non-ADMIN role -> `/onboarding` (fail closed); `/onboardingx` and `/calendarx` are treated as ordinary protected paths; role "SUPERUSER" with flag true passes `/calendar` (Observation 1).

## Gate analysis (matrix and loops)
Proxy `decideRoute` (lib/routeGuard.ts:22-44), verified by the suite matrix (tests/unit/onboarding.test.ts:186-235) and my probe:
- anon / no User row: every path -> /login (/login is unmatched and its page has no redirect; `app/page.tsx` sends a null user to /login), so no loop.
- USER incomplete: /calendar(/x) -> /onboarding; /onboarding next; /admin(/x) -> /calendar -> /onboarding (2 hops).
- USER complete: /calendar next; /onboarding -> /calendar; /admin -> /calendar.
- ADMIN: /calendar next; /onboarding -> /admin; /admin next.

Page-level redirects traced by reading: `app/calendar/page.tsx:5` uses `requireOnboardedUserOrRedirect` (lib/auth.ts:70-77: null -> /login, non-ADMIN with flag false -> /onboarding); `app/onboarding/page.tsx:6-8` (null -> /login, ADMIN -> /admin, complete -> /calendar); `app/admin/page.tsx` via `requireAdminOrRedirect` (FORBIDDEN -> /calendar, null -> /login). Proxy and pages read the same fields with the same logic, so their decisions agree in every state; the longest chain is 2 hops, no ping-pong. Defense in depth is real: even if the proxy is skipped, the `/calendar` page itself redirects an incomplete USER, so CalendarApp is never rendered for one.

## Acceptance criteria
- AC 1.4.1 (new USER forced to onboarding) -> met for the mechanism (decideRoute matrix, proxy 307 /onboarding with cookies, `requireOnboardedUserOrRedirect` USER incomplete -> /onboarding, curl bypass matrix). End-to-end with a real fresh USER: PENDING live check.
- AC 1.4.2 (Profesión/Ikigai optional) -> met (lib/validation/onboarding.ts:8-27; test "trims and turns empty optionals into undefined"; action success test asserts null for empty optionals and trimmed values).
- AC 1.4.3 (empty Ocupación blocked, es-PE message) -> met: `occupationRequired` "La ocupación es obligatoria." asserted for "", "   ", undefined; action returns INVALID_INPUT with that field message and no write; client-side block through the same schema (components/OnboardingForm.tsx:26-31). Browser rendering: PENDING.
- AC 1.4.4 (submit persists the three fields and completes onboarding) -> mechanism met (conditional `updateMany` data asserted exactly); real persistence: PENDING live.
- AC 1.4.5 (completed user never sees onboarding again, one-time) -> met at logic level: `/onboarding` complete -> /calendar in proxy and page; second submit `count 0` -> ALREADY_COMPLETED. Two concurrent submits: the `WHERE onboardingCompleted = false` predicate is re-evaluated under Postgres row locking, so exactly one write matches and the other gets count 0. Not unit-testable; real DB behavior PENDING live.
- AC 1.4.6 (cannot skip/close, cannot reach app) -> met: no close/skip control in OnboardingForm.tsx (only submit and LogoutButton); gate at page and proxy level; bypass matrix above.
- AC 1.4.7 (after onboarding lands in calendar) -> mechanism met (`redirectTo: "/calendar"`, `router.push` + `router.refresh`, OnboardingForm.tsx:33-37); real navigation PENDING.
- AC 1.4.8 (ADMIN never onboarded) -> met: action FORBIDDEN before validation/write (lib/actions/onboarding.ts:32, tested); page and proxy send ADMIN /onboarding -> /admin; `requireOnboardedUserOrRedirect` passes ADMIN with flag false (tested).
- AC 1.4.9 (es-PE copy with accents in strings.ts) -> met: `STRINGS.onboarding` has correct accents ("Cuéntanos", "PROFESIÓN", "OCUPACIÓN", "Inténtalo", "sesión"); OnboardingForm/page have no hard-coded UI text (`aria-required="true"` is an attribute, not copy).

## Action review (lib/actions/onboarding.ts)
- `requireUser()` first (:29-30), Prisma untouched on failure (tested); ADMIN FORBIDDEN next (:32); Zod after (:34); id and role only from the session (`auth.user.id`, literal `role: "USER"`); the write `data` cannot set `role`. Zod object strips unknown keys; the smuggled `userId/id/role/onboardingCompleted` test asserts exact `updateMany` args, so any leak would fail it.
- Single conditional `updateMany` (:41-49) cannot overwrite an existing profile; catch returns `UNEXPECTED` with no text (tested with a secret-bearing error). File exports one async function plus types; no `redirect(` in `lib/actions/*.ts` (grep empty).
- Max lengths 100/100/500 enforced and boundary-tested.

## Checkpoints
- C1: [x] init.sh exit 0, 215/215 tests, build passes and lists /onboarding.
- C2: [x] Layering: no Prisma/Supabase imports under `components/` or `app/onboarding` (grep empty); Prisma via `lib/db`; auth checked inside the action; no `redirect()` in actions; `server-only` on auth/currentUser; no `any`, no `console.*` (grep empty).
- C3: [x] Conventions: Zod at the boundary, typed action result union, co-located CSS Module, copy in strings.ts, no dependency changes for this feature.
- C4: [x] Tests: every AC has an asserting test including error paths; Prisma/Supabase mocked (offline). See Observation 3 for gaps.
- C5: [x] Hygiene: `prisma/**` and `supabase/**` show only pre-existing changes from earlier features, none from this one; no probe files left; no secret-like strings in the new files; my dev server on 3100 stopped.

## Required changes
None.

## Observations (non-blocking)
1. `decideRoute` lets a role that is neither USER nor ADMIN (e.g. "SUPERUSER") with `onboardingCompleted: true` through `/calendar` (it gates on `!isAdmin && !completed`, lib/routeGuard.ts:42). Not exploitable now because the Prisma `Role` enum only admits ADMIN|USER, but an allow-list (`role === "USER" && completed`) would fail closed uniformly; `requireOnboardedUserOrRedirect` (lib/auth.ts:73) has the same shape.
2. `STRINGS.onboarding.alreadyCompleted` is defined but unused (ALREADY_COMPLETED silently redirects). Remove it or show it.
3. Test-quality gaps: (a) the "at most 2 hops" property test (tests/unit/onboarding.test.ts:237-252) models ONLY the proxy (`decideRoute`); page-level redirects are not modeled, and it stops at `/login`. Both were verified here by reading only. (b) `app/onboarding/page.tsx` redirects have no test. (c) rbac.test.ts is untracked so the adaptation cannot be diffed (verified by reading). (d) concurrency exactness is argued from SQL semantics, not tested.
4. Browser-only risks tests cannot catch: styling reuse of LoginScreen.module.css for the textarea, pending state disabling the button during `startTransition`, `router.push` then `router.refresh` leaving a stale RSC cache (the page-level gate re-checks, so worst case is one extra redirect), LogoutButton placement, es-PE rendering with `noValidate`, prefetch of `/calendar` from an incomplete session.

## Pending live / manual checks (leader on the hosted project, or user in browser)
Each must assert:
1. Freshly registered USER (flag false) signs in; loading `/calendar` (and `/calendar/x`) ends on `/onboarding`; `/admin` ends on `/onboarding` via `/calendar`; no loop; CalendarApp never rendered.
2. Submit with empty/whitespace Ocupación shows "La ocupación es obligatoria." and writes nothing (row unchanged); over-length values rejected.
3. Valid submit (Profesión "Ing.", Ocupación "Docente", Ikigai empty): DB row has `profession='Ing.'`, `occupation='Docente'`, `ikigai` NULL, `onboardingCompleted=true`, `role` still USER; browser lands on `/calendar`; then `/onboarding` redirects to `/calendar`.
4. Second submit (e.g. a second tab after the first completed): result ALREADY_COMPLETED and stored profile unchanged; if feasible, two near-simultaneous submits leave exactly one winning profile.
5. ADMIN: `/calendar` and `/admin` reachable regardless of the flag; `/onboarding` redirects to `/admin`; `completeOnboarding` as ADMIN returns FORBIDDEN and changes nothing.
6. Seeded users with the flag true reach `/calendar` directly without seeing `/onboarding`.
7. Auth user with no `public.User` row still goes to `/login` from `/calendar`, `/onboarding`, `/admin` with no loop (proven for #8; re-confirm for `/onboarding`).
8. Browser visual check: form layout, textarea styling, logout button works from `/onboarding`, pending state on submit, no close/skip control.
