CREATE OR REPLACE FUNCTION public.rpc_crear_aviso_vecinal(
  p_ciudad text DEFAULT 'lima'::text,
  p_barrio text DEFAULT 'Global'::text,
  p_autor text DEFAULT 'Vecino'::text,
  p_tipo text DEFAULT 'aviso'::text,
  p_categoria text DEFAULT 'COMENTARIO'::text,
  p_titulo text DEFAULT ''::text,
  p_descripcion text DEFAULT ''::text,
  p_mensaje text DEFAULT ''::text,
  p_imagen text DEFAULT ''::text,
  p_barrio_otb text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_id uuid;
  v_barrio_final text;
  v_ciudad_final text;
BEGIN
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'Usuario no autenticado');
  END IF;
  IF public.is_banned() THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'Usuario suspendido');
  END IF;

  v_barrio_final := COALESCE(NULLIF(TRIM(p_barrio_otb), ''), NULLIF(TRIM(p_barrio), ''), 'Global');
  v_ciudad_final := COALESCE(NULLIF(LOWER(TRIM(p_ciudad)), ''), 'lima');

  INSERT INTO public.avisos(
    user_id, ciudad, barrio_otb, autor, tipo, categoria, titulo, descripcion,
    mensaje, activo, votos, created_at
  ) VALUES (
    v_uid,
    v_ciudad_final,
    v_barrio_final,
    COALESCE(NULLIF(TRIM(p_autor), ''), 'Vecino de la OTB'),
    COALESCE(NULLIF(TRIM(p_tipo), ''), 'aviso'),
    COALESCE(NULLIF(UPPER(TRIM(p_categoria)), ''), 'COMENTARIO'),
    COALESCE(NULLIF(TRIM(p_titulo), ''), 'Aviso Vecinal'),
    COALESCE(NULLIF(TRIM(p_descripcion), ''), NULLIF(TRIM(p_mensaje), ''), 'Publicación vecinal'),
    COALESCE(NULLIF(TRIM(p_mensaje), ''), NULLIF(TRIM(p_descripcion), ''), ''),
    true,
    1,
    now()
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_crear_aviso_vecinal(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text,text,text,text,text,text,text,text,text,text) TO authenticated, service_role;
