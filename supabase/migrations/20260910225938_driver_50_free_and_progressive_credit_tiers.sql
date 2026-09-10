-- NOTIGAS Peru
-- Promoción: primeros 50 pedidos confirmados sin comisión.
-- Luego S/ 0.20 por pedido. Primer ciclo: 100 pedidos cobrables = S/ 20.
-- Tras la 1.ª remesa: crédito S/ 50 (250 pedidos). La 2.ª mantiene S/ 50.
-- Tras la 3.ª remesa: crédito S/ 100 (500 pedidos), tope máximo.

ALTER TABLE public.choferes_habilitados
  ADD COLUMN IF NOT EXISTS remesas_confirmadas integer NOT NULL DEFAULT 0;

ALTER TABLE public.choferes_habilitados
  ALTER COLUMN promo_pedidos_gratis_total SET DEFAULT 50,
  ALTER COLUMN promo_pedidos_gratis_usados SET DEFAULT 0,
  ALTER COLUMN limite_credito SET DEFAULT 20.00,
  ALTER COLUMN limite_pedidos_credito SET DEFAULT 100,
  ALTER COLUMN comision_por_pedido SET DEFAULT 0.20;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='choferes_remesas_confirmadas_nonnegative'
      AND conrelid='public.choferes_habilitados'::regclass
  ) THEN
    ALTER TABLE public.choferes_habilitados
      ADD CONSTRAINT choferes_remesas_confirmadas_nonnegative CHECK (remesas_confirmadas >= 0);
  END IF;
END $$;

UPDATE public.choferes_habilitados
SET promo_pedidos_gratis_total=50,
    promo_pedidos_gratis_usados=0,
    limite_credito=20.00,
    limite_pedidos_credito=100,
    comision_por_pedido=0.20,
    remesas_confirmadas=0
WHERE coalesce(pedidos_entregados_total,0)=0
  AND coalesce(comisiones_pendientes,0)=0
  AND coalesce(total_comisiones_pagadas,0)=0;

