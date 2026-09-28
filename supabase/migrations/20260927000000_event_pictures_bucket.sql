-- ============================================================================
-- Migration: Supabase Storage bucket for event pictures
--
-- Feature: #16 — event_picture_upload
--
-- The upload flow (Server Action `createEvent`, running with the ADMIN
-- Supabase client from lib/supabase/admin.ts) always re-encodes the picture
-- client-side to a fixed-size JPEG before it reaches the server, so:
--   - allowed_mime_types is restricted to image/jpeg only.
--   - file_size_limit is a generous server-side backstop (3 MiB) — the app's
--     own client-side resize targets well under 500 KB; this only guards
--     against a buggy or bypassed client, not the normal path.
--
-- Access model: the bucket is PUBLIC (anyone can read an object's public URL,
-- e.g. via next/image, with no auth and independent of RLS). All WRITES go
-- through the ADMIN client only (service-role key, inside createEvent after
-- requireUser() has already authorized the request), which bypasses RLS
-- entirely. Because of this, no RLS policy on storage.objects is added here:
-- there is no path by which the anon or authenticated role ever needs to
-- read or write storage.objects directly for this feature. If a future
-- feature needs the browser to upload directly (bypassing the server), add
-- explicit INSERT/UPDATE/DELETE policies scoped to the authenticated role at
-- that time — do not widen access preemptively.
--
-- Idempotent: ON CONFLICT DO NOTHING so re-running this migration is safe.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-pictures', 'event-pictures', true, 3145728, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
