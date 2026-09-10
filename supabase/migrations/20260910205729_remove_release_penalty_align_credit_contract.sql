-- NOTIGAS Peru: el saldo de crédito se genera exclusivamente por entregas confirmadas.
-- Liberar un pedido no entregado no cobra penalización ni altera el ciclo financiero.
CREATE OR REPLACE FUNCTION public.rpc_driver_release_order(p_order_id uuid, p_motivo text DEFAULT 'no_podre_llegar'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_order record;
  v_driver record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está suspendido'; END IF;

  SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.driver_id<>v_uid AND NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Este pedido no está asignado a tu cuenta';
  END IF;
  IF v_order.estado<>'asignado' THEN
    RAISE EXCEPTION 'Solo se pueden liberar pedidos tomados que estén en estado asignado';
  END IF;
  IF coalesce(v_order.buyer_confirmed_received,false)
     OR coalesce(v_order.driver_confirmed_delivered,false)
     OR v_order.delivery_accounted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya fue confirmado como entregado y no puede liberarse';
  END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id=v_uid
  LIMIT 1;

  PERFORM set_config('notigas.internal_order_mutation','1',true);
  UPDATE public.pedidos
  SET estado='pendiente',
      driver_id=NULL,
      subestado=NULL,
      comision_entrega=0,
      comision_registrada=false,
      driver_reported_not_delivered=false,
      driver_reported_not_delivered_at=NULL,
      delivery_resolution='driver_released_unfulfilled_order',
      updated_at=now()
  WHERE id=p_order_id;

  RETURN jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'estado','pendiente',
    'penalizacion',0,
    'comisiones_pendientes',coalesce(v_driver.comisiones_pendientes,0),
    'message','Pedido liberado. No se generó comisión porque no fue entregado.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_driver_release_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_release_order(uuid,text) TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';