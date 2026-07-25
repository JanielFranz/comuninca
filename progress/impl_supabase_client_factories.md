# Feature #3: `supabase_client_factories` — Supabase SSR client factories

## Files touched

| File | Action | Purpose |
|---|---|---|
| `lib/supabase/server.ts` | **Created** | Server Components / Server Actions Supabase client factory |
| `lib/supabase/client.ts` | **Created** | Browser (Client Components) Supabase client factory |
| `lib/supabase/middleware.ts` | **Created** | Middleware session-refresh helper for `middleware.ts` (feature #8) |
| `package.json` | **Modified** (via pnpm) | Added `server-only` dependency |
| `pnpm-lock.yaml` | **Modified** (via pnpm) | Lockfile updated for `server-only` |

## Decisions

### 1. API surface of `@supabase/ssr` v0.12.3

Verified from the installed type declarations:

- **`createServerClient(url, key, options)`** — requires `options.cookies` with at least `getAll` (`CookieMethodsServer`). The `setAll` is optional on server (pages/components can omit it; middleware must provide it). Both overloads accept the modern `CookieMethodsServer` interface (`getAll` + optional `setAll`). The deprecated `CookieMethodsServerDeprecated` (`get`/`set`/`remove`) is not used.

- **`createBrowserClient(url, key, options?)`** — the `cookies` option is entirely optional; when omitted, the library reads/writes via `document.cookie` automatically.

- **`SetAllCookies`** signature in v0.12.3: `(cookies: { name, value, options }[], headers: Record<string, string>) => void | Promise<void>`. The headers argument carries `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, and `Pragma: no-cache` — used by the middleware to prevent CDN caching of auth responses.

### 2. `server.ts` — Server Components + Server Actions

- Marked with `import "server-only"` to prevent accidental client-side imports.
- Uses `cookies()` from `next/headers` (async in Next.js 16).
- `getAll()` delegates to `cookieStore.getAll()` returning `RequestCookie[]` (compatible with `{ name: string; value: string }[]`).
- `setAll()` wraps `cookieStore.set()` in a try/catch — Server Components cannot write cookies after the response starts streaming; middleware handles session refreshes in that case.
- The `_headers` argument from `SetAllCookies` is ignored in server context (no response object to set CDN headers on).

### 3. `client.ts` — Browser

- Uses `createBrowserClient` with no custom `cookies` option — the library handles `document.cookie` automatically.
- Only references `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Never touches `SUPABASE_SERVICE_ROLE_KEY` or any server-only secret.
- Synchronous (no `await`) — `createBrowserClient` is not async.

### 4. `middleware.ts` — Middleware session refresh

- Uses `createServerClient` with full `getAll`/`setAll`.
- `getAll()` reads from `request.cookies.getAll()` (`RequestCookies`).
- `setAll()` writes cookies to the response via `response.cookies.set()` and applies the cache-control headers to `response.headers`.
- Exports `updateSession(request: NextRequest): Promise<NextResponse>` — consumed by the root `middleware.ts` in feature #8.
- Calls `supabase.auth.getClaims()` to trigger the session refresh (lazy initialization detects stale tokens and writes back via `setAll`).

### 5. `cookieOptions` omitted

The `createServerClient` accepts an optional `cookieOptions` (e.g. `{ name?: string }`) to customize the storage key. We leave it at the default — the library uses the Supabase project ref as the prefix. This can be tuned later if needed.

## Acceptance criteria verification

| Criterion | Evidence |
|---|---|
| **Server, browser, and middleware Supabase clients exist and use only getAll/setAll** | All three files created; each uses only `getAll`/`setAll` from the `CookieMethodsServer`/`CookieMethodsBrowser` interfaces; no `get`/`set`/`remove` legacy methods anywhere |
| **Factories type-check; server-only modules are marked/imported accordingly** | `pnpm exec tsc --noEmit` passes with zero errors; `server.ts` has `import "server-only"`; `client.ts` has no such import |

## Verification output

```
$ pnpm exec tsc --noEmit
(no errors)

$ bash init.sh
── 5. Lint · typecheck · tests ─────────────────────────
[OK]   TypeScript typecheck clean
── 6. Review ───────────────────────────────────────────
[OK]   Environment ready. You can start working.
```

## Dependencies consumed

- Feature #1 (`env_and_supabase_setup`) — done. Provides the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars wired in `.env.example` and the `@supabase/ssr` package installed.

## Ready for

- Feature #6 (`login_logout`) — needs `lib/supabase/server.ts` for auth actions.
- Feature #8 (`rbac_middleware_and_guards`) — needs `lib/supabase/middleware.ts` for the root `middleware.ts`.
  