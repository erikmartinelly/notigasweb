BEGIN;

-- 1) Estados de servicio coherentes con los RPC financieros vigentes.
ALTER TABLE public.choferes_habilitados
  DROP CONSTRAINT IF EXISTS choferes_estado_servicio_check;
ALTER TABLE public.choferes_habilitados
  ADD CONSTRAINT choferes_estado_servicio_check
  CHECK (estado_servicio IN (
    'activo','suspendido_tope','suspendido','suspendido_mora',
    'suspendido_pago','inactivo','baneado'
  ));

-- 2) La tabla base de rutas solo puede ser leída por el propio repartidor o un admin.
DROP POLICY IF EXISTS rutas_select_public ON public.rutas_repartidores;
DROP POLICY IF EXISTS rutas_select_own_or_admin ON public.rutas_repartidores;
CREATE POLICY rutas_select_own_or_admin
ON public.rutas_repartidores
FOR SELECT TO authenticated
USING (((SELECT auth.uid())::text = user_id) OR public.is_admin_email());

-- 3) Vistas públicas: conservar forma de API pero ocultar identidad/contacto y difuminar GPS
-- salvo repartidor, admin o comprador con un pedido activo asignado a ese repartidor.
DROP VIEW IF EXISTS public.rutas_repartidores_publicas;
CREATE VIEW public.rutas_repartidores_publicas
WITH (security_barrier = true) AS
WITH base AS (
  SELECT
    r.*,
    ch.nombre_completo,
    ch.telefono_whatsapp,
    ch.placa AS driver_placa,
    ch.productos AS driver_productos,
    ch.color_camion AS driver_color_camion,
    ch.precio_balon_10kg AS driver_precio,
    (
      (SELECT auth.uid())::text = r.user_id
      OR public.is_admin_email()
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.user_id = (SELECT auth.uid())::text
          AND p.driver_id = r.user_id
          AND p.estado = 'asignado'
      )
    ) AS can_private
  FROM public.rutas_repartidores r
  JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
  WHERE r.last_active >= now() - interval '10 minutes'
    AND ch.bloqueado IS NOT TRUE
    AND ch.estado_servicio = 'activo'
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE (ub.user_id IS NOT NULL AND ub.user_id = r.user_id)
         OR (ub.telefono IS NOT NULL AND ch.telefono_whatsapp IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
         OR (ub.placa IS NOT NULL AND ch.placa IS NOT NULL AND lower(ub.placa) = lower(ch.placa))
         OR (ub.device_id IS NOT NULL AND ch.device_id IS NOT NULL AND ub.device_id = ch.device_id)
    )
)
SELECT
  id,
  CASE WHEN can_private THEN user_id ELSE NULL::text END AS user_id,
  COALESCE(distribuidor_nombre, nombre_completo, 'Repartidor NOTIGAS') AS distribuidor_nombre,
  COALESCE(categoria, 'Gas GLP') AS categoria,
  COALESCE(titulo, 'En ruta de distribución') AS titulo,
  ciudad,
  CASE WHEN can_private THEN latitude ELSE public.fn_blur_latitude(id, latitude) END AS latitude,
  CASE WHEN can_private THEN longitude ELSE public.fn_blur_longitude(id, latitude, longitude) END AS longitude,
  COALESCE(garrafas_agotadas, false) AS garrafas_agotadas,
  last_active,
  CASE WHEN can_private THEN COALESCE(NULLIF(TRIM(telefono), ''), NULLIF(TRIM(telefono_whatsapp), '')) ELSE NULL::text END AS telefono,
  CASE WHEN can_private THEN COALESCE(driver_placa, '') ELSE NULL::text END AS placa,
  COALESCE(driver_productos, '') AS productos,
  COALESCE(garrafas_agotadas, false) AS balones_agotados,
  COALESCE(NULLIF(TRIM(color_camion), ''), NULLIF(TRIM(driver_color_camion), ''), '') AS color_camion,
  COALESCE(precio_balon_10kg, driver_precio) AS precio_balon_10kg,
  false AS es_premium,
  created_at AS route_created_at,
  'credito'::text AS tipo_plan
FROM base;
ALTER VIEW public.rutas_repartidores_publicas OWNER TO postgres;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

