// NOTE: deliberately NO `import "server-only"` here. That package throws when
// loaded outside a Next.js server bundle, which would make this module
// unusable from the `tsx prisma/seed.ts` CLI. The secret stays server-only by
// construction instead: this file is imported only by `prisma/seed.ts` (a Node
// CLI), reads `SUPABASE_SECRET_KEY` (not NEXT_PUBLIC_*, so Next never inlines
// it into a bundle), and must never be imported from a client component.
import { createClient } from "@supabase/supabase-js"

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set to use the admin client.",
    )
  }
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
