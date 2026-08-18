-- ============================================================================
-- MIGRACIÓN 063: DESBLOQUEO DE AUTENTICACIÓN GOOGLE & EMAIL EN PROFILES
-- ============================================================================

-- 1. Arreglar permisos y política en security_rate_limits
DROP POLICY IF EXISTS "rate_limits_admin_only" ON public.security_rate_limits;
DROP POLICY IF EXISTS "rate_limits_system_policy" ON public.security_rate_limits;
CREATE POLICY "rate_limits_system_policy" ON public.security_rate_limits
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 2. Conceder permisos de ejecución para funciones de protección
GRANT EXECUTE ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_field_integrity() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_limited_content_insert() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_optional_order_insert() TO postgres, authenticated, service_role;

-- 3. Blindar guard_profile_field_integrity para inserción y actualización sin bloqueos
CREATE OR REPLACE FUNCTION public.guard_profile_field_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  NEW.nombre := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre, ''), '<[^>]*>', '', 'g'), 120);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, 'cochabamba'))), 80);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  NEW.role := COALESCE(NEW.role, 'vecino');

  IF NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN
    RAISE EXCEPTION 'Latitud inválida';
  END IF;
  IF NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN
    RAISE EXCEPTION 'Longitud inválida';
  END IF;

  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  -- Contexto de creación de usuario en Supabase Auth
  IF TG_OP = 'INSERT' AND (auth.uid() IS NULL OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id)) THEN
    IF NEW.role NOT IN ('vecino', 'repartidor') THEN
      NEW.role := 'vecino';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes modificar el perfil de otra cuenta';
  END IF;

  IF NEW.role NOT IN ('vecino', 'repartidor') THEN
    RAISE EXCEPTION 'No puedes asignarte privilegios de administrador';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'No se puede cambiar el propietario del perfil';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Blindar handle_new_user_profile
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        nombre,
        ciudad,
        role
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'nombre',
            split_part(COALESCE(NEW.email, ''), '@', 1),
            'Vecino'
        ),
        COALESCE(
            NULLIF(LOWER(TRIM(NEW.raw_user_meta_data ->> 'ciudad')), ''),
            'cochabamba'
        ),
        'vecino'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;
