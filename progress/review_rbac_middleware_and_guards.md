# Review — feature 8 rbac_middleware_and_guards

**Verdict:** APPROVED (authenticated live check recorded as PENDING, run by the leader)

## Executed evidence
- `bash init.sh` -> exit 0 (lint 0 errors, tsc clean, vitest 4 files / 90 tests passed = 49 original + 41 new).
- `pnpm build` passes; route table ends with `ƒ Proxy (Middleware)`; no deprecation warning. Installed next 16.2.11, @supabase/ssr 0.12.3. No `middleware.ts` exists. proxy.md line 223 confirms Proxy defaults to the Node.js runtime (`runtime` config not allowed), so Prisma is OK; `export async function proxy` + `config.matcher` matches the docs shape.
- Dev smoke via curl, NO cookies (status -> Location), all denied:
  - 307 -> /login: `/calendar`, `/calendar/x`, `/admin`, `/admin.json`, `/admin/users.json`, `/admin%2Fusers`, `/%61dmin`, `/%61dmin/users`, `/admin/../calendar`, `/admin%2F..%2Fcalendar`, `/%2e%2e/admin`, `/onboarding`, and `/admin` with HEAD/OPTIONS/POST/PUT/DELETE.
  - `/calendar/`, `/admin/`, `//admin`, `/admin//users`, `/onboarding/` -> 308 to the canonical path issued by Next before the proxy, which then 307s to /login (no content served).
  - Server Action POST (`Next-Action` header) to `/admin` and `/calendar` -> 307 /login.
  - `_next/data/x/admin.json` -> 307 with `x-nextjs-redirect: /_next/data/x/login.json` (no content).
  - `x-middleware-subrequest` (both `middleware:` and `proxy:` values), `RSC: 1`, `x-nextjs-data: 1`, and a garbage `sb-*` cookie -> still 307 /login. Nothing in the code reads or depends on that header.
  - Case: `/Admin`, `/ADMIN/users`, `/Onboarding` -> 404 (Next routing is case-sensitive, no such route, no content). `/adminx`, `/administrator`, `/admin%00`, `/admin;x` -> 404 (not admin paths, and no protected content exists there). `/login` 200. `/register` 404 (page not built yet).
- Matcher semantics: `/admin/:path*` and `/onboarding/:path*` match the bare path (proved by `/admin` and `/onboarding` redirecting).
- Cookie carry-over probe (throwaway vitest file, deleted): a cookie set with path=/, maxAge=400, domain, secure, httpOnly, sameSite=lax came out of the redirect as `sb-a=v; Path=/; Expires=...; Max-Age=400; Domain=x.test; Secure; HttpOnly; SameSite=lax`. All options survive.
- Dev server stopped; port 3000 free. `git status --short prisma/migrations` empty. No `console.*`, no `any` in feature files. No client component imports `lib/auth.ts` (only `app/calendar/page.tsx` and `app/admin/page.tsx`, Server Components); `lib/auth.ts` has `import "server-only"`.

## Acceptance criteria
- "Unauthenticated /calendar, /admin/*, /onboarding redirect to /login" -> met (curl matrix above; tests/unit/rbac.test.ts:43-51 decideRoute for the three areas, proxy 307 test at ~L84-92).
- "A USER-role session hitting /admin/* is redirected away" -> met at unit level (rbac.test.ts:53-59 and the proxy USER test: 307 to /calendar; undefined/null/unknown role also denied). Real USER session against the hosted DB NOT yet executed: PENDING live check.
- "requireUser/requireAdmin are unit-tested and consumed by subsequent actions" -> unit-tested: met (rbac.test.ts requireUser/requireAdmin block incl. throw -> UNAUTHENTICATED with no leak). "Consumed": the redirect wrappers are consumed by the two pages; no Server Actions use them yet (later features); acceptable.