CREATE OR REPLACE FUNCTION public.fn_credit_limit_for_remittances(p_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path=public,pg_temp
AS $$
  SELECT CASE
    WHEN coalesce(p_count,0) >= 3 THEN 100.00::numeric
    WHEN coalesce(p_count,0) >= 1 THEN 50.00::numeric
    ELSE 20.00::numeric
  END;
$$;
REVOKE ALL ON FUNCTION public.fn_credit_limit_for_remittances(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_order_limit_for_credit(p_credit numeric, p_fee numeric)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path=public,pg_temp
AS $$
  SELECT greatest(1, ceil(coalesce(p_credit,20.00) / greatest(coalesce(p_fee,0.20),0.01))::integer);
$$;
REVOKE ALL ON FUNCTION public.fn_order_limit_for_credit(numeric,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_driver_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
 IF public.is_admin_email() OR current_setting('notigas.internal_driver_finance',true)='1' THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Ficha de repartidor no autorizada'; END IF;
 IF TG_OP='INSERT' THEN
  NEW.estado_verificacion:='aprobado'; NEW.es_premium:=false; NEW.premium_vence_at:=NULL; NEW.comprobante_pago_url:=NULL; NEW.comprobante_fecha:=NULL; NEW.estado_pago_premium:='ninguno';
  NEW.ocr_monto:=NULL; NEW.ocr_app:=NULL; NEW.ocr_operacion:=NULL; NEW.ocr_valido:=false; NEW.ocr_raw_text:=NULL; NEW.tipo_plan:='credito'; NEW.bloqueado:=false; NEW.motivo_bloqueo:=NULL;
  NEW.comisiones_pendientes:=0; NEW.limite_credito:=20.00; NEW.estado_servicio:='activo'; NEW.ultimo_corte_semanal:=NULL; NEW.total_comisiones_pagadas:=0;
  NEW.promo_pedidos_gratis_total:=50; NEW.promo_pedidos_gratis_usados:=0; NEW.pedidos_credito_ciclo:=0; NEW.pedidos_entregados_total:=0; NEW.comision_por_pedido:=0.20; NEW.limite_pedidos_credito:=100;
  NEW.botellones_credito_ciclo:=0; NEW.botellones_entregados_total:=0; NEW.limite_botellones_credito:=100; NEW.remesas_confirmadas:=0; RETURN NEW;
 END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion OR NEW.es_premium IS DISTINCT FROM OLD.es_premium OR NEW.premium_vence_at IS DISTINCT FROM OLD.premium_vence_at OR NEW.comprobante_pago_url IS DISTINCT FROM OLD.comprobante_pago_url OR NEW.comprobante_fecha IS DISTINCT FROM OLD.comprobante_fecha OR NEW.estado_pago_premium IS DISTINCT FROM OLD.estado_pago_premium OR NEW.ocr_monto IS DISTINCT FROM OLD.ocr_monto OR NEW.ocr_app IS DISTINCT FROM OLD.ocr_app OR NEW.ocr_operacion IS DISTINCT FROM OLD.ocr_operacion OR NEW.ocr_valido IS DISTINCT FROM OLD.ocr_valido OR NEW.ocr_raw_text IS DISTINCT FROM OLD.ocr_raw_text OR NEW.tipo_plan IS DISTINCT FROM OLD.tipo_plan OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado OR NEW.motivo_bloqueo IS DISTINCT FROM OLD.motivo_bloqueo OR NEW.comisiones_pendientes IS DISTINCT FROM OLD.comisiones_pendientes OR NEW.limite_credito IS DISTINCT FROM OLD.limite_credito OR NEW.estado_servicio IS DISTINCT FROM OLD.estado_servicio OR NEW.ultimo_corte_semanal IS DISTINCT FROM OLD.ultimo_corte_semanal OR NEW.total_comisiones_pagadas IS DISTINCT FROM OLD.total_comisiones_pagadas OR NEW.promo_pedidos_gratis_total IS DISTINCT FROM OLD.promo_pedidos_gratis_total OR NEW.promo_pedidos_gratis_usados IS DISTINCT FROM OLD.promo_pedidos_gratis_usados OR NEW.pedidos_credito_ciclo IS DISTINCT FROM OLD.pedidos_credito_ciclo OR NEW.pedidos_entregados_total IS DISTINCT FROM OLD.pedidos_entregados_total OR NEW.comision_por_pedido IS DISTINCT FROM OLD.comision_por_pedido OR NEW.limite_pedidos_credito IS DISTINCT FROM OLD.limite_pedidos_credito OR NEW.botellones_credito_ciclo IS DISTINCT FROM OLD.botellones_credito_ciclo OR NEW.botellones_entregados_total IS DISTINCT FROM OLD.botellones_entregados_total OR NEW.limite_botellones_credito IS DISTINCT FROM OLD.limite_botellones_credito OR NEW.remesas_confirmadas IS DISTINCT FROM OLD.remesas_confirmadas THEN RAISE EXCEPTION 'Campos financieros o de control son administrados por el servidor'; END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_contabilizar_entrega_confirmada(p_order_id uuid, p_source text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_order record; v_driver record; v_units integer:=1; v_first text;
  v_free_total integer; v_free_used integer; v_free_new integer;
  v_orders integer; v_limit integer; v_fee numeric(10,2); v_prev numeric(10,2); v_new numeric(10,2);
  v_credit_limit numeric(10,2); v_state text; v_dummy jsonb; v_is_free boolean:=false;
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
 IF v_first IS NOT NULL THEN BEGIN v_units:=greatest(1,least(v_first::integer,100)); EXCEPTION WHEN OTHERS THEN v_units:=1; END; END IF;
 v_free_total:=greatest(coalesce(v_driver.promo_pedidos_gratis_total,50),50);
 v_free_used:=greatest(coalesce(v_driver.promo_pedidos_gratis_usados,0),0);
 v_prev:=coalesce(v_driver.comisiones_pendientes,0);
 v_credit_limit:=public.fn_credit_limit_for_remittances(coalesce(v_driver.remesas_confirmadas,0));
 v_fee:=coalesce(v_driver.comision_por_pedido,0.20);
 v_limit:=public.fn_order_limit_for_credit(v_credit_limit,v_fee);
 IF v_free_used < v_free_total THEN
   v_is_free:=true;
   v_fee:=0.00;
   v_new:=v_prev;
   v_orders:=coalesce(v_driver.pedidos_credito_ciclo,0);
   v_free_new:=v_free_used+1;
   v_state:=CASE WHEN coalesce(v_driver.estado_servicio,'activo')='baneado' THEN 'baneado' ELSE coalesce(v_driver.estado_servicio,'activo') END;
 ELSE
   v_free_new:=v_free_used;
   v_orders:=coalesce(v_driver.pedidos_credito_ciclo,0)+1;
   v_new:=round(v_prev+v_fee,2);
   v_state:=CASE
     WHEN coalesce(v_driver.estado_servicio,'activo')='baneado' THEN 'baneado'
     WHEN v_orders>=v_limit OR v_new>=v_credit_limit THEN 'suspendido_tope'
     ELSE 'activo'
   END;
 END IF;
 UPDATE public.pedidos SET comision_entrega=v_fee,comision_registrada=true,unidades_contabilizadas=v_units,delivery_accounted_at=now(),updated_at=now() WHERE id=p_order_id;
 UPDATE public.choferes_habilitados
 SET promo_pedidos_gratis_total=v_free_total,
     promo_pedidos_gratis_usados=v_free_new,
     pedidos_credito_ciclo=v_orders,
     limite_pedidos_credito=v_limit,
     limite_credito=v_credit_limit,
     botellones_credito_ciclo=coalesce(botellones_credito_ciclo,0)+v_units,
     pedidos_entregados_total=coalesce(pedidos_entregados_total,0)+1,
     botellones_entregados_total=coalesce(botellones_entregados_total,0)+v_units,
     comisiones_pendientes=v_new,
     estado_servicio=v_state
 WHERE id=v_driver.id;
 INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia)
 VALUES(v_order.driver_id,v_driver.id,CASE WHEN v_is_free THEN 'promo_entrega_gratis' ELSE 'comision_entrega' END,v_fee,v_prev,v_new,
   CASE WHEN v_is_free THEN 'Pedido promocional gratuito '||v_free_new||' de '||v_free_total||'. Pedido ID: '||p_order_id::text
        ELSE 'Comisión S/ 0.20 por pedido confirmado. Fuente: '||coalesce(p_source,'confirmacion')||' - Pedido ID: '||p_order_id::text END);
 IF v_state='suspendido_tope' THEN
   SELECT public.fn_suspend_driver_credit_limit(v_order.driver_id,'Límite de crédito alcanzado: '||v_limit||' pedidos cobrables / S/ '||trim(to_char(v_credit_limit,'FM999990.00'))||'. Regulariza la remesa Yape para continuar.') INTO v_dummy;
 END IF;
 RETURN jsonb_build_object('ok',true,'already_accounted',false,'pedido_gratis',v_is_free,'promo_usados',v_free_new,'promo_total',v_free_total,'promo_restantes',greatest(v_free_total-v_free_new,0),'comision_cargada',v_fee,'unidades_contabilizadas',v_units,'pedidos_credito_ciclo',v_orders,'limite_pedidos_credito',v_limit,'limite_credito',v_credit_limit,'comisiones_pendientes',v_new,'estado_servicio',v_state,'suspendido',(v_state='suspendido_tope'));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_contabilizar_entrega_confirmada(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_liquidar_comisiones_chofer(p_driver_id text, p_monto numeric DEFAULT NULL::numeric, p_referencia text DEFAULT 'Pago Yape'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_driver record; v_prev numeric(10,2); v_abono numeric(10,2); v_new numeric(10,2); v_perm boolean:=false;
  v_reset boolean; v_full_payment boolean; v_remesas integer; v_credit_limit numeric(10,2); v_order_limit integer;
BEGIN
 IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=p_driver_id OR id::text=p_driver_id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado'; END IF;
 v_prev:=coalesce(v_driver.comisiones_pendientes,0);
 v_abono:=CASE WHEN p_monto IS NULL OR p_monto<=0 THEN v_prev ELSE least(p_monto,v_prev) END;
 v_new:=greatest(0,v_prev-v_abono);
 v_reset:=(v_new=0);
 v_full_payment:=(v_prev>0 AND v_abono>0 AND v_new=0);
 v_remesas:=coalesce(v_driver.remesas_confirmadas,0)+CASE WHEN v_full_payment THEN 1 ELSE 0 END;
 v_credit_limit:=public.fn_credit_limit_for_remittances(v_remesas);
 v_order_limit:=public.fn_order_limit_for_credit(v_credit_limit,coalesce(v_driver.comision_por_pedido,0.20));
 SELECT EXISTS(SELECT 1 FROM public.usuarios_baneados ub WHERE coalesce(ub.permanente,false)=true AND (ub.user_id=v_driver.user_id OR (ub.dni IS NOT NULL AND v_driver.dni IS NOT NULL AND ub.dni=v_driver.dni) OR (ub.device_id IS NOT NULL AND v_driver.device_id IS NOT NULL AND ub.device_id=v_driver.device_id) OR (ub.device_fingerprint IS NOT NULL AND v_driver.device_fingerprint IS NOT NULL AND ub.device_fingerprint=v_driver.device_fingerprint))) INTO v_perm;
 PERFORM set_config('notigas.internal_driver_finance','1',true);
 UPDATE public.choferes_habilitados SET comisiones_pendientes=v_new,total_comisiones_pagadas=coalesce(total_comisiones_pagadas,0)+v_abono,remesas_confirmadas=v_remesas,limite_credito=v_credit_limit,limite_pedidos_credito=v_order_limit,pedidos_credito_ciclo=CASE WHEN v_full_payment THEN 0 ELSE pedidos_credito_ciclo END,botellones_credito_ciclo=CASE WHEN v_full_payment THEN 0 ELSE botellones_credito_ciclo END,estado_servicio=CASE WHEN v_perm THEN 'baneado' WHEN v_full_payment THEN 'activo' ELSE estado_servicio END,bloqueado=v_perm,motivo_bloqueo=CASE WHEN v_perm THEN motivo_bloqueo WHEN v_full_payment THEN NULL ELSE motivo_bloqueo END,estado_verificacion=CASE WHEN v_perm THEN 'bloqueado' ELSE 'aprobado' END WHERE id=v_driver.id;
 IF v_full_payment THEN DELETE FROM public.usuarios_baneados WHERE coalesce(permanente,false)=false AND tipo_baneo='mora' AND user_id=v_driver.user_id; END IF;
 INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia) VALUES(v_driver.user_id,v_driver.id,'pago_yape',v_abono,v_prev,v_new,p_referencia);
 RETURN jsonb_build_object('ok',true,'saldo_anterior',v_prev,'abono',v_abono,'saldo_nuevo',v_new,'remesas_confirmadas',v_remesas,'limite_credito',v_credit_limit,'limite_pedidos_credito',v_order_limit,'reactivado',(NOT v_perm AND v_full_payment));
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_liquidar_comisiones_chofer(text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_liquidar_comisiones_chofer(text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_generar_cobro_comisiones()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid text:=auth.uid()::text; v_driver record; v_pago record; v_monto numeric(10,2);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
 SELECT * INTO v_pago FROM public.pagos_comisiones WHERE user_id=v_uid AND estado IN ('generado','requiere_revision','pendiente_revision','pendiente','pendiente_verificacion_recepcion') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'monto',v_pago.monto,'cobro_generado_at',v_pago.cobro_generado_at,'estado',v_pago.estado,'existente',true); END IF;
 IF coalesce(v_driver.promo_pedidos_gratis_usados,0) < coalesce(v_driver.promo_pedidos_gratis_total,50) THEN RAISE EXCEPTION 'Aún estás dentro de tus 50 pedidos promocionales gratuitos'; END IF;
 IF coalesce(v_driver.pedidos_credito_ciclo,0) < coalesce(v_driver.limite_pedidos_credito,100) AND coalesce(v_driver.comisiones_pendientes,0) < coalesce(v_driver.limite_credito,20.00) THEN RAISE EXCEPTION 'La remesa se solicita al completar tu ciclo de crédito'; END IF;
 v_monto:=coalesce(v_driver.comisiones_pendientes,0);
 IF v_monto<=0 THEN RAISE EXCEPTION 'No tienes comisiones pendientes para pagar'; END IF;
 INSERT INTO public.pagos_comisiones(user_id,driver_id,monto,metodo,estado,comprobante_url,cobro_generado_at,origen_comprobante) VALUES(v_uid,v_driver.id,v_monto,'yape','generado',NULL,now(),'ocr_local_sin_imagen') RETURNING * INTO v_pago;
 RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'monto',v_pago.monto,'cobro_generado_at',v_pago.cobro_generado_at,'estado',v_pago.estado,'existente',false,'remesas_confirmadas',coalesce(v_driver.remesas_confirmadas,0),'limite_credito',v_driver.limite_credito,'limite_pedidos_credito',v_driver.limite_pedidos_credito);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_generar_cobro_comisiones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_generar_cobro_comisiones() TO authenticated;
