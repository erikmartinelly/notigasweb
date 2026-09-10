-- Reconciliación final del flujo Yape Perú. Sin BOB en contrato ni vistas administrativas.
CREATE OR REPLACE FUNCTION public.rpc_get_payment_instructions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
 SELECT * INTO v_row FROM public.config_pagos WHERE id=1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'configured',false); END IF;
 RETURN jsonb_build_object('ok',true,'configured',true,'pais_destino',v_row.pais_destino,'beneficiario_nombre',v_row.beneficiario_nombre,'beneficiario_documento',v_row.beneficiario_documento,'metodo_entrega',v_row.metodo_entrega,'numero_cuenta',v_row.numero_cuenta);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_actualizar_yape_chofer(p_yape text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_yape text:=regexp_replace(coalesce(p_yape,''),'[^0-9]','','g');
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
 IF length(v_yape)<>9 OR left(v_yape,1)<>'9' THEN RAISE EXCEPTION 'El número Yape Perú debe tener 9 dígitos y comenzar en 9'; END IF;
 UPDATE public.choferes_habilitados SET yape_numero=v_yape WHERE user_id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
 RETURN jsonb_build_object('ok',true,'yape_numero',v_yape);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_generar_cobro_comisiones()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid text:=auth.uid()::text; v_driver record; v_pago record; v_monto numeric(10,2);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
 SELECT * INTO v_pago FROM public.pagos_comisiones
 WHERE user_id=v_uid AND estado IN ('generado','requiere_revision','pendiente_revision','pendiente','pendiente_verificacion_recepcion')
 ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'monto',v_pago.monto,'cobro_generado_at',v_pago.cobro_generado_at,'estado',v_pago.estado,'existente',true); END IF;
 v_monto:=least(coalesce(v_driver.comisiones_pendientes,0),coalesce(v_driver.limite_credito,20.00));
 IF v_monto<=0 THEN RAISE EXCEPTION 'No tienes comisiones pendientes para pagar'; END IF;
 INSERT INTO public.pagos_comisiones(user_id,driver_id,monto,metodo,estado,comprobante_url,cobro_generado_at,origen_comprobante)
 VALUES(v_uid,v_driver.id,v_monto,'yape','generado',NULL,now(),'ocr_local_sin_imagen') RETURNING * INTO v_pago;
 RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'monto',v_pago.monto,'cobro_generado_at',v_pago.cobro_generado_at,'estado',v_pago.estado,'existente',false);
END; $$;