## Findings by area
- Bypass analysis: no bypass found. `isAdminPath` (lib/routeGuard.ts:8-10) is exact `/admin` or `/admin/` prefix, so `/adminx` is not admin (and not reachable content). The proxy is not the only gate: pages re-check via `requireUserOrRedirect`/`requireAdminOrRedirect` (app/calendar/page.tsx:5, app/admin/page.tsx:6).
- Fail closed: any throw in `updateSession` or the Prisma lookup -> 307 /login with no body text (proxy.ts:31-34; tests cover both throws and no-leak). `decideRoute` is pure and outside the try.
- Redirect loops: none. `/login` is outside the matcher and `app/(auth)/login/page.tsx` does not redirect authenticated users. USER on /admin -> /calendar -> passes. No-User-row session on /admin -> /login (proxy); on /calendar the proxy passes and `requireUserOrRedirect` sends to /login, which renders. No ping-pong, no unbounded loops.
- Guards (lib/auth.ts): typed results, never call `redirect()`; `safeCurrentUser` swallows throws (fail closed, no text); role comes from the Prisma row via `getCurrentUser` (server-validated `auth.getUser()`), never client input; wrappers commented as Server-Component-only. Refactored pages behave as before (calendar: /login without user; admin: /login without session, /calendar for non-admin).
- Layering/hygiene: proxy.ts reaches Prisma only via `@/lib/db`; no Prisma/Supabase client in components. `git diff --ignore-cr-at-eol lib/supabase/middleware.ts` shows only the return shape, a doc comment and the ANON_KEY -> PUBLISHABLE_KEY rename (consistent with other supabase factories, earlier feature work). No unrelated reformatting in feature files (other tracked-file diffs belong to earlier uncommitted features).
- Tests mock Prisma, Supabase middleware, next/navigation and server-only; no `.env`/network needed.

## Checkpoints
- C1: [x] init.sh exit 0, harness files present.
- C2: [x] only #8 in_progress, depends_on #6 done; progress/current.md describes the session.
- C3: [x] layering holds; guards typed; no redirect in actions; no secrets.
- C4: [x] 41 new tests with concrete assertions and error paths; mocked; 90/90 green.
- C5: [x] no temp files (probe deleted), migrations untouched.

## Required changes
None.

## Observations (non-blocking)
1. `updateSession`'s `setAll(cookiesToSet)` (lib/supabase/middleware.ts:19-27, feature #3) ignores the second `headers` argument that @supabase/ssr 0.12.3 supplies (`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, `Pragma: no-cache`). The proxy copies only cookies, so those cache headers are lost on both pass-through and redirect responses. Recommend a follow-up: apply `headers` in `setAll` and copy them onto redirects (matters behind a CDN).
2. The proxy treats "authenticated" on `/calendar` and `/onboarding` as an Auth session only (proxy.ts:20-25); the no-User-row -> /login rule is enforced at the proxy only for /admin and at the page for /calendar. `/onboarding` has no page yet: when built it must call `requireUserOrRedirect`.
3. Weak tests: the cookie carry-over test asserts only `sb-token=fresh-value`, not path/maxAge/httpOnly/secure (I verified these manually); the matcher inclusion test re-implements `:path*` matching itself (curl smoke covers real semantics); no test asserts `redirect` is never called by `requireUser`/`requireAdmin`.
4. Docs drift (`middleware.ts` now `proxy.ts`): `.opencode/rules/architecture.md` lines 55, 56 (line 67 is `lib/supabase/middleware.ts`, correct); `docs/technical-blueprint.md` lines 54, 221; `feature_list.json` line 143 (title), 147 (`paths`), 148 (description), line 67 ("root middleware.ts", feature 3), line 212 (another feature path list; check).

## Live check PENDING (leader, real hosted project, real sessions)
Not proven by executed evidence here; must assert:
1. USER session: GET `/admin` and `/admin/anything` -> 307 /calendar; `/calendar` -> 200.
2. ADMIN session: `/admin` -> 200 (Prisma role lookup works inside the Node proxy runtime against the hosted DB, no fallback to /login).
3. Expired access token with valid refresh token: response (pass-through and redirect) carries a refreshed `Set-Cookie` with path/maxAge/httpOnly/sameSite intact.
4. Valid Auth user with no `public.User` row: `/admin` -> /login, `/calendar` -> /login (page guard), no loop.
5. After sign out, `/calendar` and `/admin` -> /login.
