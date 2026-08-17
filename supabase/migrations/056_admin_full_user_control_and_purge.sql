-- Migration 056: Control total de administración sobre usuarios registrados, borrado robusto y purga de datos antiguos
BEGIN;

-- 1. Optimizar is_admin_email() para verificar superusuario, service_role, JWT y auth.users
CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_email text := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  v_user_id uuid := auth.uid();
  v_user_email text := '';
BEGIN
  -- Permiso total a roles administrativos de PostgreSQL / Supabase
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN true;
  END IF;

  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, ''))) INTO v_user_email
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

-- 2. Función robusta para eliminar usuarios por ID (UUID o texto) o por Correo Electrónico
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id text, p_email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := TRIM(COALESCE(p_user_id, ''));
  v_email text := LOWER(TRIM(COALESCE(p_email, '')));
  v_target_uuid uuid := NULL;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  -- 1. Determinar UUID objetivo si tiene formato válido
  IF v_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_uuid := v_uid::uuid;
  END IF;

  -- Si no teníamos UUID o no coincidió, buscar por email
  IF v_target_uuid IS NULL AND v_email <> '' THEN
    SELECT id INTO v_target_uuid FROM auth.users WHERE LOWER(TRIM(email)) = v_email LIMIT 1;
    IF v_target_uuid IS NOT NULL THEN
      v_uid := v_target_uuid::text;
    END IF;
  END IF;

  -- Obtener email si tenemos UUID
  IF v_target_uuid IS NOT NULL AND v_email = '' THEN
    SELECT LOWER(TRIM(COALESCE(email, ''))) INTO v_email FROM auth.users WHERE id = v_target_uuid;
  END IF;

  -- Proteger cuentas de administradores
  IF v_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_email
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora desde el panel';
  END IF;

  -- 2. Limpieza exhaustiva en cascada de todas las tablas con columnas existentes
  IF v_uid <> '' THEN
    DELETE FROM public.votos_registro
    WHERE user_id = v_uid
       OR (tipo_entidad = 'aviso' AND entidad_id IN (SELECT id FROM public.avisos WHERE user_id = v_uid))
       OR (tipo_entidad = 'comentario' AND entidad_id IN (SELECT id FROM public.comentarios_avisos WHERE user_id = v_uid))
       OR (tipo_entidad = 'pedido' AND entidad_id IN (SELECT id FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid));

    DELETE FROM public.comentarios_avisos
    WHERE user_id = v_uid
       OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id = v_uid);

    DELETE FROM public.avisos WHERE user_id = v_uid;
    DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
    DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
    DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
    DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
    DELETE FROM public.reportes_spam WHERE user_id = v_uid;
    DELETE FROM public.usuarios_baneados WHERE user_id = v_uid;
  END IF;

  IF v_email <> '' THEN
    DELETE FROM public.usuarios_baneados WHERE LOWER(TRIM(COALESCE(email, ''))) = v_email;
    DELETE FROM public.choferes_habilitados WHERE LOWER(TRIM(COALESCE(user_id, ''))) = v_email;
  END IF;

  IF v_target_uuid IS NOT NULL THEN
    DELETE FROM public.profiles WHERE id = v_target_uuid;
    DELETE FROM auth.users WHERE id = v_target_uuid;
  END IF;
END;
$$;

-- Sobrecarga para llamadas con UUID
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.rpc_admin_delete_user(p_user_id::text, NULL);
END;
$$;

-- 3. Función para eliminar repartidor por su ID de chofer
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_driver_by_id(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id text;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  SELECT user_id INTO v_user_id FROM public.choferes_habilitados WHERE id = p_driver_id;

  DELETE FROM public.choferes_habilitados WHERE id = p_driver_id;

  IF v_user_id IS NOT NULL AND v_user_id <> '' THEN
    PERFORM public.rpc_admin_delete_user(v_user_id, NULL);
  END IF;
END;
$$;

-- 4. Permisos
REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_driver_by_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_driver_by_id(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated;

COMMIT;
