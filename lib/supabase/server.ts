import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for use in Server Components and Server Actions.
 *
 * Uses `cookies()` from `next/headers` to read and write auth session cookies.
 * The `getAll` and `setAll` cookie methods are used exclusively (never the
 * legacy `get`/`set`/`remove` methods).
 *
 * IMPORTANT: Always create a new client per request — never share across
 * requests. In Server Components, setting cookies may fail (the response may
 * already be committed); the `setAll` implementation catches this gracefully
 * since middleware handles session refreshes.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
}
