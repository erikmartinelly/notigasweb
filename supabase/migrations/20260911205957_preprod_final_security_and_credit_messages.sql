-- NOTIGAS preproducción: cierre de hallazgos finales antes de producción.
-- 1) Auxiliares SECURITY DEFINER ya no son endpoints públicos anónimos.
-- 2) Policies RLS evitan sesiones Auth anónimas y usan initplans eficientes.
-- 3) rpc_assign_order informa el límite dinámico real (S/20 -> S/50 -> S/100).

REVOKE ALL ON FUNCTION public.is_admin_email() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_banned() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_current_enabled_driver(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text,text) TO authenticated;

DROP POLICY IF EXISTS admin_credentials_select_own ON public.admin_credentials;
CREATE POLICY admin_credentials_select_own ON public.admin_credentials
FOR SELECT TO authenticated
USING (
  lower(trim(email)) = lower(trim(coalesce(((select auth.jwt())->>'email'), '')))
  AND coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false
);

DROP POLICY IF EXISTS usuarios_roles_select_own_or_admin ON public.usuarios_roles;
CREATE POLICY usuarios_roles_select_own_or_admin ON public.usuarios_roles
FOR SELECT TO authenticated
USING (
  coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false
  AND (
    lower(trim(email)) = lower(trim(coalesce(((select auth.jwt())->>'email'), '')))
    OR (select public.is_admin_email())
  )
);

CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid text:=auth.uid()::text;
  v_driver record;
  v_order record;
  oc text;
  dc text;
  v_limit_orders integer;
  v_limit_credit numeric(10,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está baneado o no autorizado'; END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id=v_uid
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no es un repartidor habilitado'; END IF;

  IF lower(trim(coalesce(v_driver.estado_verificacion,'')))<>'aprobado'
     OR coalesce(v_driver.bloqueado,false)
     OR coalesce(v_driver.estado_servicio,'activo')<>'activo' THEN
    RAISE EXCEPTION 'Tu cuenta está suspendida y no puede tomar nuevos pedidos';
  END IF;

  v_limit_orders := coalesce(v_driver.limite_pedidos_credito,100);
  v_limit_credit := coalesce(v_driver.limite_credito,20.00);
  IF coalesce(v_driver.pedidos_credito_ciclo,0)>=v_limit_orders
     OR coalesce(v_driver.comisiones_pendientes,0)>=v_limit_credit THEN
    RAISE EXCEPTION 'Alcanzaste tu límite de crédito: % pedidos cobrables / S/ %. Regulariza la remesa Yape pendiente para continuar.',
      v_limit_orders, trim(to_char(v_limit_credit,'FM999990.00'));
  END IF;

  SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF lower(trim(coalesce(v_order.ciudad,'')))<>lower(trim(coalesce(v_driver.ciudad,''))) THEN
    RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
  END IF;

  oc:=lower(trim(coalesce(v_order.categoria,'')));
  dc:=lower(trim(coalesce(v_driver.categoria,'')));
  IF oc ILIKE '%gas%' OR oc ILIKE '%glp%' OR oc ILIKE '%garrafa%' OR oc ILIKE '%balon%' OR oc ILIKE '%balón%' THEN oc:='gas';
  ELSIF oc ILIKE '%agua%' OR oc ILIKE '%botell%' THEN oc:='agua'; END IF;
  IF dc ILIKE '%gas%' OR dc ILIKE '%glp%' OR dc ILIKE '%garrafa%' OR dc ILIKE '%balon%' OR dc ILIKE '%balón%' THEN dc:='gas';
  ELSIF dc ILIKE '%agua%' OR dc ILIKE '%botell%' THEN dc:='agua'; END IF;
  IF oc<>dc THEN RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor'; END IF;

  IF v_order.estado='asignado' THEN
    IF v_order.driver_id=v_uid THEN
      RETURN jsonb_build_object('ok',true,'message','Pedido ya asignado a ti');
    ELSE
      RAISE EXCEPTION 'Este pedido ya fue tomado por otro repartidor';
    END IF;
  END IF;
  IF v_order.estado NOT IN ('pendiente','visto') THEN
    RAISE EXCEPTION 'El pedido ya no está disponible para asignación';
  END IF;

  PERFORM set_config('notigas.internal_order_mutation','1',true);
  UPDATE public.pedidos
  SET estado='asignado',driver_id=v_uid,comision_entrega=0,comision_registrada=false,visto=true,updated_at=now()
  WHERE id=p_order_id;

  RETURN jsonb_build_object('ok',true,'order_id',p_order_id,'estado','asignado','driver_id',v_uid);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_assign_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
