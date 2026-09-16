BEGIN;

ALTER TABLE public.pagos_comisiones
  ADD COLUMN IF NOT EXISTS destinatario_documento text,
  ADD COLUMN IF NOT EXISTS destinatario_documento_coincide boolean,
  ADD COLUMN IF NOT EXISTS pais_destino text,
  ADD COLUMN IF NOT EXISTS pais_destino_coincide boolean,
  ADD COLUMN IF NOT EXISTS canal_pago text,
  ADD COLUMN IF NOT EXISTS canal_pago_coincide boolean,
  ADD COLUMN IF NOT EXISTS auto_liquidado_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_revertido_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_saldo_antes numeric,
  ADD COLUMN IF NOT EXISTS auto_pedidos_ciclo_antes integer,
  ADD COLUMN IF NOT EXISTS auto_botellones_ciclo_antes integer,
  ADD COLUMN IF NOT EXISTS auto_remesas_antes integer,
  ADD COLUMN IF NOT EXISTS auto_total_pagado_antes numeric,
  ADD COLUMN IF NOT EXISTS auto_estado_servicio_antes text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_comisiones_numero_transaccion
ON public.pagos_comisiones (lower(btrim(numero_transaccion)))
WHERE nullif(btrim(numero_transaccion),'') IS NOT NULL;

