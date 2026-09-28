// Next config files are plain Node and CAN read `process.env` directly, but
// `.env` is not loaded by Next's own env loading this early in the module
// graph (confirmed: without this import, `NEXT_PUBLIC_SUPABASE_URL` is
// undefined here in local dev, matching `prisma.config.ts`'s same need).
import "dotenv/config"
import type { NextConfig } from "next"

/**
 * Scope `next/image`'s remote allow-list to exactly this project's
 * `event-pictures` bucket's public-object path — never the whole Storage
 * host or other buckets.
 */
function eventPicturesRemotePattern(): NonNullable<
  NextConfig["images"]
>["remotePatterns"] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return []
  let hostname: string
  try {
    hostname = new URL(raw).hostname
  } catch {
    return []
  }
  return [
    {
      protocol: "https",
      hostname,
      pathname: "/storage/v1/object/public/event-pictures/**",
    },
  ]
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: eventPicturesRemotePattern(),
  },
  experimental: {
    serverActions: {
      // Default is 1 MB. A 960x540 JPEG budgeted at <=500 KB, base64-encoded
      // (~33% overhead) plus the rest of the event form's fields, comes
      // close enough to that default to be a real risk; 4 MB leaves
      // comfortable headroom without opening the door to large uploads.
      bodySizeLimit: "4mb",
    },
  },
}

export default nextConfig
