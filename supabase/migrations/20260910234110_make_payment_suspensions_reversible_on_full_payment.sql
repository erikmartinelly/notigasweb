-- NOTIGAS: la deuda de comisiones genera suspensión reversible, nunca baneo financiero definitivo.

CREATE OR REPLACE FUNCTION public.rpc_suspender_repartidor_mora(
  p_user_id text,
  p_motivo text DEFAULT 'Suspensión temporal por saldo de comisiones pendiente'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_driver public.choferes_habilitados%ROWTYPE;
  v_motivo text;
BEGIN
  IF auth.uid() IS NULL OR (NOT public.is_admin_email() AND auth.uid()::text <> p_user_id) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores o el proceso autorizado del repartidor';
  END IF;

  v_motivo := COALESCE(NULLIF(btrim(p_motivo), ''), 'Suspensión temporal por saldo de comisiones pendiente');

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = p_user_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repartidor no encontrado';
  END IF;

  DELETE FROM public.usuarios_baneados
  WHERE user_id = p_user_id
    AND tipo_baneo = 'mora';

  PERFORM set_config('notigas.internal_driver_finance', '1', true);
  UPDATE public.choferes_habilitados
  SET bloqueado = true,
      estado_servicio = 'suspendido_mora',
      estado_verificacion = 'aprobado',
      motivo_bloqueo = v_motivo
  WHERE id = v_driver.id;

  DELETE FROM public.rutas_repartidores
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'estado_servicio', 'suspendido_mora',
    'reversible', true,
    'mensaje', 'Repartidor suspendido temporalmente por saldo pendiente. Se reactivará al verificarse el pago total.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_liquidar_comisiones_chofer(
  p_driver_id text,
  p_monto numeric DEFAULT NULL,
  p_referencia text DEFAULT 'Pago Yape'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_driver public.choferes_habilitados%ROWTYPE;
  v_prev numeric(10,2);
  v_abono numeric(10,2);
  v_new numeric(10,2);
  v_admin_ban boolean := false;
  v_full_payment boolean;
  v_remesas integer;
  v_credit_limit numeric(10,2);
  v_order_limit integer;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = p_driver_id OR id::text = p_driver_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repartidor no encontrado';
  END IF;

  v_prev := COALESCE(v_driver.comisiones_pendientes, 0);
  v_abono := CASE
    WHEN p_monto IS NULL OR p_monto <= 0 THEN v_prev
    ELSE LEAST(p_monto, v_prev)
  END;
  v_new := GREATEST(0, v_prev - v_abono);
  v_full_payment := (v_prev > 0 AND v_abono > 0 AND v_new = 0);

  v_remesas := COALESCE(v_driver.remesas_confirmadas, 0)
    + CASE WHEN v_full_payment THEN 1 ELSE 0 END;
  v_credit_limit := public.fn_credit_limit_for_remittances(v_remesas);
  v_order_limit := public.fn_order_limit_for_credit(
    v_credit_limit,
    COALESCE(v_driver.comision_por_pedido, 0.20)
  );

  SELECT EXISTS(
    SELECT 1
    FROM public.usuarios_baneados ub
    WHERE ub.user_id = v_driver.user_id
      AND COALESCE(ub.permanente, false) = true
      AND COALESCE(ub.tipo_baneo, 'administrativo') NOT IN ('mora', 'fraude_comprobante', 'pago', 'financiero')
  ) INTO v_admin_ban;

  IF v_full_payment THEN
    DELETE FROM public.usuarios_baneados
    WHERE user_id = v_driver.user_id
      AND COALESCE(tipo_baneo, '') IN ('mora', 'fraude_comprobante', 'pago', 'financiero');
  END IF;

  PERFORM set_config('notigas.internal_driver_finance', '1', true);
  UPDATE public.choferes_habilitados
  SET comisiones_pendientes = v_new,
      total_comisiones_pagadas = COALESCE(total_comisiones_pagadas, 0) + v_abono,
      remesas_confirmadas = v_remesas,
      limite_credito = v_credit_limit,
      limite_pedidos_credito = v_order_limit,
      pedidos_credito_ciclo = CASE WHEN v_full_payment THEN 0 ELSE pedidos_credito_ciclo END,
      botellones_credito_ciclo = CASE WHEN v_full_payment THEN 0 ELSE botellones_credito_ciclo END,
      estado_servicio = CASE
        WHEN v_admin_ban THEN estado_servicio
        WHEN v_full_payment THEN 'activo'
        ELSE estado_servicio
      END,
      bloqueado = CASE
        WHEN v_admin_ban THEN true
        WHEN v_full_payment THEN false
        ELSE bloqueado
      END,
      motivo_bloqueo = CASE
        WHEN v_admin_ban THEN motivo_bloqueo
        WHEN v_full_payment THEN NULL
        ELSE motivo_bloqueo
      END,
      estado_verificacion = CASE
        WHEN v_admin_ban THEN estado_verificacion
        WHEN v_full_payment THEN 'aprobado'
        ELSE estado_verificacion
      END
  WHERE id = v_driver.id;

  INSERT INTO public.registro_comisiones(
    user_id, driver_id, tipo, monto, saldo_anterior, saldo_nuevo, referencia
  ) VALUES (
    v_driver.user_id, v_driver.id, 'pago_yape', v_abono, v_prev, v_new, p_referencia
  );

  RETURN jsonb_build_object(
    'ok', true,
    'saldo_anterior', v_prev,
    'abono', v_abono,
    'saldo_nuevo', v_new,
    'pago_total', v_full_payment,
    'remesas_confirmadas', v_remesas,
    'limite_credito', v_credit_limit,
    'limite_pedidos_credito', v_order_limit,
    'reactivado', (v_full_payment AND NOT v_admin_ban),
    'estado_servicio', CASE WHEN v_full_payment AND NOT v_admin_ban THEN 'activo' ELSE v_driver.estado_servicio END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_banear_por_fraude_pago(
  p_pago_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_pago public.pagos_comisiones%ROWTYPE;
  v_driver public.choferes_habilitados%ROWTYPE;
  v_reason text;
  v_admin text := COALESCE(auth.jwt()->>'email', auth.uid()::text, 'admin');
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo para administradores';
  END IF;

  SELECT * INTO v_pago
  FROM public.pagos_comisiones
  WHERE id = p_pago_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = v_pago.user_id
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Repartidor no encontrado'; END IF;

  v_reason := COALESCE(NULLIF(btrim(p_motivo), ''), 'Comprobante de remesa observado; cuenta suspendida hasta regularizar el pago');

  DELETE FROM public.usuarios_baneados
  WHERE user_id = v_driver.user_id
    AND tipo_baneo = 'fraude_comprobante';

  INSERT INTO public.usuarios_baneados(
    user_id, nombre, telefono, placa, dni, device_id, device_fingerprint,
    motivo, tipo_baneo, permanente, pago_id, reviewed_by
  ) VALUES (
    v_driver.user_id, v_driver.nombre_completo, v_driver.telefono_whatsapp,
    v_driver.placa, v_driver.dni, v_driver.device_id, v_driver.device_fingerprint,
    v_reason, 'fraude_comprobante', false, p_pago_id, v_admin
  );

  PERFORM set_config('notigas.internal_driver_finance', '1', true);
  UPDATE public.choferes_habilitados
  SET bloqueado = true,
      estado_verificacion = 'aprobado',
      estado_servicio = 'suspendido_pago',
      motivo_bloqueo = v_reason
  WHERE id = v_driver.id;

  UPDATE public.pagos_comisiones
  SET estado = 'fraude_confirmado',
      fraude_confirmado = true,
      reviewed_at = now(),
      verificado_recepcion_por = v_admin,
      admin_observacion = v_reason
  WHERE id = p_pago_id;

  DELETE FROM public.rutas_repartidores
  WHERE user_id = v_driver.user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'estado', 'fraude_confirmado',
    'reversible', true,
    'mensaje', 'Cuenta suspendida por comprobante observado. No es un baneo definitivo; puede reactivarse al verificarse el pago total.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_driver_submit_commission_voucher(
  p_comprobante_url text,
  p_monto numeric DEFAULT 20.00,
  p_ocr_monto numeric DEFAULT NULL,
  p_ocr_operacion text DEFAULT NULL,
  p_ocr_valido boolean DEFAULT false,
  p_ocr_raw_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_driver_id text := auth.uid()::text;
  v_driver public.choferes_habilitados%ROWTYPE;
  v_pago_id uuid;
BEGIN
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = v_driver_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ficha de chofer no encontrada';
  END IF;

  INSERT INTO public.pagos_comisiones(
    user_id, driver_id, monto, comprobante_url, metodo, estado,
    ocr_monto, ocr_operacion, ocr_valido, ocr_raw_text
  ) VALUES (
    v_driver_id, v_driver.id, COALESCE(p_monto, v_driver.comisiones_pendientes, 20.00),
    p_comprobante_url, 'yape',
    CASE WHEN p_ocr_valido THEN 'pendiente_verificacion_recepcion' ELSE 'pendiente' END,
    p_ocr_monto, p_ocr_operacion, p_ocr_valido, p_ocr_raw_text
  ) RETURNING id INTO v_pago_id;

  RETURN jsonb_build_object(
    'ok', true,
    'pago_id', v_pago_id,
    'auto_aprobado', false,
    'estado', CASE WHEN p_ocr_valido THEN 'pendiente_verificacion_recepcion' ELSE 'pendiente' END,
    'mensaje', 'Comprobante registrado. La reactivación ocurrirá solo después de que administración verifique la llegada efectiva del dinero.'
  );
END;
$function$;

UPDATE public.usuarios_baneados
SET permanente = false
WHERE COALESCE(tipo_baneo, '') IN ('mora', 'fraude_comprobante', 'pago', 'financiero');

REVOKE ALL ON FUNCTION public.rpc_suspender_repartidor_mora(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_liquidar_comisiones_chofer(text,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_admin_banear_por_fraude_pago(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_driver_submit_commission_voucher(text,numeric,numeric,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_suspender_repartidor_mora(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_liquidar_comisiones_chofer(text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_banear_por_fraude_pago(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_driver_submit_commission_voucher(text,numeric,numeric,text,boolean,text) TO authenticated;
