-- ==============================================================================
-- MIGRACIÓN 090: CORRECCIÓN CRÍTICA — SEGURIDAD DE AUTORIZACIÓN EN is_admin_email_for
-- ==============================================================================
-- Se elimina la validación por parámetro explícito de texto plano no respaldado por sesión.
-- La autorización administrativa se valida de forma estricta contra la sesión real autenticada
-- (auth.jwt() / auth.uid() / auth.users). Se revoca EXECUTE de PUBLIC y anon en RPCs de anuncios.

-- 1. Redefinir is_admin_email() con verificación estricta de sesión JWT / auth.users
CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_email text := LOWER(TRIM(COALESCE(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    auth.jwt() -> 'app_metadata' ->> 'email',
    ''
  )));
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_role text := COALESCE(auth.jwt() ->> 'role', session_user);
BEGIN
  -- Permiso total a superuser / service_role
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- 1. Validar por email en JWT (sesión real autenticada)
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 2. Validar por UID en auth.users (sesión real autenticada)
  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, raw_user_meta_data->>'email', ''))) INTO v_user_email
    FROM auth.users WHERE id = v_user_id;

    IF v_user_email <> '' AND EXISTS (
      SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_user_email
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- 2. Redefinir is_admin_email_for(text) con validación estricta de sesión JWT / UID
CREATE OR REPLACE FUNCTION public.is_admin_email_for(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_email text := LOWER(TRIM(COALESCE(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    auth.jwt() -> 'app_metadata' ->> 'email',
    ''
  )));
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_role text := COALESCE(auth.jwt() ->> 'role', session_user);
BEGIN
  -- Permiso total a superuser / service_role
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- 1. Validar por email en JWT (sesión real autenticada)
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 2. Validar por UID en auth.users (sesión real autenticada)
  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, raw_user_meta_data->>'email', ''))) INTO v_user_email
    FROM auth.users WHERE id = v_user_id;

    IF v_user_email <> '' AND EXISTS (
      SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_user_email
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- 3. Revocar permisos de PUBLIC y anon en funciones administrativas de anuncios
REVOKE EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_email_for(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_email_for(text) FROM anon;

-- 4. Otorgar permisos exclusivamente a usuarios autenticados y service_role
GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email_for(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated, service_role;

-- 5. Asegurar acceso a vistas públicas enmascaradas
ALTER VIEW public.pedidos_publicos SET (security_invoker = false);
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- 6. Notificar a PostgREST
NOTIFY pgrst, 'reload schema';
