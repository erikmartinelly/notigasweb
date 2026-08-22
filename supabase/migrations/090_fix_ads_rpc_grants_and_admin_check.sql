-- ==============================================================================
-- MIGRACIÓN 090: CORRECCIÓN DE EVALUACIÓN DE SESIÓN EN IS_ADMIN_EMAIL Y GRANTS RPC
-- ==============================================================================

-- 1. Asegurar evaluación correcta de sesión / session_user en is_admin_email()
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
  -- 1. Si el llamador real es service_role o postgres en session_user
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- 2. Validar por email en JWT
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 3. Validar por UID en auth.users
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

-- 2. Asegurar evaluación estricta en is_admin_email_for(text)
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
  v_check_email text := LOWER(TRIM(COALESCE(p_email, '')));
  v_role text := COALESCE(auth.jwt() ->> 'role', session_user);
BEGIN
  -- 1. Si el llamador tiene rol service_role o superuser
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- 2. Validar por email en JWT si existe sesión activa
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 3. Validar por UID en auth.users si existe sesión activa
  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, raw_user_meta_data->>'email', ''))) INTO v_user_email
    FROM auth.users WHERE id = v_user_id;

    IF v_user_email <> '' AND EXISTS (
      SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_user_email
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 4. Validar por email explícito si coincide con admin_credentials
  IF v_check_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_check_email
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 3. Otorgar permisos de ejecución para la interfaz web (con publishable key / anon)
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email_for(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) TO anon, authenticated, service_role;

-- 4. Asegurar acceso a vistas públicas enmascaradas
ALTER VIEW public.pedidos_publicos SET (security_invoker = false);
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- 5. Notificar a PostgREST
NOTIFY pgrst, 'reload schema';