DROP VIEW IF EXISTS public.choferes_publicos;
CREATE VIEW public.choferes_publicos
WITH (security_barrier = true) AS
WITH base AS (
  SELECT ch.*,
    (
      (SELECT auth.uid())::text = ch.user_id
      OR public.is_admin_email()
      OR EXISTS (
        SELECT 1 FROM public.pedidos p
        WHERE p.user_id = (SELECT auth.uid())::text
          AND p.driver_id = ch.user_id
          AND p.estado = 'asignado'
      )
    ) AS can_private
  FROM public.choferes_habilitados ch
  WHERE lower(trim(coalesce(ch.estado_verificacion,''))) = 'aprobado'
    AND ch.bloqueado IS NOT TRUE
    AND ch.estado_servicio = 'activo'
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE (ub.user_id IS NOT NULL AND ub.user_id = ch.user_id)
         OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
         OR (ub.placa IS NOT NULL AND lower(ub.placa) = lower(ch.placa))
         OR (ub.device_id IS NOT NULL AND ub.device_id = ch.device_id)
         OR (ub.dni IS NOT NULL AND ub.dni = ch.dni)
    )
)
SELECT
  id,
  CASE WHEN can_private THEN user_id ELSE NULL::text END AS user_id,
  nombre_completo,
  categoria,
  ciudad,
  zonas,
  schedule,
  CASE WHEN can_private THEN placa ELSE NULL::text END AS placa,
  productos,
  CASE WHEN can_private THEN telefono_whatsapp ELSE NULL::text END AS telefono,
  NULL::text AS descripcion,
  NULL::text AS foto_url,
  COALESCE(color_camion, '') AS color_camion,
  precio_balon_10kg,
  false AS es_premium,
  NULL::timestamptz AS premium_vence_at,
  estado_verificacion,
  created_at
FROM base
ORDER BY created_at DESC;
ALTER VIEW public.choferes_publicos OWNER TO postgres;
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;

-- 4) Principio de mínimo privilegio en tablas administrativas.
REVOKE INSERT, UPDATE, DELETE ON public.admin_credentials FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usuarios_baneados FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usuarios_roles FROM authenticated;

-- 5) Evitar reevaluación de JWT por fila en RLS.
DROP POLICY IF EXISTS admin_credentials_select_own ON public.admin_credentials;
CREATE POLICY admin_credentials_select_own
ON public.admin_credentials FOR SELECT TO authenticated
USING (
  lower(trim(email)) = lower(trim(coalesce((SELECT auth.jwt()->>'email'),'')))
);

DROP POLICY IF EXISTS usuarios_roles_select_own_or_admin ON public.usuarios_roles;
CREATE POLICY usuarios_roles_select_own_or_admin
ON public.usuarios_roles FOR SELECT TO authenticated
USING (
  lower(trim(email)) = lower(trim(coalesce((SELECT auth.jwt()->>'email'),'')))
  OR (SELECT public.is_admin_email())
);

-- 6) Nunca dejar operativo el placeholder de desarrollo como receptor de dinero.
UPDATE public.config_pagos
SET numero_cuenta = NULL,
    beneficiario_nombre = NULL,
    beneficiario_documento = NULL,
    updated_at = now()
WHERE id = 1 AND regexp_replace(coalesce(numero_cuenta,''),'[^0-9]','','g') = '987654321';

