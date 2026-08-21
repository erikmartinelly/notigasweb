-- ==============================================================================
-- MIGRACIÓN 079: PURGA AUTOMÁTICA DE PEDIDOS TERMINALES Y CIERRE ESTRICTO DE CATEGORÍAS
-- ==============================================================================

-- 1. Actualizar rpc_purge_old_records para limpiar de inmediato pedidos cancelados y entregados
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
  -- Eliminar de inmediato todos los pedidos cancelados, entregados o recibidos para no acumular basura
  WITH d AS (
    DELETE FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  -- Eliminar avisos comunitarios con más de 48h
  WITH d AS (
    DELETE FROM public.avisos
    WHERE created_at < (now() - interval '48 hours')
    RETURNING id
  ) SELECT count(*) INTO v_avisos_deleted FROM d;

  -- Eliminar rutas inactivas de repartidores (> 2 horas)
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

GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO anon, authenticated;

-- 2. Limpieza inmediata de pedidos terminales huérfanos acumulados en la base de datos
DELETE FROM public.pedidos
WHERE estado IN ('entregado', 'cancelado', 'recibido');
