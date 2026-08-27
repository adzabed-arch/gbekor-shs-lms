-- GBEKOR SHS LMS: FIX ACCOUNT REGISTRATION
-- Run this entire script once in Supabase SQL Editor.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_lms_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'role','student') IN ('student','teacher','admin')
         THEN NEW.raw_user_meta_data->>'role' ELSE 'student' END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_lms_user_created ON auth.users;
CREATE TRIGGER on_auth_lms_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_lms_user();

DROP POLICY IF EXISTS "profiles own insert" ON public.profiles;
CREATE POLICY "profiles own insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles own read" ON public.profiles;
CREATE POLICY "profiles own read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles own update" ON public.profiles;
CREATE POLICY "profiles own update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Check that the trigger is installed:
-- SELECT tgname FROM pg_trigger WHERE tgname='on_auth_lms_user_created';
