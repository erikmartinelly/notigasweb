-- NOTIGAS: política única de comisión para repartidores.
-- 100 pedidos confirmados sin comisión; luego S/ 0.20 por balón.
-- El único ciclo de crédito es S/ 50 (250 balones cobrables). No hay escalones.

BEGIN;

ALTER TABLE public.choferes_habilitados
  ALTER COLUMN promo_pedidos_gratis_total SET DEFAULT 100,
  ALTER COLUMN promo_pedidos_gratis_usados SET DEFAULT 0,
  ALTER COLUMN limite_credito SET DEFAULT 50.00,
  ALTER COLUMN limite_pedidos_credito SET DEFAULT 250,
  ALTER COLUMN comision_por_pedido SET DEFAULT 0.20;

CREATE OR REPLACE FUNCTION public.fn_credit_limit_for_remittances(p_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT 50.00::numeric;
$$;
REVOKE ALL ON FUNCTION public.fn_credit_limit_for_remittances(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_order_limit_for_credit(p_credit numeric, p_fee numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT 250;
$$;
REVOKE ALL ON FUNCTION public.fn_order_limit_for_credit(numeric,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_driver_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  IF public.is_admin_email() OR current_setting('notigas.internal_driver_finance',true)='1' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Ficha de repartidor no autorizada';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.estado_verificacion:='aprobado'; NEW.es_premium:=false; NEW.premium_vence_at:=NULL;
    NEW.comprobante_pago_url:=NULL; NEW.comprobante_fecha:=NULL; NEW.estado_pago_premium:='ninguno';
    NEW.ocr_monto:=NULL; NEW.ocr_app:=NULL; NEW.ocr_operacion:=NULL; NEW.ocr_valido:=false;
    NEW.ocr_raw_text:=NULL; NEW.tipo_plan:='credito'; NEW.bloqueado:=false; NEW.motivo_bloqueo:=NULL;
    NEW.comisiones_pendientes:=0; NEW.limite_credito:=50.00; NEW.estado_servicio:='activo';
    NEW.ultimo_corte_semanal:=NULL; NEW.total_comisiones_pagadas:=0;
    NEW.promo_pedidos_gratis_total:=100; NEW.promo_pedidos_gratis_usados:=0;
    NEW.pedidos_credito_ciclo:=0; NEW.pedidos_entregados_total:=0; NEW.comision_por_pedido:=0.20;
    NEW.limite_pedidos_credito:=250; NEW.botellones_credito_ciclo:=0;
    NEW.botellones_entregados_total:=0; NEW.limite_botellones_credito:=250;
    NEW.remesas_confirmadas:=0;
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion
     OR NEW.es_premium IS DISTINCT FROM OLD.es_premium
     OR NEW.premium_vence_at IS DISTINCT FROM OLD.premium_vence_at
     OR NEW.comprobante_pago_url IS DISTINCT FROM OLD.comprobante_pago_url
     OR NEW.comprobante_fecha IS DISTINCT FROM OLD.comprobante_fecha
     OR NEW.estado_pago_premium IS DISTINCT FROM OLD.estado_pago_premium
     OR NEW.ocr_monto IS DISTINCT FROM OLD.ocr_monto
     OR NEW.ocr_app IS DISTINCT FROM OLD.ocr_app
     OR NEW.ocr_operacion IS DISTINCT FROM OLD.ocr_operacion
     OR NEW.ocr_valido IS DISTINCT FROM OLD.ocr_valido
     OR NEW.ocr_raw_text IS DISTINCT FROM OLD.ocr_raw_text
     OR NEW.tipo_plan IS DISTINCT FROM OLD.tipo_plan
     OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado
     OR NEW.motivo_bloqueo IS DISTINCT FROM OLD.motivo_bloqueo
     OR NEW.comisiones_pendientes IS DISTINCT FROM OLD.comisiones_pendientes
     OR NEW.limite_credito IS DISTINCT FROM OLD.limite_credito
     OR NEW.estado_servicio IS DISTINCT FROM OLD.estado_servicio
     OR NEW.ultimo_corte_semanal IS DISTINCT FROM OLD.ultimo_corte_semanal
     OR NEW.total_comisiones_pagadas IS DISTINCT FROM OLD.total_comisiones_pagadas
     OR NEW.promo_pedidos_gratis_total IS DISTINCT FROM OLD.promo_pedidos_gratis_total
     OR NEW.promo_pedidos_gratis_usados IS DISTINCT FROM OLD.promo_pedidos_gratis_usados
     OR NEW.pedidos_credito_ciclo IS DISTINCT FROM OLD.pedidos_credito_ciclo
     OR NEW.pedidos_entregados_total IS DISTINCT FROM OLD.pedidos_entregados_total
     OR NEW.comision_por_pedido IS DISTINCT FROM OLD.comision_por_pedido
     OR NEW.limite_pedidos_credito IS DISTINCT FROM OLD.limite_pedidos_credito
     OR NEW.botellones_credito_ciclo IS DISTINCT FROM OLD.botellones_credito_ciclo
     OR NEW.botellones_entregados_total IS DISTINCT FROM OLD.botellones_entregados_total
     OR NEW.limite_botellones_credito IS DISTINCT FROM OLD.limite_botellones_credito
     OR NEW.remesas_confirmadas IS DISTINCT FROM OLD.remesas_confirmadas THEN
    RAISE EXCEPTION 'Campos financieros o de control son administrados por el servidor';
  END IF;
  RETURN NEW;
END;
$$;

-- Normaliza los ciclos existentes sin reactivar bloqueos administrativos permanentes.
SELECT set_config('notigas.internal_driver_finance','1',true);
UPDATE public.choferes_habilitados ch
SET promo_pedidos_gratis_total=100,
    promo_pedidos_gratis_usados=greatest(coalesce(ch.promo_pedidos_gratis_usados,0),0),
    limite_credito=50.00,
    limite_pedidos_credito=250,
    limite_botellones_credito=250,
    comision_por_pedido=0.20,
    comisiones_pendientes=least(greatest(coalesce(ch.comisiones_pendientes,0),0),50.00),
    estado_servicio=CASE WHEN coalesce(ch.comisiones_pendientes,0)>=50 THEN 'suspendido_tope' ELSE 'activo' END,
    bloqueado=(coalesce(ch.comisiones_pendientes,0)>=50),
    motivo_bloqueo=CASE WHEN coalesce(ch.comisiones_pendientes,0)>=50 THEN 'Pago fijo de S/ 50 pendiente para continuar.' ELSE NULL END,
    estado_verificacion='aprobado'
WHERE coalesce(ch.estado_servicio,'activo')<>'baneado'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub
    WHERE coalesce(ub.permanente,false)=true
      AND (ub.user_id=ch.user_id
        OR (ub.dni IS NOT NULL AND ch.dni IS NOT NULL AND ub.dni=ch.dni)
        OR (ub.device_id IS NOT NULL AND ch.device_id IS NOT NULL AND ub.device_id=ch.device_id)
        OR (ub.device_fingerprint IS NOT NULL AND ch.device_fingerprint IS NOT NULL AND ub.device_fingerprint=ch.device_fingerprint))
  );

DELETE FROM public.usuarios_baneados ub
USING public.choferes_habilitados ch
WHERE ub.user_id=ch.user_id
  AND ub.tipo_baneo='mora'
  AND coalesce(ub.permanente,false)=false
  AND coalesce(ch.comisiones_pendientes,0)<50;

CREATE OR REPLACE FUNCTION public.fn_suspend_driver_credit_limit(
  p_driver_user_id text,
  p_reason text DEFAULT 'Alcanzaste el ciclo fijo de S/ 50. Regulariza la remesa Yape para continuar.'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
DECLARE v_driver record; v_email text; v_reason text:=coalesce(nullif(btrim(p_reason),''),'Pago fijo de S/ 50 pendiente para continuar.');
BEGIN
  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=p_driver_user_id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado'; END IF;
  SELECT lower(trim(coalesce(email,''))) INTO v_email FROM auth.users
  WHERE id=CASE WHEN p_driver_user_id ~* '^[0-9a-f-]{36}$' THEN p_driver_user_id::uuid ELSE NULL END;
  PERFORM set_config('notigas.internal_driver_finance','1',true);
  UPDATE public.choferes_habilitados
  SET estado_servicio='suspendido_tope', bloqueado=true, motivo_bloqueo=v_reason, estado_verificacion='aprobado',
      limite_credito=50.00, limite_pedidos_credito=250, comisiones_pendientes=50.00
  WHERE id=v_driver.id;
  DELETE FROM public.usuarios_baneados
  WHERE coalesce(permanente,false)=false AND tipo_baneo='mora' AND user_id=v_driver.user_id;
  INSERT INTO public.usuarios_baneados(user_id,email,nombre,placa,telefono,dni,device_id,device_fingerprint,motivo,tipo_baneo,permanente)
  VALUES(v_driver.user_id,nullif(v_email,''),v_driver.nombre_completo,v_driver.placa,v_driver.telefono_whatsapp,v_driver.dni,v_driver.device_id,v_driver.device_fingerprint,v_reason,'mora',false);
  DELETE FROM public.rutas_repartidores WHERE user_id=v_driver.user_id;
  UPDATE public.pagos_comisiones SET monto=50.00
  WHERE user_id=v_driver.user_id AND estado='generado';
  INSERT INTO public.pagos_comisiones(user_id,driver_id,monto,metodo,estado,comprobante_url,cobro_generado_at,origen_comprobante)
  SELECT v_driver.user_id,v_driver.id,50.00,'yape','generado',NULL,now(),'ocr_local_sin_imagen'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pagos_comisiones pc
    WHERE pc.user_id=v_driver.user_id
      AND pc.estado IN ('generado','pendiente','pendiente_revision','requiere_revision','pendiente_verificacion_recepcion')
  );
  RETURN jsonb_build_object('ok',true,'estado_servicio','suspendido_tope','bloqueado',true,'monto_pendiente',50.00,'motivo',v_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_suspend_driver_credit_limit(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_suspend_driver_credit_limit(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_generar_cobro_comisiones()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_uid text:=auth.uid()::text; v_driver record; v_pago record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
  IF coalesce(v_driver.promo_pedidos_gratis_usados,0) < 100 THEN
    RAISE EXCEPTION 'Aún estás dentro de tus 100 pedidos promocionales gratuitos';
  END IF;
  IF coalesce(v_driver.comisiones_pendientes,0) < 50
     AND coalesce(v_driver.pedidos_credito_ciclo,0) < 250 THEN
    RAISE EXCEPTION 'La remesa fija de S/ 50 se solicita al completar 250 balones cobrables';
  END IF;
  UPDATE public.pagos_comisiones SET monto=50.00
  WHERE user_id=v_uid AND estado='generado';
  SELECT * INTO v_pago FROM public.pagos_comisiones
  WHERE user_id=v_uid AND estado IN ('generado','requiere_revision','pendiente_revision','pendiente','pendiente_verificacion_recepcion')
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'monto',v_pago.monto,'cobro_generado_at',v_pago.cobro_generado_at,'estado',v_pago.estado,'existente',true);
  END IF;
  INSERT INTO public.pagos_comisiones(user_id,driver_id,monto,metodo,estado,comprobante_url,cobro_generado_at,origen_comprobante)
  VALUES(v_uid,v_driver.id,50.00,'yape','generado',NULL,now(),'ocr_local_sin_imagen')
  RETURNING * INTO v_pago;
  RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'monto',v_pago.monto,'cobro_generado_at',v_pago.cobro_generado_at,'estado',v_pago.estado,'existente',false,'limite_credito',50.00,'limite_pedidos_credito',250);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_generar_cobro_comisiones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_generar_cobro_comisiones() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(p_ciudad text DEFAULT NULL,p_categoria text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public,auth,pg_temp
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id=(SELECT auth.uid())::text
      AND lower(trim(coalesce(ch.estado_verificacion,'')))='aprobado'
      AND coalesce(ch.bloqueado,false)=false
      AND coalesce(ch.estado_servicio,'activo')='activo'
      AND coalesce(ch.pedidos_credito_ciclo,0)<250
      AND coalesce(ch.comisiones_pendientes,0)<50
      AND (p_ciudad IS NULL OR lower(trim(ch.ciudad))=lower(trim(p_ciudad)))
      AND (p_categoria IS NOT NULL AND (
        lower(trim(ch.categoria))=lower(trim(p_categoria))
        OR (lower(trim(ch.categoria)) IN ('gas','gas glp','garrafa','glp','balon','balon de gas','balón','balón de gas') AND lower(trim(p_categoria)) IN ('gas','gas glp','garrafa','glp','balon','balon de gas','balón','balón de gas'))
        OR (lower(trim(ch.categoria)) IN ('agua','agua potable','botellon','botellón') AND lower(trim(p_categoria)) IN ('agua','agua potable','botellon','botellón'))
      ))
      AND NOT EXISTS(SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id=ch.user_id)
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_enabled_driver(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE v_uid text:=auth.uid()::text; v_driver record; v_order record; oc text; dc text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está baneado o no autorizado'; END IF;
  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no es un repartidor habilitado'; END IF;
  IF lower(trim(coalesce(v_driver.estado_verificacion,'')))<>'aprobado'
     OR coalesce(v_driver.bloqueado,false)
     OR coalesce(v_driver.estado_servicio,'activo')<>'activo' THEN
    RAISE EXCEPTION 'Tu cuenta está bloqueada hasta que se confirme el pago fijo de S/ 50';
  END IF;
  IF coalesce(v_driver.pedidos_credito_ciclo,0)>=250 OR coalesce(v_driver.comisiones_pendientes,0)>=50 THEN
    RAISE EXCEPTION 'Alcanzaste el ciclo fijo de 250 balones cobrables (S/ 50). Regulariza la remesa Yape para continuar.';
  END IF;
  SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF lower(trim(coalesce(v_order.ciudad,'')))<>lower(trim(coalesce(v_driver.ciudad,''))) THEN RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor'; END IF;
  oc:=lower(trim(coalesce(v_order.categoria,''))); dc:=lower(trim(coalesce(v_driver.categoria,'')));
  IF oc ILIKE '%gas%' OR oc ILIKE '%glp%' OR oc ILIKE '%garrafa%' OR oc ILIKE '%balon%' OR oc ILIKE '%balón%' THEN oc:='gas'; ELSIF oc ILIKE '%agua%' OR oc ILIKE '%botell%' THEN oc:='agua'; END IF;
  IF dc ILIKE '%gas%' OR dc ILIKE '%glp%' OR dc ILIKE '%garrafa%' OR dc ILIKE '%balon%' OR dc ILIKE '%balón%' THEN dc:='gas'; ELSIF dc ILIKE '%agua%' OR dc ILIKE '%botell%' THEN dc:='agua'; END IF;
  IF oc<>dc THEN RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor'; END IF;
  IF v_order.estado='asignado' THEN
    IF v_order.driver_id=v_uid THEN RETURN jsonb_build_object('ok',true,'message','Pedido ya asignado a ti'); END IF;
    RAISE EXCEPTION 'Este pedido ya fue tomado por otro repartidor';
  END IF;
  IF v_order.estado NOT IN ('pendiente','visto') THEN RAISE EXCEPTION 'El pedido ya no está disponible para asignación'; END IF;
  PERFORM set_config('notigas.internal_order_mutation','1',true);
  UPDATE public.pedidos SET estado='asignado',driver_id=v_uid,comision_entrega=0,comision_registrada=false,visto=true,updated_at=now() WHERE id=p_order_id;
  RETURN jsonb_build_object('ok',true,'order_id',p_order_id,'estado','asignado','driver_id',v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_assign_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

-- La promoción se mide por pedido confirmado; después de ella la comisión se
-- calcula por balón entregado. El aviso de inicio solo se emite en el pedido 101.
CREATE OR REPLACE FUNCTION public.fn_contabilizar_entrega_confirmada(p_order_id uuid, p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_order record; v_driver record; v_units integer:=1; v_first text;
  v_free_total integer; v_free_used integer; v_free_new integer;
  v_units_cycle integer; v_limit integer; v_unit_fee numeric(10,2); v_fee numeric(10,2);
  v_prev numeric(10,2); v_new numeric(10,2); v_credit_limit numeric(10,2);
  v_state text; v_dummy jsonb; v_is_free boolean:=false; v_start_notice boolean:=false;
BEGIN
  PERFORM set_config('notigas.internal_order_mutation','1',true);
  PERFORM set_config('notigas.internal_driver_finance','1',true);
  SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_order.driver_id IS NULL OR btrim(v_order.driver_id)='' THEN RAISE EXCEPTION 'El pedido no tiene repartidor asignado'; END IF;
  IF coalesce(v_order.comision_registrada,false)=true OR v_order.delivery_accounted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already_accounted',true,'comision_cargada',coalesce(v_order.comision_entrega,0),'unidades_contabilizadas',coalesce(v_order.unidades_contabilizadas,0));
  END IF;
  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_order.driver_id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha del repartidor no encontrada'; END IF;
  v_first:=substring(coalesce(v_order.cantidad,'') from '([0-9]+)');
  IF v_first IS NOT NULL THEN
    BEGIN v_units:=greatest(1,least(v_first::integer,100)); EXCEPTION WHEN OTHERS THEN v_units:=1; END;
  END IF;
  v_free_total:=greatest(coalesce(v_driver.promo_pedidos_gratis_total,100),100);
  v_free_used:=greatest(coalesce(v_driver.promo_pedidos_gratis_usados,0),0);
  v_prev:=coalesce(v_driver.comisiones_pendientes,0);
  v_credit_limit:=50.00;
  v_unit_fee:=coalesce(v_driver.comision_por_pedido,0.20);
  v_limit:=250;
  IF v_free_used < v_free_total THEN
    v_is_free:=true;
    v_fee:=0.00;
    v_new:=v_prev;
    v_units_cycle:=coalesce(v_driver.pedidos_credito_ciclo,0);
    v_free_new:=v_free_used+1;
  ELSE
    v_free_new:=v_free_used;
    v_units_cycle:=coalesce(v_driver.pedidos_credito_ciclo,0)+v_units;
    v_fee:=round(v_unit_fee*v_units,2);
    v_new:=round(v_prev+v_fee,2);
    v_start_notice:=coalesce(v_driver.pedidos_entregados_total,0)=v_free_total;
  END IF;
  v_state:=CASE
    WHEN coalesce(v_driver.estado_servicio,'activo')='baneado' THEN 'baneado'
    WHEN NOT v_is_free AND (v_units_cycle>=v_limit OR v_new>=v_credit_limit) THEN 'suspendido_tope'
    ELSE 'activo'
  END;
  UPDATE public.pedidos
  SET comision_entrega=v_fee, comision_registrada=true, unidades_contabilizadas=v_units,
      delivery_accounted_at=now(), updated_at=now()
  WHERE id=p_order_id;
  UPDATE public.choferes_habilitados
  SET promo_pedidos_gratis_total=v_free_total,
      promo_pedidos_gratis_usados=v_free_new,
      pedidos_credito_ciclo=v_units_cycle,
      limite_pedidos_credito=v_limit,
      limite_credito=v_credit_limit,
      botellones_credito_ciclo=coalesce(botellones_credito_ciclo,0)+v_units,
      pedidos_entregados_total=coalesce(pedidos_entregados_total,0)+1,
      botellones_entregados_total=coalesce(botellones_entregados_total,0)+v_units,
      comisiones_pendientes=v_new,
      estado_servicio=v_state
  WHERE id=v_driver.id;
  INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia)
  VALUES(
    v_order.driver_id,v_driver.id,
    CASE WHEN v_is_free THEN 'promo_entrega_gratis' ELSE 'comision_entrega' END,
    v_fee,v_prev,v_new,
    CASE WHEN v_is_free THEN 'Pedido promocional gratuito '||v_free_new||' de '||v_free_total||'. Pedido ID: '||p_order_id::text
         ELSE 'Comisión S/ 0.20 por balón confirmado ('||v_units||' balón/es). Fuente: '||coalesce(p_source,'confirmacion')||' - Pedido ID: '||p_order_id::text END
  );
  IF v_state='suspendido_tope' THEN
    SELECT public.fn_suspend_driver_credit_limit(v_order.driver_id,'Alcanzaste el ciclo fijo de S/ 50. Regulariza la remesa Yape para continuar.') INTO v_dummy;
  END IF;
  RETURN jsonb_build_object(
    'ok',true,'already_accounted',false,'pedido_gratis',v_is_free,
    'aviso_inicio_cobro',v_start_notice,'promo_usados',v_free_new,'promo_total',v_free_total,
    'promo_restantes',greatest(v_free_total-v_free_new,0),'comision_cargada',v_fee,
    'comision_por_balon',v_unit_fee,'unidades_contabilizadas',v_units,
    'pedidos_credito_ciclo',v_units_cycle,'limite_pedidos_credito',v_limit,
    'limite_credito',v_credit_limit,'comisiones_pendientes',v_new,
    'estado_servicio',v_state,'suspendido',(v_state='suspendido_tope')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.fn_contabilizar_entrega_confirmada(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contabilizar_entrega_confirmada(uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
