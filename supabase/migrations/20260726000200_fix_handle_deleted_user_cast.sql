-- ============================================================================
-- Migration: fix handle_deleted_user() — text vs uuid comparison
--
-- Bug: public."User".id, "Event"."hostId" and "EventAttendee"."userId" are
-- TEXT (Prisma String), while auth.users.id (OLD.id) is uuid. Postgres has no
-- `text = uuid` operator, so every DELETE on auth.users failed inside the
-- AFTER DELETE trigger with "operator does not exist: text = uuid", which
-- surfaced as HTTP 500 "Database error deleting user".
--
-- Fix: compare against OLD.id::text. The INSERT trigger (handle_new_user) is
-- unaffected: assigning a uuid to a TEXT column uses an assignment cast.
--
-- The original migration (20260726000000_auth_user_sync.sql) is already
-- applied and stays immutable; this one replaces the function body only.
-- The trigger on_auth_user_deleted keeps pointing at the same function name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Remove EventAttendee rows for events hosted by this user
  DELETE FROM public."EventAttendee"
  WHERE "eventId" IN (SELECT id FROM public."Event" WHERE "hostId" = OLD.id::text);

  -- Remove EventAttendee rows where this user is an attendee
  DELETE FROM public."EventAttendee"
  WHERE "userId" = OLD.id::text;

  -- Delete events hosted by this user
  DELETE FROM public."Event"
  WHERE "hostId" = OLD.id::text;

  -- Delete the user record itself
  DELETE FROM public."User"
  WHERE id = OLD.id::text;

  RETURN OLD;
END;
$$;
