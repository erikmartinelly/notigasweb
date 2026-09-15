DROP FUNCTION IF EXISTS public.rpc_admin_list_commission_vouchers();
CREATE FUNCTION public.rpc_admin_list_commission_vouchers()
RETURNS TABLE(
  pago_id uuid,
  user_id text,
  driver_id uuid,
  monto numeric,
  metodo text,
  estado text,
  cobro_generado_at timestamptz,
  pago_fecha timestamptz,
  numero_transaccion text,
  monto_enviado_pen numeric,
  destinatario_nombre text,
  destinatario_documento text,
  destinatario_yape text,
  pais_destino text,
  canal_pago text,
  remitente_nombre text,
  remitente_dni text,
  remitente_yape text,
  device_id text,
  ocr_confianza numeric,
  ocr_valido boolean,
  monto_valido boolean,
  fecha_valida boolean,
  transaccion_unica boolean,
  destinatario_nombre_coincide boolean,
  destinatario_documento_coincide boolean,
  destinatario_yape_coincide boolean,
  pais_destino_coincide boolean,
  canal_pago_coincide boolean,
  dni_coincide boolean,
  nombre_coincide boolean,
  yape_coincide boolean,
  device_coincide boolean,
  validado_automaticamente_at timestamptz,
  auto_liquidado_at timestamptz,
  auto_revertido_at timestamptz,
  verificado_recepcion_at timestamptz,
  verificado_recepcion_por text,
  admin_observacion text,
  created_at timestamptz,
  reviewed_at timestamptz,
  driver_nombre text,
  driver_telefono text,
  driver_placa text,
  driver_dni text,
  driver_yape text,
  comisiones_pendientes numeric,
  limite_credito numeric,
  estado_servicio text,
  bloqueado boolean,
  motivo_bloqueo text,
  fraude_confirmado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo para administradores';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.driver_id,
    p.monto,
    p.metodo,
    p.estado,
    p.cobro_generado_at,
    p.pago_fecha,
    coalesce(p.numero_transaccion,p.ocr_operacion),
    p.monto_enviado_pen,
    p.destinatario_nombre,
    p.destinatario_documento,
    p.destinatario_yape,
    p.pais_destino,
    p.canal_pago,
    p.remitente_nombre,
    p.remitente_dni,
    p.remitente_yape,
    p.device_id,
    p.ocr_confianza,
    p.ocr_valido,
    p.monto_valido,
    p.fecha_valida,
    p.transaccion_unica,
    p.destinatario_nombre_coincide,
    p.destinatario_documento_coincide,
    p.destinatario_yape_coincide,
    p.pais_destino_coincide,
    p.canal_pago_coincide,
    p.dni_coincide,
    p.nombre_coincide,
    p.yape_coincide,
    p.device_coincide,
    p.validado_automaticamente_at,
    p.auto_liquidado_at,
    p.auto_revertido_at,
    p.verificado_recepcion_at,
    p.verificado_recepcion_por,
    p.admin_observacion,
    p.created_at,
    p.reviewed_at,
    coalesce(c.nombre_completo,'Repartidor'),
    coalesce(c.telefono_whatsapp,''),
    coalesce(c.placa,''),
    coalesce(c.dni,''),
    coalesce(c.yape_numero,''),
    coalesce(c.comisiones_pendientes,0),
    coalesce(c.limite_credito,20),
    coalesce(c.estado_servicio,'activo'),
    coalesce(c.bloqueado,false),
    c.motivo_bloqueo,
    coalesce(p.fraude_confirmado,false)
  FROM public.pagos_comisiones p
  LEFT JOIN public.choferes_habilitados c ON c.user_id=p.user_id
  ORDER BY
    CASE p.estado
      WHEN 'pendiente_verificacion_recepcion' THEN 0
      WHEN 'ocr_no_valido' THEN 1
      WHEN 'no_recibido' THEN 2
      WHEN 'confirmado' THEN 3
      WHEN 'fraude_confirmado' THEN 4
      ELSE 5
    END,
    coalesce(p.validado_automaticamente_at,p.created_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_list_commission_vouchers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_commission_vouchers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_admin_get_payment_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE v public.config_pagos%ROWTYPE;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;
  SELECT * INTO v FROM public.config_pagos WHERE id=1;
  RETURN jsonb_build_object(
    'ok',true,
    'pais_destino',coalesce(v.pais_destino,'Bolivia'),
    'metodo_entrega',coalesce(v.metodo_entrega,'Yape - Remesas'),
    'beneficiario_nombre',v.beneficiario_nombre,
    'beneficiario_documento',v.beneficiario_documento,
    'numero_cuenta',v.numero_cuenta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_get_payment_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_payment_config() TO authenticated, service_role;

DROP POLICY IF EXISTS denuncias_insert ON public.denuncias;
CREATE POLICY denuncias_insert
ON public.denuncias
FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT auth.uid()) IS NOT NULL
  AND user_id = (SELECT auth.uid())::text
  AND denunciante_id = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS reportes_spam_insert ON public.reportes_spam;
CREATE POLICY reportes_spam_insert
ON public.reportes_spam
FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE((((SELECT auth.jwt()) ->> 'is_anonymous'))::boolean, false) = false
  AND (SELECT auth.uid()) IS NOT NULL
  AND user_id = (SELECT auth.uid())::text
);

DROP INDEX IF EXISTS public.idx_pagos_comisiones_tx_unique_v2;

CREATE OR REPLACE FUNCTION public.rpc_public_schema_contract()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'version', '20260915_preprod_v1',
    'payment_admin_queue', 'yape_remesas_bolivia_v2'
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_public_schema_contract() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_public_schema_contract() TO anon, authenticated, service_role;
