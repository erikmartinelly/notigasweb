-- Reconciliación final de seguridad y ciclo de pedidos NOTIGAS Perú.
CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_user_id uuid:=auth.uid(); v_user_email text:=''; v_role text:=coalesce(auth.jwt()->>'role',session_user);
BEGIN
 IF session_user IN ('postgres','supabase_admin') OR v_role='service_role' THEN RETURN true; END IF;
 IF v_user_id IS NULL THEN RETURN false; END IF;
 SELECT lower(trim(coalesce(email,''))) INTO v_user_email FROM auth.users WHERE id=v_user_id;
 IF v_user_email='' THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.admin_credentials WHERE lower(trim(email))=v_user_email);
END; $$;
REVOKE ALL ON FUNCTION public.is_admin_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_verificar_bloqueo_dispositivo(
 p_device_id text DEFAULT NULL,p_device_fingerprint text DEFAULT NULL,p_dni text DEFAULT NULL,p_placa text DEFAULT NULL,p_telefono text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_banned_row record; v_driver_row record; v_clean_dni text; v_clean_placa text; v_clean_device text; v_clean_fingerprint text; v_clean_telefono text;
BEGIN
 v_clean_device:=NULLIF(trim(p_device_id),''); v_clean_fingerprint:=NULLIF(trim(p_device_fingerprint),'');
 v_clean_dni:=NULLIF(regexp_replace(trim(p_dni),'[^0-9]','','g'),'');
 v_clean_placa:=NULLIF(upper(regexp_replace(trim(p_placa),'[^a-zA-Z0-9]','','g')),'');
 v_clean_telefono:=NULLIF(regexp_replace(trim(p_telefono),'[^0-9]','','g'),'');
 SELECT motivo,dni,placa,device_id,device_fingerprint,telefono INTO v_banned_row FROM public.usuarios_baneados
 WHERE (v_clean_device IS NOT NULL AND device_id=v_clean_device)
    OR (v_clean_fingerprint IS NOT NULL AND device_fingerprint=v_clean_fingerprint)
    OR (v_clean_dni IS NOT NULL AND regexp_replace(coalesce(dni,''),'[^0-9]','','g')=v_clean_dni)
    OR (v_clean_placa IS NOT NULL AND upper(regexp_replace(coalesce(placa,''),'[^a-zA-Z0-9]','','g'))=v_clean_placa)
    OR (v_clean_telefono IS NOT NULL AND regexp_replace(coalesce(telefono,''),'[^0-9]','','g')=v_clean_telefono)
 LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('bloqueado',true,'motivo',coalesce(v_banned_row.motivo,'Acceso suspendido por deuda o sanción.')); END IF;
 SELECT motivo_bloqueo,dni,placa,device_id,device_fingerprint,telefono_whatsapp INTO v_driver_row FROM public.choferes_habilitados
 WHERE bloqueado=true AND (
       (v_clean_device IS NOT NULL AND device_id=v_clean_device)
    OR (v_clean_fingerprint IS NOT NULL AND device_fingerprint=v_clean_fingerprint)
    OR (v_clean_dni IS NOT NULL AND regexp_replace(coalesce(dni,''),'[^0-9]','','g')=v_clean_dni)
    OR (v_clean_placa IS NOT NULL AND upper(regexp_replace(coalesce(placa,''),'[^a-zA-Z0-9]','','g'))=v_clean_placa)
    OR (v_clean_telefono IS NOT NULL AND regexp_replace(coalesce(telefono_whatsapp,''),'[^0-9]','','g')=v_clean_telefono))
 LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('bloqueado',true,'motivo',coalesce(v_driver_row.motivo_bloqueo,'Repartidor suspendido.')); END IF;
 RETURN jsonb_build_object('bloqueado',false,'motivo',NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_verificar_bloqueo_dispositivo(p_device_id text,p_device_fingerprint text,p_dni text,p_placa text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT public.rpc_verificar_bloqueo_dispositivo(p_device_id,p_device_fingerprint,p_dni,p_placa,NULL);
$$;
GRANT EXECUTE ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text,text,text,text,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text,text,text,text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_driver_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
BEGIN
 IF public.is_admin_email() OR current_setting('notigas.internal_driver_finance',true)='1' THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Ficha de repartidor no autorizada'; END IF;
 IF TG_OP='INSERT' THEN
  NEW.estado_verificacion:='aprobado'; NEW.es_premium:=false; NEW.premium_vence_at:=NULL; NEW.comprobante_pago_url:=NULL; NEW.comprobante_fecha:=NULL; NEW.estado_pago_premium:='ninguno';
  NEW.ocr_monto:=NULL; NEW.ocr_app:=NULL; NEW.ocr_operacion:=NULL; NEW.ocr_valido:=false; NEW.ocr_raw_text:=NULL; NEW.tipo_plan:='credito'; NEW.bloqueado:=false; NEW.motivo_bloqueo:=NULL;
  NEW.comisiones_pendientes:=0; NEW.limite_credito:=20; NEW.estado_servicio:='activo'; NEW.ultimo_corte_semanal:=NULL; NEW.total_comisiones_pagadas:=0;
  NEW.promo_pedidos_gratis_total:=0; NEW.promo_pedidos_gratis_usados:=0; NEW.pedidos_credito_ciclo:=0; NEW.pedidos_entregados_total:=0; NEW.comision_por_pedido:=0.20; NEW.limite_pedidos_credito:=100;
  NEW.botellones_credito_ciclo:=0; NEW.botellones_entregados_total:=0; NEW.limite_botellones_credito:=100; RETURN NEW;
 END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion OR NEW.es_premium IS DISTINCT FROM OLD.es_premium OR NEW.premium_vence_at IS DISTINCT FROM OLD.premium_vence_at OR NEW.comprobante_pago_url IS DISTINCT FROM OLD.comprobante_pago_url OR NEW.comprobante_fecha IS DISTINCT FROM OLD.comprobante_fecha OR NEW.estado_pago_premium IS DISTINCT FROM OLD.estado_pago_premium OR NEW.ocr_monto IS DISTINCT FROM OLD.ocr_monto OR NEW.ocr_app IS DISTINCT FROM OLD.ocr_app OR NEW.ocr_operacion IS DISTINCT FROM OLD.ocr_operacion OR NEW.ocr_valido IS DISTINCT FROM OLD.ocr_valido OR NEW.ocr_raw_text IS DISTINCT FROM OLD.ocr_raw_text OR NEW.tipo_plan IS DISTINCT FROM OLD.tipo_plan OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado OR NEW.motivo_bloqueo IS DISTINCT FROM OLD.motivo_bloqueo OR NEW.comisiones_pendientes IS DISTINCT FROM OLD.comisiones_pendientes OR NEW.limite_credito IS DISTINCT FROM OLD.limite_credito OR NEW.estado_servicio IS DISTINCT FROM OLD.estado_servicio OR NEW.ultimo_corte_semanal IS DISTINCT FROM OLD.ultimo_corte_semanal OR NEW.total_comisiones_pagadas IS DISTINCT FROM OLD.total_comisiones_pagadas OR NEW.promo_pedidos_gratis_total IS DISTINCT FROM OLD.promo_pedidos_gratis_total OR NEW.promo_pedidos_gratis_usados IS DISTINCT FROM OLD.promo_pedidos_gratis_usados OR NEW.pedidos_credito_ciclo IS DISTINCT FROM OLD.pedidos_credito_ciclo OR NEW.pedidos_entregados_total IS DISTINCT FROM OLD.pedidos_entregados_total OR NEW.comision_por_pedido IS DISTINCT FROM OLD.comision_por_pedido OR NEW.limite_pedidos_credito IS DISTINCT FROM OLD.limite_pedidos_credito OR NEW.botellones_credito_ciclo IS DISTINCT FROM OLD.botellones_credito_ciclo OR NEW.botellones_entregados_total IS DISTINCT FROM OLD.botellones_entregados_total OR NEW.limite_botellones_credito IS DISTINCT FROM OLD.limite_botellones_credito THEN RAISE EXCEPTION 'Campos financieros o de control son administrados por el servidor'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_driver_verification ON public.choferes_habilitados;
CREATE TRIGGER trg_guard_driver_verification BEFORE INSERT OR UPDATE ON public.choferes_habilitados FOR EACH ROW EXECUTE FUNCTION public.guard_driver_verification();

CREATE OR REPLACE FUNCTION public.guard_pedido_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text;
BEGIN
 IF public.is_admin_email() OR current_setting('notigas.internal_order_mutation',true)='1' THEN RETURN NEW; END IF;
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
 IF OLD.user_id=v_uid THEN
  IF OLD.estado IN ('pendiente','visto') THEN
   IF NEW.estado NOT IN (OLD.estado,'cancelado') THEN RAISE EXCEPTION 'Usa la confirmación de recepción para marcar una entrega'; END IF;
   IF (to_jsonb(NEW)-ARRAY['estado','latitude','longitude','direccion','barrio_otb','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','latitude','longitude','direccion','barrio_otb','updated_at']) THEN RAISE EXCEPTION 'El comprador solo puede mover su ubicación o cancelar el pedido'; END IF;
   RETURN NEW;
  ELSIF OLD.estado='asignado' THEN
   IF NEW.estado NOT IN (OLD.estado,'cancelado') THEN RAISE EXCEPTION 'Usa la confirmación de recepción para marcar una entrega'; END IF;
   IF (to_jsonb(NEW)-ARRAY['estado','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','updated_at']) THEN RAISE EXCEPTION 'El comprador solo puede cancelar el pedido asignado desde esta operación'; END IF;
   RETURN NEW;
  END IF;
  RAISE EXCEPTION 'No se pueden modificar pedidos finalizados';
 END IF;
 IF OLD.driver_id=v_uid THEN
  IF OLD.estado<>'asignado' OR NEW.estado<>OLD.estado THEN RAISE EXCEPTION 'Las transiciones del repartidor deben realizarse mediante el RPC correspondiente'; END IF;
  IF (to_jsonb(NEW)-ARRAY['subestado','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['subestado','updated_at']) THEN RAISE EXCEPTION 'El repartidor solo puede actualizar el estado rápido directamente'; END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Operación no permitida sobre este pedido; utiliza el RPC autorizado';
END; $$;
DROP TRIGGER IF EXISTS trg_guard_pedido_mutation ON public.pedidos;
CREATE TRIGGER trg_guard_pedido_mutation BEFORE UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.guard_pedido_mutation();

CREATE OR REPLACE FUNCTION public.fn_suspend_driver_credit_limit(p_driver_user_id text,p_reason text DEFAULT 'Límite de 100 pedidos a crédito alcanzado. Regulariza S/ 20 por Yape para continuar.')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_driver record; v_email text; v_reason text:=coalesce(nullif(btrim(p_reason),''),'Límite de crédito alcanzado.');
BEGIN
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=p_driver_user_id LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado'; END IF;
 SELECT lower(trim(coalesce(email,''))) INTO v_email FROM auth.users WHERE id=CASE WHEN p_driver_user_id ~* '^[0-9a-f-]{36}$' THEN p_driver_user_id::uuid ELSE NULL END;
 PERFORM set_config('notigas.internal_driver_finance','1',true);
 UPDATE public.choferes_habilitados SET estado_servicio='suspendido_tope',bloqueado=true,motivo_bloqueo=v_reason,estado_verificacion='bloqueado' WHERE id=v_driver.id;
 INSERT INTO public.usuarios_baneados(user_id,email,nombre,placa,telefono,dni,device_id,device_fingerprint,motivo,tipo_baneo,permanente)
 SELECT v_driver.user_id,nullif(v_email,''),v_driver.nombre_completo,v_driver.placa,v_driver.telefono_whatsapp,v_driver.dni,v_driver.device_id,v_driver.device_fingerprint,v_reason,'mora',false
 WHERE NOT EXISTS(SELECT 1 FROM public.usuarios_baneados ub WHERE coalesce(ub.permanente,false)=false AND ub.tipo_baneo='mora' AND ub.user_id=v_driver.user_id);
 DELETE FROM public.rutas_repartidores WHERE user_id=v_driver.user_id;
 INSERT INTO public.pagos_comisiones(user_id,driver_id,monto,metodo,estado,comprobante_url,cobro_generado_at,origen_comprobante)
 SELECT v_driver.user_id,v_driver.id,coalesce(v_driver.comisiones_pendientes,0),'yape','generado',NULL,now(),'ocr_local_sin_imagen'
 WHERE coalesce(v_driver.comisiones_pendientes,0)>0 AND NOT EXISTS(SELECT 1 FROM public.pagos_comisiones pc WHERE pc.user_id=v_driver.user_id AND pc.estado IN ('generado','pendiente','pendiente_revision','requiere_revision','pendiente_verificacion_recepcion'));
 RETURN jsonb_build_object('ok',true,'estado_servicio','suspendido_tope','bloqueado',true,'motivo',v_reason);
END; $$;
REVOKE ALL ON FUNCTION public.fn_suspend_driver_credit_limit(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_suspend_driver_credit_limit(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_contabilizar_entrega_confirmada(p_order_id uuid,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_order record; v_driver record; v_units integer:=1; v_first text; v_orders integer; v_limit integer; v_fee numeric(10,2); v_prev numeric(10,2); v_new numeric(10,2); v_state text; v_dummy jsonb;
BEGIN
 PERFORM set_config('notigas.internal_order_mutation','1',true); PERFORM set_config('notigas.internal_driver_finance','1',true);
 SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF v_order.driver_id IS NULL OR btrim(v_order.driver_id)='' THEN RAISE EXCEPTION 'El pedido no tiene repartidor asignado'; END IF;
 IF coalesce(v_order.comision_registrada,false)=true OR v_order.delivery_accounted_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'already_accounted',true,'comision_cargada',coalesce(v_order.comision_entrega,0),'unidades_contabilizadas',coalesce(v_order.unidades_contabilizadas,0)); END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_order.driver_id LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Ficha del repartidor no encontrada'; END IF;
 v_first:=substring(coalesce(v_order.cantidad,'') from '([0-9]+)'); IF v_first IS NOT NULL THEN BEGIN v_units:=greatest(1,least(v_first::integer,100)); EXCEPTION WHEN OTHERS THEN v_units:=1; END; END IF;
 v_orders:=coalesce(v_driver.pedidos_credito_ciclo,0)+1; v_limit:=coalesce(v_driver.limite_pedidos_credito,100); v_fee:=coalesce(v_driver.comision_por_pedido,0.20); v_prev:=coalesce(v_driver.comisiones_pendientes,0); v_new:=round(v_prev+v_fee,2);
 v_state:=CASE WHEN coalesce(v_driver.estado_servicio,'activo')='baneado' THEN 'baneado' WHEN v_orders>=v_limit OR v_new>=coalesce(v_driver.limite_credito,20) THEN 'suspendido_tope' ELSE 'activo' END;
 UPDATE public.pedidos SET comision_entrega=v_fee,comision_registrada=true,unidades_contabilizadas=v_units,delivery_accounted_at=now(),updated_at=now() WHERE id=p_order_id;
 UPDATE public.choferes_habilitados SET promo_pedidos_gratis_total=0,promo_pedidos_gratis_usados=0,pedidos_credito_ciclo=v_orders,botellones_credito_ciclo=coalesce(botellones_credito_ciclo,0)+v_units,pedidos_entregados_total=coalesce(pedidos_entregados_total,0)+1,botellones_entregados_total=coalesce(botellones_entregados_total,0)+v_units,comisiones_pendientes=v_new,estado_servicio=v_state WHERE id=v_driver.id;
 INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia) VALUES(v_order.driver_id,v_driver.id,'comision_entrega',v_fee,v_prev,v_new,'Comisión S/ 0.20 por pedido confirmado ('||v_units||' unidad/es). Fuente: '||coalesce(p_source,'confirmacion')||' - Pedido ID: '||p_order_id::text);
 IF v_state='suspendido_tope' THEN SELECT public.fn_suspend_driver_credit_limit(v_order.driver_id,'Límite de 100 pedidos a crédito alcanzado (S/ 20). Regulariza la remesa Yape para continuar.') INTO v_dummy; END IF;
 RETURN jsonb_build_object('ok',true,'already_accounted',false,'comision_cargada',v_fee,'unidades_contabilizadas',v_units,'pedidos_credito_ciclo',v_orders,'limite_pedidos_credito',v_limit,'comisiones_pendientes',v_new,'estado_servicio',v_state,'suspendido',(v_state='suspendido_tope'));
END; $$;
REVOKE ALL ON FUNCTION public.fn_contabilizar_entrega_confirmada(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contabilizar_entrega_confirmada(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(p_ciudad text DEFAULT NULL,p_categoria text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.choferes_habilitados ch WHERE ch.user_id=(SELECT auth.uid())::text AND lower(trim(coalesce(ch.estado_verificacion,'')))='aprobado' AND coalesce(ch.bloqueado,false)=false AND coalesce(ch.estado_servicio,'activo')='activo' AND coalesce(ch.pedidos_credito_ciclo,0)<coalesce(ch.limite_pedidos_credito,100) AND coalesce(ch.comisiones_pendientes,0)<coalesce(ch.limite_credito,20) AND (p_ciudad IS NULL OR lower(trim(ch.ciudad))=lower(trim(p_ciudad))) AND (p_categoria IS NOT NULL AND (lower(trim(ch.categoria))=lower(trim(p_categoria)) OR (lower(trim(ch.categoria)) IN ('gas','gas glp','garrafa','glp','balon','balon de gas','balón','balón de gas') AND lower(trim(p_categoria)) IN ('gas','gas glp','garrafa','glp','balon','balon de gas','balón','balón de gas')) OR (lower(trim(ch.categoria)) IN ('agua','agua potable','botellon','botellón') AND lower(trim(p_categoria)) IN ('agua','agua potable','botellon','botellón')))) AND NOT EXISTS(SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id=ch.user_id));
$$;

CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_driver record; v_order record; oc text; dc text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF; IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está baneado o no autorizado'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no es un repartidor habilitado'; END IF;
 IF lower(trim(coalesce(v_driver.estado_verificacion,'')))<>'aprobado' OR coalesce(v_driver.bloqueado,false) OR coalesce(v_driver.estado_servicio,'activo')<>'activo' THEN RAISE EXCEPTION 'Tu cuenta está suspendida y no puede tomar nuevos pedidos'; END IF;
 IF coalesce(v_driver.pedidos_credito_ciclo,0)>=coalesce(v_driver.limite_pedidos_credito,100) OR coalesce(v_driver.comisiones_pendientes,0)>=coalesce(v_driver.limite_credito,20) THEN RAISE EXCEPTION 'Alcanzaste el límite de 100 pedidos a crédito (S/ 20). Regulariza la remesa Yape pendiente para continuar.'; END IF;
 SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF lower(trim(coalesce(v_order.ciudad,'')))<>lower(trim(coalesce(v_driver.ciudad,''))) THEN RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor'; END IF;
 oc:=lower(trim(coalesce(v_order.categoria,''))); dc:=lower(trim(coalesce(v_driver.categoria,'')));
 IF oc ILIKE '%gas%' OR oc ILIKE '%glp%' OR oc ILIKE '%garrafa%' OR oc ILIKE '%balon%' OR oc ILIKE '%balón%' THEN oc:='gas'; ELSIF oc ILIKE '%agua%' OR oc ILIKE '%botell%' THEN oc:='agua'; END IF;
 IF dc ILIKE '%gas%' OR dc ILIKE '%glp%' OR dc ILIKE '%garrafa%' OR dc ILIKE '%balon%' OR dc ILIKE '%balón%' THEN dc:='gas'; ELSIF dc ILIKE '%agua%' OR dc ILIKE '%botell%' THEN dc:='agua'; END IF;
 IF oc<>dc THEN RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor'; END IF;
 IF v_order.estado='asignado' THEN IF v_order.driver_id=v_uid THEN RETURN jsonb_build_object('ok',true,'message','Pedido ya asignado a ti'); ELSE RAISE EXCEPTION 'Este pedido ya fue tomado por otro repartidor'; END IF; END IF;
 IF v_order.estado NOT IN ('pendiente','visto') THEN RAISE EXCEPTION 'El pedido ya no está disponible para asignación'; END IF;
 PERFORM set_config('notigas.internal_order_mutation','1',true); UPDATE public.pedidos SET estado='asignado',driver_id=v_uid,comision_entrega=0,comision_registrada=false,visto=true,updated_at=now() WHERE id=p_order_id;
 RETURN jsonb_build_object('ok',true,'order_id',p_order_id,'estado','asignado','driver_id',v_uid);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_confirm_order_received(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_order record; v_account jsonb; v_conflict boolean:=false;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF; IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está suspendido'; END IF;
 SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF v_order.user_id<>v_uid AND NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: no eres el propietario de este pedido'; END IF; IF v_order.estado='cancelado' THEN RAISE EXCEPTION 'El pedido fue cancelado y no puede confirmarse como recibido'; END IF; IF v_order.driver_id IS NULL THEN RAISE EXCEPTION 'El pedido todavía no tiene repartidor asignado'; END IF;
 v_conflict:=coalesce(v_order.driver_reported_not_delivered,false); PERFORM set_config('notigas.internal_order_mutation','1',true);
 UPDATE public.pedidos SET buyer_confirmed_received=true,buyer_confirmed_at=coalesce(buyer_confirmed_at,now()),estado='entregado',delivery_resolution=CASE WHEN v_conflict THEN 'buyer_override_driver_not_delivered' ELSE 'buyer_confirmed_received' END,updated_at=now() WHERE id=p_order_id;
 SELECT public.fn_contabilizar_entrega_confirmada(p_order_id,CASE WHEN v_conflict THEN 'comprador_prioridad_sobre_repartidor' ELSE 'comprador' END) INTO v_account;
 INSERT INTO public.notificaciones_repartidor(user_id,pedido_id,tipo,titulo,mensaje) VALUES(v_order.driver_id,p_order_id,CASE WHEN v_conflict THEN 'comprador_confirma_contradiccion' ELSE 'comprador_confirma_entrega' END,'Entrega confirmada por el comprador','El comprador confirmó la recepción. La entrega quedó registrada en tu contabilidad.');
 RETURN jsonb_build_object('ok',true,'success',true,'estado','entregado','buyer_priority_applied',v_conflict,'accounting',v_account);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_driver_confirm_delivery(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_order record; v_account jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF; IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está suspendido'; END IF;
 SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF v_order.driver_id<>v_uid AND NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: este pedido no está asignado a tu cuenta'; END IF; IF v_order.estado='cancelado' THEN RAISE EXCEPTION 'El pedido fue cancelado'; END IF; IF v_order.estado NOT IN ('asignado','entregado') THEN RAISE EXCEPTION 'El pedido no está en un estado confirmable'; END IF;
 PERFORM set_config('notigas.internal_order_mutation','1',true); UPDATE public.pedidos SET driver_confirmed_delivered=true,driver_confirmed_at=coalesce(driver_confirmed_at,now()),estado='entregado',delivery_resolution=CASE WHEN coalesce(buyer_confirmed_received,false) THEN 'buyer_and_driver_confirmed' WHEN coalesce(driver_reported_not_delivered,false) THEN 'driver_confirmed_after_not_delivered_report' ELSE 'driver_confirmed_delivered' END,updated_at=now() WHERE id=p_order_id;
 SELECT public.fn_contabilizar_entrega_confirmada(p_order_id,'repartidor') INTO v_account;
 RETURN jsonb_build_object('ok',true,'order_id',p_order_id,'estado','entregado','confirmed_by','driver','accounting',v_account,'comision_cargada',coalesce((v_account->>'comision_cargada')::numeric,0),'unidades_contabilizadas',coalesce((v_account->>'unidades_contabilizadas')::integer,0),'comisiones_pendientes',coalesce((v_account->>'comisiones_pendientes')::numeric,0),'suspendido',coalesce((v_account->>'suspendido')::boolean,false));
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_driver_release_order(p_order_id uuid,p_motivo text DEFAULT 'no_podre_llegar')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_order record; v_driver record; v_prev numeric(10,2); v_penalty numeric(10,2):=0.10; v_new numeric(10,2);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF; IF public.is_banned() THEN RAISE EXCEPTION 'El usuario está suspendido'; END IF;
 SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF v_order.driver_id<>v_uid AND NOT public.is_admin_email() THEN RAISE EXCEPTION 'Este pedido no está asignado a tu cuenta'; END IF; IF v_order.estado<>'asignado' THEN RAISE EXCEPTION 'Solo se pueden liberar pedidos tomados que estén en estado asignado'; END IF;
 IF coalesce(v_order.buyer_confirmed_received,false) OR coalesce(v_order.driver_confirmed_delivered,false) OR v_order.delivery_accounted_at IS NOT NULL THEN RAISE EXCEPTION 'El pedido ya fue confirmado como entregado y no puede liberarse'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1 FOR UPDATE; v_prev:=coalesce(v_driver.comisiones_pendientes,0); v_new:=round(v_prev+v_penalty,2);
 PERFORM set_config('notigas.internal_driver_finance','1',true); UPDATE public.choferes_habilitados SET comisiones_pendientes=v_new WHERE id=v_driver.id;
 INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia) VALUES(v_uid,v_driver.id,'penalizacion_cancelacion',v_penalty,v_prev,v_new,'Penalización S/ 0.10 por liberar un pedido ya tomado. Motivo: '||coalesce(nullif(btrim(p_motivo),''),'no indicado')||' - Pedido ID: '||p_order_id::text);
 PERFORM set_config('notigas.internal_order_mutation','1',true); UPDATE public.pedidos SET estado='pendiente',driver_id=NULL,subestado=NULL,comision_entrega=0,comision_registrada=false,driver_reported_not_delivered=false,driver_reported_not_delivered_at=NULL,delivery_resolution='driver_cancelled_assigned_order',updated_at=now() WHERE id=p_order_id;
 RETURN jsonb_build_object('ok',true,'order_id',p_order_id,'estado','pendiente','penalizacion',v_penalty,'comisiones_pendientes',v_new);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_driver_report_not_delivered(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_order record;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF; SELECT * INTO v_order FROM public.pedidos WHERE id=p_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF v_order.driver_id<>v_uid THEN RAISE EXCEPTION 'Este pedido no está asignado a tu cuenta'; END IF; IF v_order.estado IN ('entregado','cancelado') OR coalesce(v_order.buyer_confirmed_received,false) THEN RAISE EXCEPTION 'El pedido ya fue finalizado'; END IF;
 PERFORM set_config('notigas.internal_order_mutation','1',true); UPDATE public.pedidos SET driver_reported_not_delivered=true,driver_reported_not_delivered_at=now(),delivery_resolution='driver_reported_not_delivered_pending_buyer',updated_at=now() WHERE id=p_order_id;
 RETURN jsonb_build_object('ok',true,'order_id',p_order_id,'estado',v_order.estado);
END; $$;

REVOKE ALL ON FUNCTION public.rpc_assign_order(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_confirm_order_received(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_driver_confirm_delivery(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_driver_release_order(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_driver_report_not_delivered(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_order_received(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_driver_release_order(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_driver_report_not_delivered(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.is_current_driver_premium() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,auth AS $$ SELECT false; $$;
DO $$ DECLARE r record; BEGIN
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname IN ('corte_semanal_domingos','baneo_semanal_lunes') LOOP PERFORM cron.unschedule(r.jobid); END LOOP;
 END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='vouchers-comisiones') THEN UPDATE storage.buckets SET public=false WHERE id='vouchers-comisiones'; END IF;
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='vouchers-premium') THEN UPDATE storage.buckets SET public=false WHERE id='vouchers-premium'; END IF;
END $$;
DROP POLICY IF EXISTS "Vouchers Comisiones Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Vouchers Premium Public Read" ON storage.objects;
NOTIFY pgrst,'reload schema';