DROP FUNCTION IF EXISTS public.rpc_registrar_ocr_pago(uuid,numeric,numeric,timestamptz,text,text,text,text,text,text,text,numeric);
CREATE OR REPLACE FUNCTION public.rpc_registrar_ocr_pago(
 p_pago_id uuid,p_monto_enviado_pen numeric,p_fecha_pago timestamptz,p_numero_transaccion text,
 p_destinatario_nombre text DEFAULT NULL,p_destinatario_yape text DEFAULT NULL,p_remitente_nombre text DEFAULT NULL,
 p_remitente_dni text DEFAULT NULL,p_remitente_yape text DEFAULT NULL,p_device_id text DEFAULT NULL,p_ocr_confianza numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE
 v_uid text:=auth.uid()::text; v_pago record; v_driver record; v_cfg record; v_tx text:=nullif(btrim(p_numero_transaccion),'');
 v_monto_ok boolean:=false; v_fecha_ok boolean:=false; v_tx_ok boolean:=false; v_dest_name_match boolean; v_dest_yape_match boolean;
 v_dni_match boolean; v_nombre_match boolean; v_yape_match boolean; v_device_match boolean; v_ocr_ok boolean:=false; v_estado text;
 v_expected_yape text; v_expected_name text; v_read_name text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
 SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cobro no encontrado'; END IF;
 IF v_pago.user_id<>v_uid THEN RAISE EXCEPTION 'Este cobro no pertenece a tu cuenta'; END IF;
 IF v_pago.estado IN ('confirmado','fraude_confirmado') THEN RAISE EXCEPTION 'Este pago ya fue cerrado'; END IF;
 IF v_tx IS NULL THEN RAISE EXCEPTION 'No se detectó número de transacción'; END IF;
 IF p_fecha_pago IS NULL THEN RAISE EXCEPTION 'No se detectó fecha y hora del pago'; END IF;
 IF p_monto_enviado_pen IS NULL THEN RAISE EXCEPTION 'No se detectó el monto pagado en soles'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
 SELECT * INTO v_cfg FROM public.config_pagos WHERE id=1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Datos de recepción no configurados'; END IF;
 v_monto_ok:=abs(p_monto_enviado_pen-v_pago.monto)<=0.05;
 v_fecha_ok:=p_fecha_pago>=coalesce(v_pago.cobro_generado_at,v_pago.created_at) AND p_fecha_pago<=now()+interval '5 minutes';
 v_tx_ok:=NOT EXISTS(SELECT 1 FROM public.pagos_comisiones pc WHERE pc.id<>v_pago.id AND coalesce(nullif(btrim(pc.numero_transaccion),''),nullif(btrim(pc.ocr_operacion),'')) IS NOT NULL AND lower(coalesce(nullif(btrim(pc.numero_transaccion),''),nullif(btrim(pc.ocr_operacion),'')))=lower(v_tx));
 v_expected_name:=lower(regexp_replace(translate(coalesce(v_cfg.beneficiario_nombre,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'));
 v_read_name:=lower(regexp_replace(translate(coalesce(p_destinatario_nombre,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'));
 IF v_expected_name='' OR v_read_name='' THEN v_dest_name_match:=NULL; ELSE v_dest_name_match:=v_read_name=v_expected_name; END IF;
 IF nullif(regexp_replace(coalesce(p_destinatario_yape,''),'[^0-9]','','g'),'') IS NULL OR nullif(regexp_replace(coalesce(v_cfg.numero_cuenta,''),'[^0-9]','','g'),'') IS NULL THEN v_dest_yape_match:=NULL; ELSE v_dest_yape_match:=regexp_replace(p_destinatario_yape,'[^0-9]','','g')=regexp_replace(v_cfg.numero_cuenta,'[^0-9]','','g'); END IF;
 IF nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),'') IS NULL OR nullif(regexp_replace(coalesce(v_driver.dni,''),'[^0-9]','','g'),'') IS NULL THEN v_dni_match:=NULL; ELSE v_dni_match:=regexp_replace(p_remitente_dni,'[^0-9]','','g')=regexp_replace(v_driver.dni,'[^0-9]','','g'); END IF;
 IF nullif(btrim(coalesce(p_remitente_nombre,'')),'') IS NULL OR nullif(btrim(coalesce(v_driver.nombre_completo,'')),'') IS NULL THEN v_nombre_match:=NULL; ELSE v_nombre_match:=lower(regexp_replace(translate(p_remitente_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(translate(v_driver.nombre_completo,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g')); END IF;
 v_expected_yape:=nullif(regexp_replace(coalesce(v_driver.yape_numero,''),'[^0-9]','','g'),'');
 IF nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),'') IS NULL OR v_expected_yape IS NULL THEN v_yape_match:=NULL; ELSE v_yape_match:=regexp_replace(p_remitente_yape,'[^0-9]','','g')=v_expected_yape; END IF;
 IF nullif(btrim(coalesce(p_device_id,'')),'') IS NULL OR nullif(btrim(coalesce(v_driver.device_id,'')),'') IS NULL THEN v_device_match:=NULL; ELSE v_device_match:=btrim(p_device_id)=btrim(v_driver.device_id); END IF;
 v_ocr_ok:=v_monto_ok AND v_fecha_ok AND v_tx_ok AND coalesce(v_dest_name_match,true) AND coalesce(v_dest_yape_match,true) AND coalesce(v_dni_match,true) AND coalesce(v_nombre_match,true) AND coalesce(v_yape_match,true) AND coalesce(v_device_match,true);
 v_estado:=CASE WHEN v_ocr_ok THEN 'pendiente_verificacion_recepcion' ELSE 'ocr_no_valido' END;
 UPDATE public.pagos_comisiones SET pago_fecha=p_fecha_pago,numero_transaccion=v_tx,monto_enviado_pen=p_monto_enviado_pen,
  destinatario_nombre=nullif(btrim(p_destinatario_nombre),''),destinatario_yape=nullif(regexp_replace(coalesce(p_destinatario_yape,''),'[^0-9]','','g'),''),destinatario_nombre_coincide=v_dest_name_match,destinatario_yape_coincide=v_dest_yape_match,
  remitente_nombre=nullif(btrim(p_remitente_nombre),''),remitente_dni=nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),''),remitente_yape=nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),''),device_id=nullif(btrim(p_device_id),''),
  expected_nombre=v_driver.nombre_completo,expected_dni=v_driver.dni,expected_yape=v_driver.yape_numero,expected_device_id=v_driver.device_id,ocr_monto=p_monto_enviado_pen,ocr_operacion=v_tx,ocr_valido=v_ocr_ok,ocr_raw_text=NULL,
  monto_valido=v_monto_ok,fecha_valida=v_fecha_ok,transaccion_unica=v_tx_ok,dni_coincide=v_dni_match,nombre_coincide=v_nombre_match,yape_coincide=v_yape_match,device_coincide=v_device_match,ocr_confianza=p_ocr_confianza,ocr_procesado_at=now(),validado_automaticamente_at=CASE WHEN v_ocr_ok THEN now() ELSE validado_automaticamente_at END,origen_comprobante='ocr_local_sin_imagen',comprobante_url=NULL,estado=v_estado
 WHERE id=v_pago.id;
 RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'estado',v_estado,'ocr_valido',v_ocr_ok,'monto_valido',v_monto_ok,'fecha_valida',v_fecha_ok,'transaccion_unica',v_tx_ok,'destinatario_nombre_coincide',v_dest_name_match,'destinatario_yape_coincide',v_dest_yape_match,'dni_coincide',v_dni_match,'nombre_coincide',v_nombre_match,'yape_coincide',v_yape_match,'device_coincide',v_device_match,'imagen_guardada',false);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_liquidar_comisiones_chofer(p_driver_id text,p_monto numeric DEFAULT NULL,p_referencia text DEFAULT 'Pago Yape')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_driver record; v_prev numeric(10,2); v_abono numeric(10,2); v_new numeric(10,2); v_perm boolean:=false; v_reset boolean;
BEGIN
 IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=p_driver_id OR id::text=p_driver_id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado'; END IF;
 v_prev:=coalesce(v_driver.comisiones_pendientes,0); v_abono:=CASE WHEN p_monto IS NULL OR p_monto<=0 THEN v_prev ELSE least(p_monto,v_prev) END; v_new:=greatest(0,v_prev-v_abono); v_reset:=(v_new=0);
 SELECT EXISTS(SELECT 1 FROM public.usuarios_baneados ub WHERE coalesce(ub.permanente,false)=true AND (ub.user_id=v_driver.user_id OR (ub.dni IS NOT NULL AND v_driver.dni IS NOT NULL AND ub.dni=v_driver.dni) OR (ub.device_id IS NOT NULL AND v_driver.device_id IS NOT NULL AND ub.device_id=v_driver.device_id) OR (ub.device_fingerprint IS NOT NULL AND v_driver.device_fingerprint IS NOT NULL AND ub.device_fingerprint=v_driver.device_fingerprint))) INTO v_perm;
 PERFORM set_config('notigas.internal_driver_finance','1',true);
 UPDATE public.choferes_habilitados SET comisiones_pendientes=v_new,total_comisiones_pagadas=coalesce(total_comisiones_pagadas,0)+v_abono,pedidos_credito_ciclo=CASE WHEN v_reset THEN 0 ELSE pedidos_credito_ciclo END,botellones_credito_ciclo=CASE WHEN v_reset THEN 0 ELSE botellones_credito_ciclo END,estado_servicio=CASE WHEN v_perm THEN 'baneado' WHEN v_reset THEN 'activo' ELSE estado_servicio END,bloqueado=v_perm,motivo_bloqueo=CASE WHEN v_perm THEN motivo_bloqueo ELSE NULL END,estado_verificacion=CASE WHEN v_perm THEN 'bloqueado' ELSE 'aprobado' END WHERE id=v_driver.id;
 DELETE FROM public.usuarios_baneados WHERE coalesce(permanente,false)=false AND tipo_baneo='mora' AND user_id=v_driver.user_id;
 INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia) VALUES(v_driver.user_id,v_driver.id,'pago_yape',v_abono,v_prev,v_new,p_referencia);
 RETURN jsonb_build_object('ok',true,'saldo_anterior',v_prev,'abono',v_abono,'saldo_nuevo',v_new,'reactivado',(NOT v_perm AND v_reset));
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_banear_por_fraude_pago(p_pago_id uuid,p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_pago record; v_driver record; v_reason text; v_admin text:=coalesce(auth.jwt()->>'email','admin');
BEGIN
 IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo para administradores'; END IF;
 SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_pago.user_id LIMIT 1 FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado'; END IF;
 v_reason:=coalesce(nullif(btrim(p_motivo),''),'Comprobante de remesa falsificado o manipulado');
 INSERT INTO public.usuarios_baneados(user_id,nombre,telefono,placa,dni,device_id,device_fingerprint,motivo,tipo_baneo,permanente,pago_id,reviewed_by)
 VALUES(v_driver.user_id,v_driver.nombre_completo,v_driver.telefono_whatsapp,v_driver.placa,v_driver.dni,v_driver.device_id,v_driver.device_fingerprint,v_reason,'fraude_comprobante',true,p_pago_id,v_admin);
 PERFORM set_config('notigas.internal_driver_finance','1',true);
 UPDATE public.choferes_habilitados SET bloqueado=true,estado_verificacion='bloqueado',estado_servicio='baneado',motivo_bloqueo=v_reason WHERE id=v_driver.id;
 UPDATE public.pagos_comisiones SET estado='fraude_confirmado',fraude_confirmado=true,reviewed_at=now(),verificado_recepcion_por=v_admin,admin_observacion=v_reason WHERE id=p_pago_id;
 DELETE FROM public.rutas_repartidores WHERE user_id=v_driver.user_id;
 RETURN jsonb_build_object('ok',true,'estado','fraude_confirmado','mensaje','Repartidor baneado por comprobante falsificado.');
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_review_commission_voucher(p_pago_id uuid,p_action text,p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_pago record; v_result jsonb; v_admin text:=coalesce(auth.jwt()->>'email','admin');
BEGIN
 IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo para administradores'; END IF;
 SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
 IF p_action IN ('confirmar_recepcion','aprobar') THEN
  IF coalesce(v_pago.ocr_valido,false) IS NOT TRUE OR coalesce(v_pago.monto_valido,false) IS NOT TRUE OR coalesce(v_pago.fecha_valida,false) IS NOT TRUE OR coalesce(v_pago.transaccion_unica,false) IS NOT TRUE THEN RAISE EXCEPTION 'El comprobante no superó la validación automática'; END IF;
  SELECT public.rpc_liquidar_comisiones_chofer(v_pago.user_id,v_pago.monto,'Recepción de remesa verificada por administración. Operación: '||coalesce(v_pago.numero_transaccion,v_pago.ocr_operacion,'N/A')) INTO v_result;
  UPDATE public.pagos_comisiones SET estado='confirmado',reviewed_at=now(),verificado_recepcion_at=now(),verificado_recepcion_por=v_admin,admin_observacion=coalesce(p_observacion,'Dinero recibido y verificado') WHERE id=p_pago_id;
  RETURN jsonb_build_object('ok',true,'estado','confirmado','reactivado',coalesce((v_result->>'reactivado')::boolean,false),'mensaje','Recepción confirmada. El pago fue liquidado.');
 ELSIF p_action IN ('no_recibido','rechazar') THEN
  UPDATE public.pagos_comisiones SET estado='no_recibido',reviewed_at=now(),verificado_recepcion_por=v_admin,admin_observacion=coalesce(p_observacion,'No se verificó la llegada del dinero') WHERE id=p_pago_id;
  RETURN jsonb_build_object('ok',true,'estado','no_recibido','mensaje','Pago marcado como no recibido.');
 ELSIF p_action='fraude' THEN RETURN public.rpc_admin_banear_por_fraude_pago(p_pago_id,p_observacion);
 ELSE RAISE EXCEPTION 'Acción inválida'; END IF;
END; $$;

DROP FUNCTION IF EXISTS public.rpc_admin_list_commission_vouchers();
CREATE OR REPLACE FUNCTION public.rpc_admin_list_commission_vouchers()
RETURNS TABLE(pago_id uuid,user_id text,driver_id uuid,monto numeric,metodo text,estado text,cobro_generado_at timestamptz,pago_fecha timestamptz,numero_transaccion text,monto_enviado_pen numeric,destinatario_nombre text,destinatario_yape text,remitente_nombre text,remitente_dni text,remitente_yape text,device_id text,ocr_confianza numeric,ocr_valido boolean,monto_valido boolean,fecha_valida boolean,transaccion_unica boolean,destinatario_nombre_coincide boolean,destinatario_yape_coincide boolean,dni_coincide boolean,nombre_coincide boolean,yape_coincide boolean,device_coincide boolean,validado_automaticamente_at timestamptz,verificado_recepcion_at timestamptz,verificado_recepcion_por text,admin_observacion text,created_at timestamptz,reviewed_at timestamptz,driver_nombre text,driver_telefono text,driver_placa text,driver_dni text,driver_yape text,comisiones_pendientes numeric,limite_credito numeric,estado_servicio text,bloqueado boolean,motivo_bloqueo text,fraude_confirmado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo para administradores'; END IF;
 RETURN QUERY SELECT p.id,p.user_id,p.driver_id,p.monto,p.metodo,p.estado,p.cobro_generado_at,p.pago_fecha,coalesce(p.numero_transaccion,p.ocr_operacion),p.monto_enviado_pen,p.destinatario_nombre,p.destinatario_yape,p.remitente_nombre,p.remitente_dni,p.remitente_yape,p.device_id,p.ocr_confianza,p.ocr_valido,p.monto_valido,p.fecha_valida,p.transaccion_unica,p.destinatario_nombre_coincide,p.destinatario_yape_coincide,p.dni_coincide,p.nombre_coincide,p.yape_coincide,p.device_coincide,p.validado_automaticamente_at,p.verificado_recepcion_at,p.verificado_recepcion_por,p.admin_observacion,p.created_at,p.reviewed_at,coalesce(c.nombre_completo,'Repartidor'),coalesce(c.telefono_whatsapp,''),coalesce(c.placa,''),coalesce(c.dni,''),coalesce(c.yape_numero,''),coalesce(c.comisiones_pendientes,0),coalesce(c.limite_credito,20),coalesce(c.estado_servicio,'activo'),coalesce(c.bloqueado,false),c.motivo_bloqueo,coalesce(p.fraude_confirmado,false)
 FROM public.pagos_comisiones p LEFT JOIN public.choferes_habilitados c ON c.user_id=p.user_id
 ORDER BY CASE p.estado WHEN 'pendiente_verificacion_recepcion' THEN 0 WHEN 'ocr_no_valido' THEN 1 WHEN 'no_recibido' THEN 2 WHEN 'confirmado' THEN 3 WHEN 'fraude_confirmado' THEN 4 ELSE 5 END,coalesce(p.validado_automaticamente_at,p.created_at) DESC;
END; $$;

ALTER TABLE public.pagos_comisiones DROP COLUMN IF EXISTS monto_recibido_bob;

REVOKE ALL ON FUNCTION public.rpc_get_payment_instructions() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_actualizar_yape_chofer(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_generar_cobro_comisiones() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_liquidar_comisiones_chofer(text,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_admin_banear_por_fraude_pago(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_admin_review_commission_voucher(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rpc_admin_list_commission_vouchers() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_payment_instructions() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_actualizar_yape_chofer(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_generar_cobro_comisiones() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_liquidar_comisiones_chofer(text,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_banear_por_fraude_pago(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_review_commission_voucher(uuid,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_commission_vouchers() TO authenticated,service_role;
NOTIFY pgrst,'reload schema';