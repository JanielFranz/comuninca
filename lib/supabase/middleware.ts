import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth session cookie and returns a response that
 * carries the updated cookies + cache-control headers.
 *
 * Used by the root `middleware.ts` (feature #8) to keep the user's session
 * alive across requests. Must be called before any route handler runs.
 *
 * The `getAll` and `setAll` cookie methods are used exclusively (never the
 * legacy `get`/`set`/`remove` methods).
 *
 * @param request The incoming `NextRequest` from the middleware.
 * @returns A `NextResponse` with updated cookies and headers, or the original
 *          request pass-through if no update is needed.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // This refreshes the session cookie if it's expired — the library reads
  // the current cookies via `getAll`, detects a stale token, refreshes it,
  // and writes the result back via `setAll`.
  await supabase.auth.getClaims();

  return response;
}
