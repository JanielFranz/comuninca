-- ============================================================================
-- Migration: auth.users → public.User sync trigger
-- Feature: #4 — auth_user_sync_trigger
-- When a new auth user is created (INSERT on auth.users), automatically create
-- the matching public.User row. When an auth user is deleted, clean up the
-- public.User row and all dependent records.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger function: handle new auth user (INSERT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" (
    id,
    email,
    "fullName",
    "role",
    "onboardingCompleted",
    "createdAt"
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'USER',
    FALSE,
    NOW()
  );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trigger: fire handle_new_user on INSERT to auth.users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Trigger function: handle deleted auth user (DELETE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_deleted_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- 3a. Remove EventAttendee rows for events hosted by this user
  DELETE FROM public."EventAttendee"
  WHERE "eventId" IN (SELECT id FROM public."Event" WHERE "hostId" = OLD.id);

  -- 3b. Remove EventAttendee rows where this user is an attendee
  DELETE FROM public."EventAttendee"
  WHERE "userId" = OLD.id;

  -- 3c. Delete events hosted by this user
  DELETE FROM public."Event"
  WHERE "hostId" = OLD.id;

  -- 3d. Delete the user record itself
  DELETE FROM public."User"
  WHERE id = OLD.id;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trigger: fire handle_deleted_user on DELETE from auth.users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deleted_user();