CREATE OR REPLACE FUNCTION private.auto_liquidar_remesa_ocr_internal(p_pago_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pago public.pagos_comisiones%ROWTYPE;
  v_driver public.choferes_habilitados%ROWTYPE;
  v_prev numeric(10,2);
  v_new numeric(10,2);
  v_remesas integer;
  v_credit_limit numeric(10,2);
  v_order_limit integer;
  v_admin_ban boolean := false;
BEGIN
  SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_pago.auto_liquidado_at IS NOT NULL AND v_pago.auto_revertido_at IS NULL THEN
    RETURN jsonb_build_object('ok',true,'already_applied',true,'reactivado',true);
  END IF;
  IF coalesce(v_pago.ocr_valido,false) IS NOT TRUE
     OR coalesce(v_pago.monto_valido,false) IS NOT TRUE
     OR coalesce(v_pago.fecha_valida,false) IS NOT TRUE
     OR coalesce(v_pago.transaccion_unica,false) IS NOT TRUE
     OR coalesce(v_pago.destinatario_nombre_coincide,false) IS NOT TRUE
     OR coalesce(v_pago.destinatario_documento_coincide,false) IS NOT TRUE
     OR coalesce(v_pago.destinatario_yape_coincide,false) IS NOT TRUE
     OR coalesce(v_pago.pais_destino_coincide,false) IS NOT TRUE
     OR coalesce(v_pago.canal_pago_coincide,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El recibo no superó la validación automática';
  END IF;

  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE id=v_pago.driver_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;

  v_prev := coalesce(v_driver.comisiones_pendientes,0);
  IF v_prev <= 0 THEN
    RETURN jsonb_build_object('ok',true,'already_applied',true,'reactivado',(v_driver.estado_servicio='activo'));
  END IF;
  IF abs(v_prev - v_pago.monto) > 0.05 THEN
    RAISE EXCEPTION 'El cobro ya no coincide con el saldo pendiente';
  END IF;

  v_new := greatest(0,v_prev-v_pago.monto);
  IF v_new <> 0 THEN RAISE EXCEPTION 'La remesa debe cubrir el saldo completo'; END IF;

  v_remesas := coalesce(v_driver.remesas_confirmadas,0)+1;
  v_credit_limit := public.fn_credit_limit_for_remittances(v_remesas);
  v_order_limit := public.fn_order_limit_for_credit(v_credit_limit,coalesce(v_driver.comision_por_pedido,0.20));

  SELECT EXISTS(
    SELECT 1 FROM public.usuarios_baneados ub
    WHERE ub.user_id=v_driver.user_id
      AND coalesce(ub.permanente,false)=true
      AND coalesce(ub.tipo_baneo,'administrativo') NOT IN ('mora','fraude_comprobante','pago','financiero')
  ) INTO v_admin_ban;

  UPDATE public.pagos_comisiones
  SET auto_saldo_antes=v_prev,
      auto_pedidos_ciclo_antes=coalesce(v_driver.pedidos_credito_ciclo,0),
      auto_botellones_ciclo_antes=coalesce(v_driver.botellones_credito_ciclo,0),
      auto_remesas_antes=coalesce(v_driver.remesas_confirmadas,0),
      auto_total_pagado_antes=coalesce(v_driver.total_comisiones_pagadas,0),
      auto_estado_servicio_antes=v_driver.estado_servicio,
      auto_liquidado_at=now(),
      auto_revertido_at=NULL
  WHERE id=v_pago.id;

  DELETE FROM public.usuarios_baneados
  WHERE user_id=v_driver.user_id
    AND coalesce(permanente,false)=false
    AND coalesce(tipo_baneo,'') IN ('mora','fraude_comprobante','pago','financiero');

  PERFORM set_config('notigas.internal_driver_finance','1',true);
  UPDATE public.choferes_habilitados
  SET comisiones_pendientes=0,
      total_comisiones_pagadas=coalesce(total_comisiones_pagadas,0)+v_pago.monto,
      remesas_confirmadas=v_remesas,
      limite_credito=v_credit_limit,
      limite_pedidos_credito=v_order_limit,
      pedidos_credito_ciclo=0,
      botellones_credito_ciclo=0,
      estado_servicio=CASE WHEN v_admin_ban THEN estado_servicio ELSE 'activo' END,
      bloqueado=CASE WHEN v_admin_ban THEN true ELSE false END,
      motivo_bloqueo=CASE WHEN v_admin_ban THEN motivo_bloqueo ELSE NULL END,
      estado_verificacion=CASE WHEN v_admin_ban THEN estado_verificacion ELSE 'aprobado' END
  WHERE id=v_driver.id;

  INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia)
  VALUES(v_driver.user_id,v_driver.id,'pago_yape_ocr_auto',v_pago.monto,v_prev,0,
    'Recibo Yape Remesas aprobado automáticamente. Operación: '||coalesce(v_pago.numero_transaccion,v_pago.ocr_operacion,'N/A'));

  RETURN jsonb_build_object(
    'ok',true,'already_applied',false,'reactivado',NOT v_admin_ban,
    'remesas_confirmadas',v_remesas,'limite_credito',v_credit_limit,'limite_pedidos_credito',v_order_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION private.auto_liquidar_remesa_ocr_internal(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.revertir_remesa_ocr_internal(p_pago_id uuid, p_reason text DEFAULT 'Remesa no recibida')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pago public.pagos_comisiones%ROWTYPE;
  v_driver public.choferes_habilitados%ROWTYPE;
  v_pending numeric(10,2);
  v_new_pending numeric(10,2);
  v_remesas integer;
  v_credit_limit numeric(10,2);
  v_order_limit integer;
  v_orders integer;
BEGIN
  SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF v_pago.auto_liquidado_at IS NULL OR v_pago.auto_revertido_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already_reverted',true);
  END IF;
  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE id=v_pago.driver_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;

  v_pending := coalesce(v_driver.comisiones_pendientes,0);
  v_new_pending := round(v_pending+v_pago.monto,2);
  v_remesas := greatest(0,coalesce(v_driver.remesas_confirmadas,0)-1);
  v_credit_limit := public.fn_credit_limit_for_remittances(v_remesas);
  v_order_limit := public.fn_order_limit_for_credit(v_credit_limit,coalesce(v_driver.comision_por_pedido,0.20));
  v_orders := coalesce(v_driver.pedidos_credito_ciclo,0)+coalesce(v_pago.auto_pedidos_ciclo_antes,0);

  PERFORM set_config('notigas.internal_driver_finance','1',true);
  UPDATE public.choferes_habilitados
  SET comisiones_pendientes=v_new_pending,
      total_comisiones_pagadas=greatest(0,coalesce(total_comisiones_pagadas,0)-v_pago.monto),
      remesas_confirmadas=v_remesas,
      limite_credito=v_credit_limit,
      limite_pedidos_credito=v_order_limit,
      pedidos_credito_ciclo=v_orders,
      botellones_credito_ciclo=coalesce(botellones_credito_ciclo,0)+coalesce(v_pago.auto_botellones_ciclo_antes,0),
      estado_servicio='suspendido_pago',
      bloqueado=true,
      motivo_bloqueo=coalesce(nullif(btrim(p_reason),''),'Remesa no recibida'),
      estado_verificacion='bloqueado'
  WHERE id=v_driver.id;

  INSERT INTO public.usuarios_baneados(user_id,nombre,placa,telefono,dni,device_id,device_fingerprint,motivo,tipo_baneo,permanente)
  SELECT v_driver.user_id,v_driver.nombre_completo,v_driver.placa,v_driver.telefono_whatsapp,v_driver.dni,v_driver.device_id,v_driver.device_fingerprint,
         coalesce(nullif(btrim(p_reason),''),'Remesa no recibida'),'pago',false
  WHERE NOT EXISTS(
    SELECT 1 FROM public.usuarios_baneados ub
    WHERE ub.user_id=v_driver.user_id AND coalesce(ub.permanente,false)=false AND coalesce(ub.tipo_baneo,'') IN ('mora','pago','financiero')
  );

  DELETE FROM public.rutas_repartidores WHERE user_id=v_driver.user_id;

  UPDATE public.pagos_comisiones SET auto_revertido_at=now() WHERE id=v_pago.id;
  INSERT INTO public.registro_comisiones(user_id,driver_id,tipo,monto,saldo_anterior,saldo_nuevo,referencia)
  VALUES(v_driver.user_id,v_driver.id,'reversion_pago_yape_no_recibido',v_pago.monto,v_pending,v_new_pending,
    coalesce(nullif(btrim(p_reason),''),'Remesa no recibida')||'. Operación: '||coalesce(v_pago.numero_transaccion,v_pago.ocr_operacion,'N/A'));

  RETURN jsonb_build_object('ok',true,'already_reverted',false,'saldo_restaurado',v_new_pending,'remesas_confirmadas',v_remesas,'estado_servicio','suspendido_pago');
END;
$$;

REVOKE ALL ON FUNCTION private.revertir_remesa_ocr_internal(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric);

CREATE OR REPLACE FUNCTION public.rpc_registrar_ocr_pago(
  p_pago_id uuid,
  p_monto_enviado_pen numeric,
  p_fecha_pago timestamptz,
  p_numero_transaccion text,
  p_destinatario_nombre text DEFAULT NULL,
  p_destinatario_documento text DEFAULT NULL,
  p_destinatario_yape text DEFAULT NULL,
  p_pais_destino text DEFAULT NULL,
  p_canal_pago text DEFAULT NULL,
  p_remitente_nombre text DEFAULT NULL,
  p_remitente_dni text DEFAULT NULL,
  p_remitente_yape text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_ocr_confianza numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_uid text:=auth.uid()::text;
  v_pago public.pagos_comisiones%ROWTYPE;
  v_driver public.choferes_habilitados%ROWTYPE;
  v_cfg public.config_pagos%ROWTYPE;
  v_tx text:=nullif(btrim(p_numero_transaccion),'');
  v_monto_ok boolean:=false;
  v_fecha_ok boolean:=false;
  v_tx_ok boolean:=false;
  v_dest_name_match boolean:=false;
  v_dest_doc_match boolean:=false;
  v_dest_account_match boolean:=false;
  v_country_match boolean:=false;
  v_channel_match boolean:=false;
  v_dni_match boolean;
  v_nombre_match boolean;
  v_yape_match boolean;
  v_device_match boolean;
  v_ocr_ok boolean:=false;
  v_estado text;
  v_expected_name text;
  v_read_name text;
  v_expected_doc text;
  v_expected_account text;
  v_apply jsonb:=jsonb_build_object('reactivado',false);
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro no encontrado'; END IF;
  IF v_pago.user_id<>v_uid THEN RAISE EXCEPTION 'Este cobro no pertenece a tu cuenta'; END IF;
  IF v_pago.estado IN ('confirmado','fraude_confirmado','no_recibido') THEN RAISE EXCEPTION 'Este pago ya fue cerrado'; END IF;
  IF v_tx IS NULL OR length(v_tx)<5 THEN RAISE EXCEPTION 'No se detectó un número de orden o transacción válido'; END IF;
  IF p_fecha_pago IS NULL THEN RAISE EXCEPTION 'No se detectó fecha y hora de la remesa'; END IF;
  IF p_monto_enviado_pen IS NULL THEN RAISE EXCEPTION 'No se detectó el monto pagado en soles'; END IF;
  IF nullif(btrim(coalesce(p_destinatario_nombre,'')),'') IS NULL THEN RAISE EXCEPTION 'No se detectó el nombre del beneficiario'; END IF;
  IF nullif(regexp_replace(coalesce(p_destinatario_documento,''),'[^0-9]','','g'),'') IS NULL THEN RAISE EXCEPTION 'No se detectó el documento del beneficiario'; END IF;
  IF nullif(regexp_replace(coalesce(p_destinatario_yape,''),'[^0-9]','','g'),'') IS NULL THEN RAISE EXCEPTION 'No se detectó la cuenta de destino'; END IF;
  IF lower(btrim(coalesce(p_pais_destino,'')))<>'bolivia' THEN RAISE EXCEPTION 'El recibo no identifica Bolivia como destino'; END IF;
  IF lower(coalesce(p_canal_pago,'')) NOT LIKE '%yape%' OR lower(coalesce(p_canal_pago,'')) NOT LIKE '%remesa%' THEN RAISE EXCEPTION 'Solo se aceptan recibos de Yape Remesas'; END IF;

  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
  SELECT * INTO v_cfg FROM public.config_pagos WHERE id=1;
  IF NOT FOUND
     OR lower(btrim(coalesce(v_cfg.pais_destino,'')))<>'bolivia'
     OR lower(coalesce(v_cfg.metodo_entrega,'')) NOT LIKE '%yape%'
     OR nullif(btrim(v_cfg.beneficiario_nombre),'') IS NULL
     OR nullif(regexp_replace(coalesce(v_cfg.beneficiario_documento,''),'[^0-9]','','g'),'') IS NULL
     OR length(regexp_replace(coalesce(v_cfg.numero_cuenta,''),'[^0-9]','','g')) NOT BETWEEN 6 AND 20
  THEN RAISE EXCEPTION 'Datos de Yape Remesas a Bolivia incompletos; administración debe configurarlos'; END IF;

  v_monto_ok:=abs(p_monto_enviado_pen-v_pago.monto)<=0.05;
  v_fecha_ok:=p_fecha_pago>=coalesce(v_pago.cobro_generado_at,v_pago.created_at) AND p_fecha_pago<=now()+interval '5 minutes';
  v_tx_ok:=NOT EXISTS(
    SELECT 1 FROM public.pagos_comisiones pc
    WHERE pc.id<>v_pago.id AND nullif(btrim(pc.numero_transaccion),'') IS NOT NULL AND lower(btrim(pc.numero_transaccion))=lower(v_tx)
  );

  v_expected_name:=lower(regexp_replace(translate(v_cfg.beneficiario_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'));
  v_read_name:=lower(regexp_replace(translate(p_destinatario_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'));
  v_dest_name_match:=v_read_name<>'' AND v_read_name=v_expected_name;
  v_expected_doc:=regexp_replace(v_cfg.beneficiario_documento,'[^0-9]','','g');
  v_dest_doc_match:=regexp_replace(p_destinatario_documento,'[^0-9]','','g')=v_expected_doc;
  v_expected_account:=regexp_replace(v_cfg.numero_cuenta,'[^0-9]','','g');
  v_dest_account_match:=regexp_replace(p_destinatario_yape,'[^0-9]','','g')=v_expected_account;
  v_country_match:=lower(btrim(p_pais_destino))=lower(btrim(v_cfg.pais_destino));
  v_channel_match:=lower(p_canal_pago) LIKE '%yape%' AND lower(p_canal_pago) LIKE '%remesa%';

  IF nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),'') IS NULL OR nullif(regexp_replace(coalesce(v_driver.dni,''),'[^0-9]','','g'),'') IS NULL THEN v_dni_match:=NULL;
  ELSE v_dni_match:=regexp_replace(p_remitente_dni,'[^0-9]','','g')=regexp_replace(v_driver.dni,'[^0-9]','','g'); END IF;
  IF nullif(btrim(coalesce(p_remitente_nombre,'')),'') IS NULL OR nullif(btrim(coalesce(v_driver.nombre_completo,'')),'') IS NULL THEN v_nombre_match:=NULL;
  ELSE v_nombre_match:=lower(regexp_replace(translate(p_remitente_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(translate(v_driver.nombre_completo,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g')); END IF;
  IF nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),'') IS NULL OR nullif(regexp_replace(coalesce(v_driver.yape_numero,''),'[^0-9]','','g'),'') IS NULL THEN v_yape_match:=NULL;
  ELSE v_yape_match:=regexp_replace(p_remitente_yape,'[^0-9]','','g')=regexp_replace(v_driver.yape_numero,'[^0-9]','','g'); END IF;
  IF nullif(btrim(coalesce(p_device_id,'')),'') IS NULL OR nullif(btrim(coalesce(v_driver.device_id,'')),'') IS NULL THEN v_device_match:=NULL;
  ELSE v_device_match:=btrim(p_device_id)=btrim(v_driver.device_id); END IF;

  v_ocr_ok:=v_monto_ok AND v_fecha_ok AND v_tx_ok AND v_dest_name_match AND v_dest_doc_match AND v_dest_account_match
    AND v_country_match AND v_channel_match AND coalesce(v_dni_match,true) AND coalesce(v_nombre_match,true)
    AND coalesce(v_yape_match,true) AND coalesce(v_device_match,true);
  v_estado:=CASE WHEN v_ocr_ok THEN 'pendiente_verificacion_recepcion' ELSE 'ocr_no_valido' END;

  UPDATE public.pagos_comisiones
  SET pago_fecha=p_fecha_pago,
      numero_transaccion=CASE WHEN v_tx_ok THEN v_tx ELSE NULL END,
      monto_enviado_pen=p_monto_enviado_pen,
      destinatario_nombre=nullif(btrim(p_destinatario_nombre),''),
      destinatario_documento=nullif(regexp_replace(coalesce(p_destinatario_documento,''),'[^0-9]','','g'),''),
      destinatario_yape=nullif(regexp_replace(coalesce(p_destinatario_yape,''),'[^0-9]','','g'),''),
      pais_destino=nullif(btrim(p_pais_destino),''),
      canal_pago=nullif(btrim(p_canal_pago),''),
      destinatario_nombre_coincide=v_dest_name_match,
      destinatario_documento_coincide=v_dest_doc_match,
      destinatario_yape_coincide=v_dest_account_match,
      pais_destino_coincide=v_country_match,
      canal_pago_coincide=v_channel_match,
      remitente_nombre=nullif(btrim(p_remitente_nombre),''),
      remitente_dni=nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),''),
      remitente_yape=nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),''),
      device_id=nullif(btrim(p_device_id),''),
      expected_nombre=v_driver.nombre_completo,
      expected_dni=v_driver.dni,
      expected_yape=v_driver.yape_numero,
      expected_device_id=v_driver.device_id,
      ocr_monto=p_monto_enviado_pen,
      ocr_operacion=v_tx,
      ocr_valido=v_ocr_ok,
      ocr_raw_text=NULL,
      monto_valido=v_monto_ok,
      fecha_valida=v_fecha_ok,
      transaccion_unica=v_tx_ok,
      dni_coincide=v_dni_match,
      nombre_coincide=v_nombre_match,
      yape_coincide=v_yape_match,
      device_coincide=v_device_match,
      ocr_confianza=p_ocr_confianza,
      ocr_procesado_at=now(),
      validado_automaticamente_at=CASE WHEN v_ocr_ok THEN coalesce(validado_automaticamente_at,now()) ELSE NULL END,
      origen_comprobante='ocr_local_sin_imagen',
      comprobante_url=NULL,
      estado=v_estado
  WHERE id=v_pago.id;

  IF v_ocr_ok THEN
    SELECT private.auto_liquidar_remesa_ocr_internal(v_pago.id) INTO v_apply;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'pago_id',v_pago.id,'estado',v_estado,'ocr_valido',v_ocr_ok,
    'monto_valido',v_monto_ok,'fecha_valida',v_fecha_ok,'transaccion_unica',v_tx_ok,
    'destinatario_nombre_coincide',v_dest_name_match,'destinatario_documento_coincide',v_dest_doc_match,
    'destinatario_yape_coincide',v_dest_account_match,'pais_destino_coincide',v_country_match,'canal_pago_coincide',v_channel_match,
    'dni_coincide',v_dni_match,'nombre_coincide',v_nombre_match,'yape_coincide',v_yape_match,'device_coincide',v_device_match,
    'auto_confirmado',v_ocr_ok,'reactivado',coalesce((v_apply->>'reactivado')::boolean,false),
    'remesas_confirmadas',nullif(v_apply->>'remesas_confirmadas','')::integer,
    'limite_credito',nullif(v_apply->>'limite_credito','')::numeric,
    'imagen_guardada',false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,text,text,text,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_get_payment_instructions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE v public.config_pagos%ROWTYPE; v_configured boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT * INTO v FROM public.config_pagos WHERE id=1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'configured',false); END IF;
  v_configured := lower(btrim(coalesce(v.pais_destino,'')))='bolivia'
    AND lower(coalesce(v.metodo_entrega,'')) LIKE '%yape%'
    AND nullif(btrim(v.beneficiario_nombre),'') IS NOT NULL
    AND nullif(regexp_replace(coalesce(v.beneficiario_documento,''),'[^0-9]','','g'),'') IS NOT NULL
    AND length(regexp_replace(coalesce(v.numero_cuenta,''),'[^0-9]','','g')) BETWEEN 6 AND 20;
  RETURN jsonb_build_object(
    'ok',true,'configured',v_configured,'solo_yape',true,'pais_destino',coalesce(v.pais_destino,'Bolivia'),
    'metodo_entrega',coalesce(v.metodo_entrega,'Yape - Remesas'),'beneficiario_nombre',v.beneficiario_nombre,
    'beneficiario_documento',v.beneficiario_documento,'numero_cuenta',v.numero_cuenta,
    'instruccion','Yape > Remesas > Bolivia'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_get_payment_instructions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_payment_instructions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_payment_config(p_beneficiario_nombre text,p_numero_cuenta text,p_beneficiario_documento text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_name text:=nullif(btrim(p_beneficiario_nombre),'');
  v_account text:=regexp_replace(coalesce(p_numero_cuenta,''),'[^0-9]','','g');
  v_doc text:=regexp_replace(coalesce(p_beneficiario_documento,''),'[^0-9]','','g');
BEGIN
  IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
  IF v_name IS NULL OR length(v_name)<3 THEN RAISE EXCEPTION 'Nombre del beneficiario inválido'; END IF;
  IF length(v_doc) NOT BETWEEN 5 AND 20 THEN RAISE EXCEPTION 'Documento del beneficiario inválido'; END IF;
  IF length(v_account) NOT BETWEEN 6 AND 20 THEN RAISE EXCEPTION 'Cuenta de destino inválida'; END IF;
  INSERT INTO public.config_pagos(id,pais_destino,beneficiario_nombre,beneficiario_documento,metodo_entrega,numero_cuenta,updated_at)
  VALUES(1,'Bolivia',v_name,v_doc,'Yape - Remesas',v_account,now())
  ON CONFLICT(id) DO UPDATE SET pais_destino='Bolivia',beneficiario_nombre=excluded.beneficiario_nombre,
    beneficiario_documento=excluded.beneficiario_documento,metodo_entrega='Yape - Remesas',numero_cuenta=excluded.numero_cuenta,updated_at=now();
  RETURN jsonb_build_object('ok',true,'configured',true,'pais_destino','Bolivia','metodo_entrega','Yape - Remesas');
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_admin_set_payment_config(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_payment_config(text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_admin_review_commission_voucher(p_pago_id uuid,p_action text,p_observacion text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_pago public.pagos_comisiones%ROWTYPE;
  v_result jsonb;
  v_admin text:=coalesce(auth.jwt()->>'email','admin');
BEGIN
  IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo para administradores'; END IF;
  SELECT * INTO v_pago FROM public.pagos_comisiones WHERE id=p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;

  IF p_action IN ('confirmar_recepcion','aprobar') THEN
    IF coalesce(v_pago.ocr_valido,false) IS NOT TRUE OR coalesce(v_pago.monto_valido,false) IS NOT TRUE
       OR coalesce(v_pago.fecha_valida,false) IS NOT TRUE OR coalesce(v_pago.transaccion_unica,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'El comprobante no superó la validación automática';
    END IF;
    IF v_pago.auto_liquidado_at IS NULL THEN
      SELECT public.rpc_liquidar_comisiones_chofer(v_pago.user_id,v_pago.monto,
        'Recepción de remesa verificada por administración. Operación: '||coalesce(v_pago.numero_transaccion,v_pago.ocr_operacion,'N/A')) INTO v_result;
    END IF;
    UPDATE public.pagos_comisiones
    SET estado='confirmado',reviewed_at=now(),verificado_recepcion_at=now(),verificado_recepcion_por=v_admin,
        admin_observacion=coalesce(p_observacion,'Remesa recibida y verificada')
    WHERE id=p_pago_id;
    RETURN jsonb_build_object('ok',true,'estado','confirmado','mensaje','Llegada de la remesa confirmada.');

  ELSIF p_action IN ('no_recibido','rechazar') THEN
    IF v_pago.auto_liquidado_at IS NOT NULL AND v_pago.auto_revertido_at IS NULL THEN
      SELECT private.revertir_remesa_ocr_internal(p_pago_id,coalesce(p_observacion,'No se verificó la llegada efectiva de la remesa')) INTO v_result;
    END IF;
    UPDATE public.pagos_comisiones
    SET estado='no_recibido',reviewed_at=now(),verificado_recepcion_por=v_admin,
        admin_observacion=coalesce(p_observacion,'No se verificó la llegada efectiva de la remesa')
    WHERE id=p_pago_id;
    RETURN jsonb_build_object('ok',true,'estado','no_recibido','reversion',v_result,'mensaje','Remesa marcada como no recibida; la aplicación automática fue revertida.');

  ELSIF p_action='fraude' THEN
    IF v_pago.auto_liquidado_at IS NOT NULL AND v_pago.auto_revertido_at IS NULL THEN
      PERFORM private.revertir_remesa_ocr_internal(p_pago_id,coalesce(p_observacion,'Comprobante observado; remesa no verificada'));
    END IF;
    RETURN public.rpc_admin_banear_por_fraude_pago(p_pago_id,p_observacion);
  ELSE
    RAISE EXCEPTION 'Acción inválida';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_admin_review_commission_voucher(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_review_commission_voucher(uuid,text,text) TO authenticated, service_role;

COMMIT;
