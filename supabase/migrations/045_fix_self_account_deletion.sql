-- 045_fix_self_account_deletion.sql
-- Corrige la eliminación personal completa y evita respuestas de éxito falsas.

BEGIN;

-- Compatibilidad con instalaciones creadas por las primeras migraciones.
ALTER TABLE public.denuncias ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.reportes_spam ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS email text;

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

  -- Primero se eliminan los registros dependientes y de moderación.
  DELETE FROM public.votos_registro WHERE user_id = v_uid;
  DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
  DELETE FROM public.denuncias
  WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados
  WHERE user_id = v_uid
     OR (v_email <> '' AND LOWER(TRIM(COALESCE(email, ''))) = v_email);
  DELETE FROM public.profiles WHERE id = v_uuid;

  -- La identidad se elimina al final; si algo anterior falla, toda la transacción revierte.
  DELETE FROM auth.users WHERE id = v_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

COMMIT;
