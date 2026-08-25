CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_pedidos_deleted integer := 0;
  v_avisos_deleted integer := 0;
  v_rutas_deleted integer := 0;
  v_comentarios_deleted integer := 0;
  v_mensajes_foro_deleted integer := 0;
BEGIN
  -- 1. Pedidos
  WITH d AS (
    DELETE FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  -- 2. Avisos
  WITH d AS (
    DELETE FROM public.avisos
    WHERE created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_avisos_deleted FROM d;

  -- 3. Comentarios de Avisos
  WITH d AS (
    DELETE FROM public.comentarios_avisos
    WHERE created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_comentarios_deleted FROM d;

  -- 4. Mensajes del Foro
  WITH d AS (
    DELETE FROM public.mensajes_foro
    WHERE created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_mensajes_foro_deleted FROM d;

  -- 5. Rutas (2 horas de inactividad)
  WITH d AS (
    DELETE FROM public.rutas_repartidores
    WHERE last_active < (now() - interval '2 hours')
    RETURNING id
  ) SELECT count(*) INTO v_rutas_deleted FROM d;

  RETURN jsonb_build_object(
    'success', true,
    'pedidos_eliminados', v_pedidos_deleted,
    'avisos_eliminados', v_avisos_deleted,
    'comentarios_eliminados', v_comentarios_deleted,
    'mensajes_foro_eliminados', v_mensajes_foro_deleted,
    'rutas_eliminadas', v_rutas_deleted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.pedidos 
    WHERE created_at < NOW() - INTERVAL '24 hours';

    DELETE FROM public.avisos 
    WHERE created_at < NOW() - INTERVAL '24 hours';

    DELETE FROM public.comentarios_avisos 
    WHERE created_at < NOW() - INTERVAL '24 hours';

    DELETE FROM public.mensajes_foro 
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;