CREATE OR REPLACE FUNCTION public.rpc_admin_get_payment_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth, pg_temp
AS $$
DECLARE v public.config_pagos%ROWTYPE;
BEGIN
  IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
  SELECT * INTO v FROM public.config_pagos WHERE id=1;
  RETURN jsonb_build_object(
    'ok', true,
    'pais_destino', coalesce(v.pais_destino,'Peru'),
    'metodo_entrega', coalesce(v.metodo_entrega,'Yape'),
    'beneficiario_nombre', v.beneficiario_nombre,
    'beneficiario_documento', v.beneficiario_documento,
    'numero_cuenta', v.numero_cuenta
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_payment_config(
  p_beneficiario_nombre text,
  p_numero_cuenta text,
  p_beneficiario_documento text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth, pg_temp
AS $$
DECLARE v_name text:=nullif(btrim(p_beneficiario_nombre),''); v_yape text:=regexp_replace(coalesce(p_numero_cuenta,''),'[^0-9]','','g');
BEGIN
  IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
  IF v_name IS NULL OR length(v_name) < 3 THEN RAISE EXCEPTION 'Nombre del beneficiario inválido'; END IF;
  IF v_yape !~ '^9[0-9]{8}$' THEN RAISE EXCEPTION 'El Yape receptor debe tener 9 dígitos y comenzar con 9'; END IF;
  INSERT INTO public.config_pagos(id,pais_destino,beneficiario_nombre,beneficiario_documento,metodo_entrega,numero_cuenta,updated_at)
  VALUES(1,'Peru',v_name,nullif(btrim(p_beneficiario_documento),''),'Yape',v_yape,now())
  ON CONFLICT(id) DO UPDATE SET
    pais_destino='Peru', beneficiario_nombre=excluded.beneficiario_nombre,
    beneficiario_documento=excluded.beneficiario_documento,
    metodo_entrega='Yape', numero_cuenta=excluded.numero_cuenta, updated_at=now();
  RETURN jsonb_build_object('ok',true,'configured',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_payment_instructions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE v public.config_pagos%ROWTYPE; v_yape text; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT * INTO v FROM public.config_pagos WHERE id=1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'configured',false); END IF;
  v_yape:=regexp_replace(coalesce(v.numero_cuenta,''),'[^0-9]','','g');
  v_ok:=lower(coalesce(v.pais_destino,''))='peru'
        AND lower(coalesce(v.metodo_entrega,''))='yape'
        AND nullif(btrim(v.beneficiario_nombre),'') IS NOT NULL
        AND v_yape ~ '^9[0-9]{8}$';
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok',true,'configured',false,'pais_destino','Peru','metodo_entrega','Yape');
  END IF;
  RETURN jsonb_build_object(
    'ok',true,'configured',true,'pais_destino','Peru',
    'beneficiario_nombre',v.beneficiario_nombre,
    'beneficiario_documento',v.beneficiario_documento,
    'metodo_entrega','Yape','numero_cuenta',v_yape
  );
END;
$$;

-- 7) OCR fail-closed: destinatario y Yape receptor son obligatorios y deben coincidir.
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
LANGUAGE plpgsql
SECURITY DEFINER
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
 IF NOT FOUND OR nullif(btrim(v_cfg.beneficiario_nombre),'') IS NULL OR regexp_replace(coalesce(v_cfg.numero_cuenta,''),'[^0-9]','','g') !~ '^9[0-9]{8}$' THEN
   RAISE EXCEPTION 'Datos de recepción Yape incompletos; administración debe configurarlos';
 END IF;
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
 v_ocr_ok:=v_monto_ok AND v_fecha_ok AND v_tx_ok AND v_dest_name_match AND v_dest_yape_match
           AND coalesce(v_dni_match,true) AND coalesce(v_nombre_match,true) AND coalesce(v_yape_match,true) AND coalesce(v_device_match,true);
 v_estado:=CASE WHEN v_ocr_ok THEN 'pendiente_verificacion_recepcion' ELSE 'ocr_no_valido' END;
 UPDATE public.pagos_comisiones SET pago_fecha=p_fecha_pago,numero_transaccion=v_tx,monto_enviado_pen=p_monto_enviado_pen,
  destinatario_nombre=nullif(btrim(p_destinatario_nombre),''),destinatario_yape=regexp_replace(p_destinatario_yape,'[^0-9]','','g'),destinatario_nombre_coincide=v_dest_name_match,destinatario_yape_coincide=v_dest_yape_match,
  remitente_nombre=nullif(btrim(p_remitente_nombre),''),remitente_dni=nullif(regexp_replace(coalesce(p_remitente_dni,''),'[^0-9]','','g'),''),remitente_yape=nullif(regexp_replace(coalesce(p_remitente_yape,''),'[^0-9]','','g'),''),device_id=nullif(btrim(p_device_id),''),
  expected_nombre=v_driver.nombre_completo,expected_dni=v_driver.dni,expected_yape=v_driver.yape_numero,expected_device_id=v_driver.device_id,
  ocr_monto=p_monto_enviado_pen,ocr_operacion=v_tx,ocr_valido=v_ocr_ok,ocr_raw_text=NULL,monto_valido=v_monto_ok,fecha_valida=v_fecha_ok,transaccion_unica=v_tx_ok,
  dni_coincide=v_dni_match,nombre_coincide=v_nombre_match,yape_coincide=v_yape_match,device_coincide=v_device_match,ocr_confianza=p_ocr_confianza,ocr_procesado_at=now(),
  validado_automaticamente_at=CASE WHEN v_ocr_ok THEN now() ELSE NULL END,origen_comprobante='ocr_local_sin_imagen',comprobante_url=NULL,estado=v_estado
 WHERE id=v_pago.id;
 RETURN jsonb_build_object('ok',true,'pago_id',v_pago.id,'estado',v_estado,'ocr_valido',v_ocr_ok,'monto_valido',v_monto_ok,'fecha_valida',v_fecha_ok,'transaccion_unica',v_tx_ok,'destinatario_nombre_coincide',v_dest_name_match,'destinatario_yape_coincide',v_dest_yape_match,'dni_coincide',v_dni_match,'nombre_coincide',v_nombre_match,'yape_coincide',v_yape_match,'device_coincide',v_device_match,'imagen_guardada',false);
END;
$$;

-- 8) Retirar endpoints Premium y el submit legado de vouchers que ya no forman parte del contrato.
DROP FUNCTION IF EXISTS public.is_current_driver_premium();
DROP FUNCTION IF EXISTS public.rpc_admin_verify_premium_payment(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_driver_submit_premium_payment(text);
DROP FUNCTION IF EXISTS public.rpc_driver_submit_premium_payment(text,numeric,text,text,boolean,text);
DROP FUNCTION IF EXISTS public.rpc_purge_expired_premium_vouchers();
DROP FUNCTION IF EXISTS public.rpc_driver_submit_commission_voucher(text,numeric,numeric,text,boolean,text);

REVOKE ALL ON FUNCTION public.rpc_admin_get_payment_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_admin_set_payment_config(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_get_payment_instructions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_payment_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_payment_config(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_payment_instructions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_registrar_ocr_pago(uuid,numeric,timestamptz,text,text,text,text,text,text,text,numeric) TO authenticated;

-- 9) Los buckets de vouchers heredados se mantienen privados y vacíos.
-- Supabase Storage prohíbe borrarlos directamente por SQL; retirarlos, si se desea,
-- debe hacerse mediante la Storage API para preservar la integridad del catálogo.

COMMIT;