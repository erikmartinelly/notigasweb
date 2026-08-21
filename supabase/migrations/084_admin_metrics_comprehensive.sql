-- ==============================================================================
-- MIGRACIÓN 084: RPC PARA MÉTRICAS ADMINISTRATIVAS COMPLETAS
-- (Incluye Pedidos Entregados, Cancelados, Avisos y Usuarios/Repartidores Denunciados)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_get_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_users_count bigint := 0;
  v_vendors_count bigint := 0;
  v_orders_active bigint := 0;
  v_orders_delivered bigint := 0;
  v_orders_cancelled bigint := 0;
  v_avisos_count bigint := 0;
  v_reports_count bigint := 0;
  v_reported_entities_count bigint := 0;
BEGIN
  IF NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT count(*) INTO v_users_count FROM public.profiles;
  SELECT count(*) INTO v_vendors_count FROM public.choferes_habilitados WHERE LOWER(TRIM(COALESCE(estado_verificacion, ''))) = 'aprobado';
  SELECT count(*) INTO v_orders_active FROM public.pedidos WHERE estado IN ('pendiente', 'visto', 'asignado');
  SELECT count(*) INTO v_orders_delivered FROM public.pedidos WHERE estado IN ('entregado', 'recibido');
  SELECT count(*) INTO v_orders_cancelled FROM public.pedidos WHERE estado = 'cancelado';
  SELECT count(*) INTO v_avisos_count FROM public.avisos;
  SELECT count(*) INTO v_reports_count FROM public.denuncias;
  
  -- Conteo de usuarios o repartidores únicos que han sido denunciados
  SELECT count(DISTINCT COALESCE(NULLIF(TRIM(denunciado_id), ''), NULLIF(TRIM(user_id), '')))
  INTO v_reported_entities_count
  FROM public.denuncias
  WHERE COALESCE(NULLIF(TRIM(denunciado_id), ''), NULLIF(TRIM(user_id), '')) IS NOT NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'users_count', v_users_count,
    'vendors_count', v_vendors_count,
    'orders_active', v_orders_active,
    'orders_delivered', v_orders_delivered,
    'orders_cancelled', v_orders_cancelled,
    'avisos_count', v_avisos_count,
    'reports_count', v_reports_count,
    'reported_entities_count', v_reported_entities_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_admin_get_metrics() TO authenticated;
