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
BEGIN
  WITH d AS (
    DELETE FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  WITH d AS (
    DELETE FROM public.avisos
    WHERE created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_avisos_deleted FROM d;

  WITH d AS (
    DELETE FROM public.rutas_repartidores
    WHERE last_active < (now() - interval '2 hours')
    RETURNING id
  ) SELECT count(*) INTO v_rutas_deleted FROM d;

  RETURN jsonb_build_object(
    'success', true,
    'pedidos_eliminados', v_pedidos_deleted,
    'avisos_eliminados', v_avisos_deleted,
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
END;
$$;
