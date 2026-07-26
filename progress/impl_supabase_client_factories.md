# Feature #3 — supabase_client_factories

**Date:** 2026-07-25

## Files touched

| File                         | Action   | Purpose                                                                                                                                                                                                                                         |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/supabase/server.ts`     | Created  | Server Component / Server Action Supabase client factory using `createServerClient` from `@supabase/ssr` bound to `next/headers` `cookies()`. Uses only `getAll`/`setAll` cookie methods. Marked with `import "server-only"`.                   |
| `lib/supabase/client.ts`     | Created  | Browser-side Supabase client factory using `createBrowserClient` from `@supabase/ssr`. Marked with `"use client"` directive.                                                                                                                    |
| `lib/supabase/middleware.ts` | Created  | Middleware session refresher exporting `updateSession(request: NextRequest)`. Uses `createServerClient` bound to the middleware's `NextRequest` cookies. Uses only `getAll`/`setAll`. Refreshes the auth session via `supabase.auth.getUser()`. |
| `package.json`               | Modified | Added `server-only` v0.0.1 as a runtime dependency (required for the `import "server-only"` directive in `server.ts`).                                                                                                                          |
| `pnpm-lock.yaml`             | Modified | Updated by `pnpm add server-only`.                                                                                                                                                                                                              |

## Decisions

- **Cookie API**: All three factories use **exclusively** `getAll` and `setAll` — the legacy `get`/`set`/`remove` methods are never used. This follows the hard rule from the feature spec and the latest `@supabase/ssr` conventions.
- **`server-only`**: Installed as a dependency (`pnpm add server-only`) since `import "server-only"` at the top of `server.ts` prevents accidental import into client components, enforcing the architecture boundary.
- **`setAll` error handling in server.ts**: The `setAll` implementation wraps `cookieStore.set` in a try/catch because Server Components cannot set cookies (Next.js throws silently). Middleware refreshes sessions instead — this is the standard `@supabase/ssr` pattern.
- **Middleware response chain**: The `updateSession` function creates a `NextResponse`, allows the Supabase client to read existing cookies from `request.cookies.getAll()`, and writes new cookies to the response via `setAll` — first setting them on the request for immediate availability, then on the response for the browser.

## Verification evidence

### TypeScript typecheck

```
$ pnpm exec tsc --noEmit
Already up to date
Done in 931ms using pnpm v11.1.3
```

✅ Zero type errors.

### init.sh full harness

```
$ bash init.sh
...
── 5. Lint · typecheck · tests ─────────────────────────
[WARN] No ESLint config yet (feature #5) — skipping lint.
[OK]   TypeScript typecheck clean
[WARN] No test script/files yet (features #5/#18+) — skipping tests.
── 6. Review ───────────────────────────────────────────
[OK]   Environment ready. You can start working.
```

✅ Exit code 0. ESLint and tests skipped (not yet configured — feature #5). TypeScript clean.

### Acceptance criteria checklist

| Criterion                                                                         | Status                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Server, browser, and middleware Supabase clients exist and use only getAll/setAll | ✅ All three factories created; only `getAll` and `setAll` used                                   |
| Factories type-check; server-only modules are marked/imported accordingly         | ✅ `tsc --noEmit` clean; `server.ts` uses `import "server-only"`; `client.ts` uses `"use client"` |
