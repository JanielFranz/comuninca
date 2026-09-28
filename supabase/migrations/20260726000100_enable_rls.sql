-- ============================================================================
-- Migration: enable Row Level Security on every table in the public schema
--
-- Why: Supabase exposes the `public` schema through the Data API (PostgREST).
-- The publishable key ships to the browser, so any table without RLS is
-- readable and writable by anyone holding that key — including invite codes
-- and user PII.
--
-- Design: all persistence goes through Prisma on the server (see
-- .opencode/rules/architecture.md — "Persistence only through lib/db.ts").
-- Prisma connects as the `postgres` role, which has BYPASSRLS, so it is not
-- affected. The `SECURITY DEFINER` auth-sync triggers also run as `postgres`.
--
-- With RLS enabled and NO policies, the `anon` and `authenticated` roles are
-- denied by default. If a future feature needs direct client access via the
-- Data API, add narrowly-scoped policies in a new migration.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op when already enabled.
-- ============================================================================

ALTER TABLE public."User"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InviteCode"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Event"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EventAttendee" ENABLE ROW LEVEL SECURITY;

-- Prisma's own bookkeeping table also lives in `public` and is exposed too.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;
