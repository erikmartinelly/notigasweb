-- 046_admin_delete_robust_and_auth_integrity.sql
-- Optimiza la eliminación de usuarios y repartidores por administradores y fortalece la integridad de perfiles.

BEGIN;

-- 1. Actualizar rpc_admin_delete_user para eliminación limpia y en cascada
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := p_user_id::text;
  v_email text;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  SELECT LOWER(TRIM(COALESCE(u.email, ''))) INTO v_email
  FROM auth.users u WHERE u.id = p_user_id;

  IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM public.admin_credentials ac WHERE LOWER(TRIM(ac.email)) = v_email) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora desde el panel';
  END IF;

  -- Eliminar datos relacionados en tablas públicas
  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
  DELETE FROM public.votos_registro WHERE user_id = v_uid;
  DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados WHERE user_id = v_uid OR (v_email IS NOT NULL AND LOWER(TRIM(COALESCE(email, ''))) = v_email);
  DELETE FROM public.profiles WHERE id = p_user_id;
  
  -- Eliminar de auth.users si existe
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$function$;

-- 2. Función auxiliar para eliminar chofer directamente por su ID de tabla choferes_habilitados
CREATE OR REPLACE FUNCTION public.rpc_admin_delete_driver_by_id(p_driver_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id text;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  SELECT user_id INTO v_user_id FROM public.choferes_habilitados WHERE id = p_driver_id;

  DELETE FROM public.choferes_habilitados WHERE id = p_driver_id;

  IF v_user_id IS NOT NULL AND v_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM public.rpc_admin_delete_user(v_user_id::uuid);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_driver_by_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_driver_by_id(uuid) TO authenticated;

COMMIT;
