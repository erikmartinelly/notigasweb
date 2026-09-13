CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uuid uuid := auth.uid();
  v_uid text;
  v_email text;
BEGIN
  IF v_uuid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_uid := v_uuid::text;
  SELECT lower(trim(coalesce(email,''))) INTO v_email
  FROM auth.users WHERE id=v_uuid;

  DELETE FROM public.votos_registro
  WHERE user_id=v_uid
     OR (tipo_entidad='aviso' AND entidad_id IN (SELECT id FROM public.avisos WHERE user_id=v_uid))
     OR (tipo_entidad='comentario' AND entidad_id IN (
          SELECT c.id FROM public.comentarios_avisos c
          WHERE c.user_id=v_uid OR c.aviso_id IN (SELECT a.id FROM public.avisos a WHERE a.user_id=v_uid)
        ))
     OR (tipo_entidad='pedido' AND entidad_id IN (
          SELECT id FROM public.pedidos WHERE user_id=v_uid OR driver_id=v_uid
        ));

  DELETE FROM public.comentarios_avisos
  WHERE user_id=v_uid OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id=v_uid);
  DELETE FROM public.avisos WHERE user_id=v_uid;
  DELETE FROM public.pedidos WHERE user_id=v_uid OR driver_id=v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id=v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id=v_uid;
  DELETE FROM public.denuncias WHERE user_id=v_uid OR denunciante_id=v_uid OR denunciado_id=v_uid;
  DELETE FROM public.reportes_spam WHERE user_id=v_uid;

  -- Los anuncios globales son administrados por el sistema y no tienen user_id.
  -- Las suspensiones temporales desaparecen con la cuenta; los bloqueos permanentes
  -- por fraude/hardware se conservan para impedir re-registro abusivo.
  DELETE FROM public.usuarios_baneados
  WHERE coalesce(permanente,false)=false
    AND (user_id=v_uid OR (v_email<>'' AND lower(trim(coalesce(email,'')))=v_email));

  DELETE FROM public.profiles WHERE id=v_uuid;
  DELETE FROM auth.users WHERE id=v_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
