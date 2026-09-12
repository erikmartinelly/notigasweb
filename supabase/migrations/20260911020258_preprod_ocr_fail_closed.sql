-- Recovered from the applied Supabase migration history to restore Git/remote parity.
CREATE OR REPLACE FUNCTION public.rpc_registrar_ocr_pago(
  p_pago_id uuid,
  p_monto_enviado_pen numeric,
  p_fecha_pago timestamptz,
  p_numero_transaccion text,
  p_destinatario_nombre text DEFAULT NULL,
  p_destinatario_yape text DEFAULT NULL,
  p_remitente_nombre text DEFAULT NULL,
  p_remitente_dni text DEFAULT NULL,
  p_remitente_yape text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_ocr_confianza numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth, pg_temp
AS $$
DECLARE
 v_uid text:=auth.uid()::text; v_pago record; v_driver record; v_cfg record; v_tx text:=nullif(btrim(p_numero_transaccion),'');
 v_monto_ok boolean:=false; v_fecha_ok boolean:=false; v_tx_ok boolean:=false; v_dest_name_match boolean:=false; v_dest_yape_match boolean:=false;
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
 IF nullif(btrim(coalesce(p_destinatario_nombre,'')),'') IS NULL THEN RAISE EXCEPTION 'No se detectó el nombre del destinatario'; END IF;
 IF regexp_replace(coalesce(p_destinatario_yape,''),'[^0-9]','','g') !~ '^9[0-9]{8}$' THEN RAISE EXCEPTION 'No se detectó un Yape destinatario válido'; END IF;
 SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id=v_uid LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha de repartidor no encontrada'; END IF;
 SELECT * INTO v_cfg FROM public.config_pagos WHERE id=1;
 IF NOT FOUND OR nullif(btrim(v_cfg.beneficiario_nombre),'') IS NULL OR regexp_replace(coalesce(v_cfg.numero_cuenta,''),'[^0-9]','','g') !~ '^9[0-9]{8}$' THEN RAISE EXCEPTION 'Datos de recepción Yape incompletos; administración debe configurarlos'; END IF;
 v_monto_ok:=abs(p_monto_enviado_pen-v_pago.monto)<=0.05;
 v_fecha_ok:=p_fecha_pago>=coalesce(v_pago.cobro_generado_at,v_pago.created_at) AND p_fecha_pago<=now()+interval '5 minutes';
 v_tx_ok:=NOT EXISTS(SELECT 1 FROM public.pagos_comisiones pc WHERE pc.id<>v_pago.id AND coalesce(nullif(btrim(pc.numero_transaccion),''),nullif(btrim(pc.ocr_operacion),'')) IS NOT NULL AND lower(coalesce(nullif(btrim(pc.numero_transaccion),''),nullif(btrim(pc.ocr_operacion),'')))=lower(v_tx));
 v_expected_name:=lower(regexp_replace(translate(v_cfg.beneficiario_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'));
 v_read_name:=lower(regexp_replace(translate(p_destinatario_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'));
 v_dest_name_match:=v_read_name<>'' AND v_read_name=v_expected_name;
 v_expected_yape:=regexp_replace(v_cfg.numero_cuenta,'[^0-9]','','g');
 v_dest_yape_match:=regexp_replace(p_destinatario_yape,'[^0-9]','','g')=v_expected_yape;
 IF nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),'') IS NULL OR nullif(regexp_replace(coalesce(v_driver.dni,''),'[^0-9]','','g'),'') IS NULL THEN v_dni_match:=NULL; ELSE v_dni_match:=regexp_replace(p_remitente_dni,'[^0-9]','','g')=regexp_replace(v_driver.dni,'[^0-9]','','g'); END IF;
 IF nullif(btrim(coalesce(p_remitente_nombre,'')),'') IS NULL OR nullif(btrim(coalesce(v_driver.nombre_completo,'')),'') IS NULL THEN v_nombre_match:=NULL; ELSE v_nombre_match:=lower(regexp_replace(translate(p_remitente_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(translate(v_driver.nombre_completo,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^a-zA-Z0-9]','','g')); END IF;
 IF nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),'') IS NULL OR nullif(regexp_replace(coalesce(v_driver.yape_numero,''),'[^0-9]','','g'),'') IS NULL THEN v_yape_match:=NULL; ELSE v_yape_match:=regexp_replace(p_remitente_yape,'[^0-9]','','g')=regexp_replace(v_driver.yape_numero,'[^0-9]','','g'); END IF;
 IF nullif(btrim(coalesce(p_device_id,'')),'') IS NULL OR nullif(btrim(coalesce(v_driver.device_id,'')),'') IS NULL THEN v_device_match:=NULL; ELSE v_device_match:=btrim(p_device_id)=btrim(v_driver.device_id); END IF;
 v_ocr_ok:=v_monto_ok AND v_fecha_ok AND v_tx_ok AND v_dest_name_match AND v_dest_yape_match AND coalesce(v_dni_match,true) AND coalesce(v_nombre_match,true) AND coalesce(v_yape_match,true) AND coalesce(v_device_match,true);
 v_estado:=CASE WHEN v_ocr_ok THEN 'pendiente_verificacion_recepcion' ELSE 'ocr_no_valido' END;
 UPDATE public.pagos_comisiones SET pago_fecha=p_fecha_pago,numero_transaccion=v_tx,monto_enviado_pen=p_monto_enviado_pen,destinatario_nombre=nullif(btrim(p_destinatario_nombre),''),destinatario_yape=regexp_replace(p_destinatario_yape,'[^0-9]','','g'),destinatario_nombre_coincide=v_dest_name_match,destinatario_yape_coincide=v_dest_yape_match,remitente_nombre=nullif(btrim(p_remitente_nombre),''),remitente_dni=nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),''),remitente_yape=nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),''),device_id=nullif(btrim(p_device_id),''),expected_nombre=v_driver.nombre_completo,expected_dni=v_driver.dni,expected_yape=v_driver.yape_numero,expected_device_id=v_driver.device_id,ocr_monto=p_monto_enviado_pen,ocr_operacion=v_tx,ocr_valido=v_ocr_ok,ocr_raw_text=NULL,monto_valido=v_monto_ok,fecha_valida=v_fecha_ok,transaccion_unica=v_tx_ok,dni_coincide=v_dni_match,nombre_coincide=v_nombre_match,yape_coincide=v_yape_match,device_coincide=v_device_match,ocr_confianza=p_ocr_confianza,ocr_procesado_at=now(),validado_automaticamente_at=CASE WHEN v_ocr_ok THEN now() ELSE NULL END,origen_comprobante='ocr_local_sin_imagen',comprobante_url=NULL,estado=v_estado WHERE id=v_pago.id;
 RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'estado',v_estado,'ocr_valido',v_ocr_ok,'monto_valido',v_monto_ok,'fecha_valida',v_fecha_ok,'transaccion_unica',v_tx_ok,'destinatario_nombre_coincide',v_dest_name_match,'destinatario_yape_coincide',v_dest_yape_match,'dni_coincide',v_dni_match,'nombre_coincide',v_nombre_match,'yape_coincide',v_yape_match,'device_coincide',v_device_match,'imagen_guardada',false);
END; $$;

REVOKE ALL ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric) TO authenticated;
