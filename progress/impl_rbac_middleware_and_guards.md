# Impl report: #8 rbac_middleware_and_guards

## Files
- `proxy.ts` (new, root): exported `proxy` + `config.matcher`.
- `lib/routeGuard.ts` (new): pure `decideRoute`, `isAdminPath`.
- `lib/auth.ts` (new, server-only): `requireUser`, `requireAdmin` (typed results), `requireUserOrRedirect`, `requireAdminOrRedirect` (pages only).
- `lib/supabase/middleware.ts`: `updateSession` now returns `{ response, user }`.
- `app/calendar/page.tsx`, `app/admin/page.tsx`: use the redirect wrappers (same behavior).
- `tests/unit/rbac.test.ts` (new, 41 tests). `progress/*`.

## Decisions
- **proxy.ts, not middleware.ts** (deviation from the feature `paths` text). Next 16.2.11 deprecates `middleware`; `proxy.md` confirms Proxy runs on the **Node.js runtime by default** (`runtime` config not allowed), so Prisma works. No `middleware.ts` exists. Note: architecture.md still says `middleware.ts` (docs not touched by me).
- Matcher: `/calendar/:path*`, `/admin/:path*`, `/onboarding/:path*` (bare paths included). `/`, `/login`, `/register`, `/auth/*`, `/_next`, static, `/api` are not matched.
- Role lookup via Prisma only for `/admin` paths. Auth session with no `public.User` row -> `/login`.
- **Fail closed**: any throw (session refresh or role lookup) -> 307 `/login`, no error text.
- **Cookie carry-over**: cookies from the `updateSession` response are copied onto redirect responses.
- Guards fail closed: `getCurrentUser` throwing -> `UNAUTHENTICATED`. Wrappers redirect `/login` (no session) or `/calendar` (non-admin). `signIn`/`signOut` and `app/page.tsx` untouched.
- Matcher test uses an equivalent prefix check plus exact-array assertion (no easy Next matcher helper).

## Verification
- `bash init.sh`: exit 0; eslint 0 errors (1 pre-existing font warning), tsc clean, vitest 4 files / 90 tests (49 existing + 41 new).
- `pnpm build` passed; output lists `ƒ Proxy (Middleware)` and no deprecation warning (dev log also had none). Routes: `/`, `/_not-found`, `/admin`, `/calendar`, `/login`.
- Dev smoke, no cookies: `/calendar`, `/admin`, `/admin/users`, `/onboarding` -> 307 `http://localhost:3000/login`; `/login` -> 200; `/` -> 307 `/login`. Dev server killed; port 3000 free.

## NOT verified by me (leader live check must assert, with real sessions)
1. USER session GET `/admin` and `/admin/anything` -> 307 to `/calendar`; ADMIN -> 200; USER on `/calendar` -> 200.
2. Refreshed cookie really set on the response for an expired-access-token session (both pass-through and redirect).
3. Prisma role lookup works inside the Node proxy runtime against the hosted DB (no runtime error/fallback to `/login` for a valid ADMIN on `/admin`).
4. Session with valid Auth user but no `public.User` row -> `/login`.
5. Sign out then hit `/calendar` -> `/login`.
