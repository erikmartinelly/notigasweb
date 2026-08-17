-- 049_complete_account_record_purge.sql
-- Garantiza que la eliminación personal o administrativa no deje votos,
-- comentarios, pedidos, rutas ni fichas huérfanas.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uuid uuid := auth.uid();
  v_uid text;
  v_email text;
BEGIN
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_uid := v_uuid::text;
  SELECT LOWER(TRIM(COALESCE(email, ''))) INTO v_email
  FROM auth.users
  WHERE id = v_uuid;

  DELETE FROM public.votos_registro
  WHERE user_id = v_uid
     OR (tipo_entidad = 'aviso' AND entidad_id IN (
          SELECT id FROM public.avisos WHERE user_id = v_uid
        ))
     OR (tipo_entidad = 'comentario' AND entidad_id IN (
          SELECT c.id
          FROM public.comentarios_avisos c
          WHERE c.user_id = v_uid
             OR c.aviso_id IN (SELECT a.id FROM public.avisos a WHERE a.user_id = v_uid)
        ))
     OR (tipo_entidad = 'pedido' AND entidad_id IN (
          SELECT id FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid
        ));

  DELETE FROM public.comentarios_avisos
  WHERE user_id = v_uid
     OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id = v_uid);
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
  DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados
  WHERE user_id = v_uid
     OR (v_email <> '' AND LOWER(TRIM(COALESCE(email, ''))) = v_email);
  DELETE FROM public.profiles WHERE id = v_uuid;

  -- La identidad se elimina al final. Cualquier error anterior revierte todo.
  DELETE FROM auth.users WHERE id = v_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := p_user_id::text;
  v_email text;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  SELECT LOWER(TRIM(COALESCE(email, ''))) INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_credentials
    WHERE LOWER(TRIM(email)) = v_email
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora desde el panel';
  END IF;

  DELETE FROM public.votos_registro
  WHERE user_id = v_uid
     OR (tipo_entidad = 'aviso' AND entidad_id IN (
          SELECT id FROM public.avisos WHERE user_id = v_uid
        ))
     OR (tipo_entidad = 'comentario' AND entidad_id IN (
          SELECT c.id
          FROM public.comentarios_avisos c
          WHERE c.user_id = v_uid
             OR c.aviso_id IN (SELECT a.id FROM public.avisos a WHERE a.user_id = v_uid)
        ))
     OR (tipo_entidad = 'pedido' AND entidad_id IN (
          SELECT id FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid
        ));

  DELETE FROM public.comentarios_avisos
  WHERE user_id = v_uid
     OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id = v_uid);
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
  DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados
  WHERE user_id = v_uid
     OR (v_email <> '' AND LOWER(TRIM(COALESCE(email, ''))) = v_email);
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(uuid) TO authenticated;

COMMIT;
