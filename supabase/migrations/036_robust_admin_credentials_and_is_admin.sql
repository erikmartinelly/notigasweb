-- 036_robust_admin_credentials_and_is_admin.sql
-- Asegura que is_admin_email() y la política RLS de admin_credentials sean 100% case-insensitive y tolerantes a espacios

CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_credentials 
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated;

-- Asegurar política RLS en admin_credentials
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins select own record" ON public.admin_credentials;

CREATE POLICY "Admins select own record" ON public.admin_credentials
FOR SELECT
USING (
  LOWER(TRIM(email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
);
