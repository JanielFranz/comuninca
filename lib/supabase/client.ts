import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in the browser (Client Components).
 *
 * Uses `createBrowserClient` from `@supabase/ssr` which automatically
 * handles cookie persistence via `document.cookie` — no manual cookie
 * methods are needed.
 *
 * Only browser-safe environment variables (`NEXT_PUBLIC_*`) are used.
 * Never references `SUPABASE_SERVICE_ROLE_KEY` or other server secrets.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
