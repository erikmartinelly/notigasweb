-- =============================================================================
-- NOTIGAS Bolivia - Sin cobros por pedido (append-only)
-- Fecha: 2026-09-25
--
-- Objetivo: NOTIGAS no cobra por pedido. No hay comision, ni limite de credito,
-- ni mora, ni bloqueo por saldo. El unico bloqueo posible es una sancion
-- administrativa manual (estado_servicio), y el pago entre comprador y
-- repartidor se acuerda fuera de NOTIGAS (QR local Simple / Banesco QR).
--
-- Estrategia de bajo riesgo:
--   Las columnas de dinero/credito se neutralizan a 0 en lugar de eliminarse.
--   Con 0/0 todos los gates existentes (pedidos_credito_ciclo < 250,
--   comisiones_pendientes < 50) pasan de forma automatica, sin reescribir a
--   ciegas las funciones criticas del flujo de pedidos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. config_pagos: Bolivia + QR local, sin cuenta ni datos de Yape
-- -----------------------------------------------------------------------------
-- La fila vigente contenia datos reales de la billetera movil peruana.
UPDATE public.config_pagos
   SET pais_destino          = 'Bolivia',
       metodo_entrega       = 'QR local (Simple / Banesco QR)',
       beneficiario_nombre  = NULL,
       beneficiario_documento = NULL,
       numero_cuenta        = NULL,
       updated_at           = now();

-- Si la tabla quedara vacia en algun entorno, se inserta la fila neutra.
INSERT INTO public.config_pagos (
  id, pais_destino, metodo_entrega,
  beneficiario_nombre, beneficiario_documento, numero_cuenta, updated_at
)
SELECT 1, 'Bolivia', 'QR local (Simple / Banesco QR)', NULL, NULL, NULL, now()
WHERE NOT EXISTS (SELECT 1 FROM public.config_pagos);

-- -----------------------------------------------------------------------------
-- 2. Contabilidad de entrega: sin comision por pedido
-- -----------------------------------------------------------------------------
-- Antes: cobraba S/ 0.20 por balon, consumia un ciclo de 100 gratis / 250
--       cobrables, suspendia al llegar al tope y escribia en registro_comisiones.
-- Ahora: solo cuenta unidades entregadas y mantiene estadisticas operativas.
CREATE OR REPLACE FUNCTION public.fn_contabilizar_entrega_confirmada(
  p_order_id uuid, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_order record;
  v_driver record;
  v_units integer := 1;
  v_first text;
BEGIN
  PERFORM set_config('notigas.internal_order_mutation','1',true);
  PERFORM set_config('notigas.internal_driver_finance','1',true);

  SELECT * INTO v_order FROM public.pedidos WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  IF v_order.driver_id IS NULL OR btrim(v_order.driver_id) = '' THEN
    RAISE EXCEPTION 'El pedido no tiene repartidor asignado';
  END IF;

  -- Idempotencia: antes se usaba comision_registrada, ahora delivery_accounted_at.
  IF v_order.delivery_accounted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_accounted', true,
      'comision_cargada', 0, 'comision_por_balon', 0,
      'unidades_contabilizadas', coalesce(v_order.unidades_contabilizadas, 0),
      'estado_servicio', coalesce((SELECT estado_servicio FROM public.choferes_habilitados
                                   WHERE user_id = v_order.driver_id LIMIT 1), 'activo')
    );
  END IF;

  SELECT * INTO v_driver FROM public.choferes_habilitados
   WHERE user_id = v_order.driver_id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha del repartidor no encontrada'; END IF;

  v_first := substring(coalesce(v_order.cantidad,'') from '([0-9]+)');
  IF v_first IS NOT NULL THEN
    BEGIN
      v_units := greatest(1, least(v_first::integer, 100));
    EXCEPTION WHEN OTHERS THEN
      v_units := 1;
    END;
  END IF;

  -- Ya no se cobra ni se descuenta ciclo. No se suspende por monto.
  UPDATE public.pedidos
     SET unidades_contabilizadas = v_units,
         delivery_accounted_at   = now(),
         updated_at              = now()
   WHERE id = p_order_id;

  UPDATE public.choferes_habilitados
     SET pedidos_entregados_total   = coalesce(pedidos_entregados_total, 0) + 1,
         botellones_entregados_total = coalesce(botellones_entregados_total, 0) + v_units,
         comisiones_pendientes      = 0,
         limite_credito             = 0,
         pedidos_credito_ciclo      = 0,
         botellones_credito_ciclo   = 0
   WHERE id = v_driver.id;

  RETURN jsonb_build_object(
    'ok', true, 'already_accounted', false,
    'pedido_gratis', true, 'aviso_inicio_cobro', false,
    'comision_cargada', 0, 'comision_por_balon', 0,
    'unidades_contabilizadas', v_units,
    'limite_credito', 0, 'limite_pedidos_credito', 0,
    'comisiones_pendientes', 0,
    'estado_servicio', coalesce(v_driver.estado_servicio, 'activo'),
    'suspendido', false
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. Se retiran las funciones que solo existian para cobrar o suspender por mora
-- -----------------------------------------------------------------------------
-- Firmas verificadas contra el catalogo real de pg_proc.
-- OJO: los cuerpos plpgsql no generan dependencias, asi que DROP TABLE no
-- detecta estas funciones. Hay que eliminarlas explicitamente.
DROP FUNCTION IF EXISTS public.rpc_generar_cobro_comisiones();
DROP FUNCTION IF EXISTS public.rpc_liquidar_comisiones_chofer(text, numeric, text);
DROP FUNCTION IF EXISTS public.rpc_registrar_ocr_pago(
  uuid, numeric, timestamptz, text, text, text, text, text, text, text, text, text, text, numeric);
DROP FUNCTION IF EXISTS public.rpc_admin_list_commission_vouchers();
DROP FUNCTION IF EXISTS public.rpc_admin_review_commission_voucher(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_admin_banear_por_fraude_pago(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_suspender_repartidor_mora(text, text);
DROP FUNCTION IF EXISTS public.fn_suspend_driver_credit_limit(text, text);
DROP FUNCTION IF EXISTS private.auto_liquidar_remesa_ocr_internal(uuid);
DROP FUNCTION IF EXISTS private.revertir_remesa_ocr_internal(uuid, text);

-- Ya no se configura una cuenta de cobro: se retira el setter.
DROP FUNCTION IF EXISTS public.rpc_admin_set_payment_config(text, text, text);

-- -----------------------------------------------------------------------------
-- 3b. Lectura de la configuracion: ya no hay instrucciones de cobro
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_get_payment_instructions()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'success', true,
    'cobra_notigas', false,
    'metodo_entrega', 'QR local (Simple / Banesco QR)',
    'pais', 'Bolivia',
    'beneficiario_nombre', NULL,
    'beneficiario_documento', NULL,
    'numero_cuenta', NULL,
    'monto', NULL,
    'instrucciones',
      'NOTIGAS no cobra comisiones ni cobra por pedido. El pago entre el comprador y el repartidor se acuerda directamente entre ellos por QR local (Simple o Banesco QR). NOTIGAS no procesa ni custodia fondos.'
  );
$function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_get_payment_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'pais_destino', 'Bolivia',
    'metodo_entrega', 'QR local (Simple / Banesco QR)',
    'beneficiario_nombre', NULL,
    'beneficiario_documento', NULL,
    'numero_cuenta', NULL,
    'cobra_notigas', false
  );
$function$;

-- -----------------------------------------------------------------------------
-- 4. Tablas de cobro. Ambas estan vacias (0 filas) en produccion.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.pagos_comisiones;
DROP TABLE IF EXISTS public.registro_comisiones;

-- -----------------------------------------------------------------------------
-- 5. Neutralizar importes y contadores de credito
-- -----------------------------------------------------------------------------
-- Con estos valores en cero los gates de las funciones existentes
-- (pedidos_credito_ciclo < 250, comisiones_pendientes < 50,
--  ocr_monto IS NULL, estado_pago_premium = 'ninguno') se cumplen solos.
UPDATE public.choferes_habilitados
   SET comisiones_pendientes        = 0,
       limite_credito               = 0,
       total_comisiones_pagadas     = 0,
       comision_por_pedido          = 0,
       limite_pedidos_credito       = 0,
       limite_botellones_credito    = 0,
       pedidos_credito_ciclo        = 0,
       botellones_credito_ciclo     = 0,
       promo_pedidos_gratis_total   = 0,
       promo_pedidos_gratis_usados  = 0,
       ocr_monto                    = NULL,
       estado_pago_premium          = 'ninguno';

UPDATE public.pedidos
   SET comision_entrega     = NULL,
       comision_registrada  = false
 WHERE comision_entrega IS NOT NULL
    OR comision_registrada IS NOT FALSE;

-- -----------------------------------------------------------------------------
-- 6. Las columnas se conservan (inertes) para no romper funciones y clientes
--    existentes. Se marcan como retiradas.
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.choferes_habilitados.comisiones_pendientes IS
  'RETIRADA: NOTIGAS no cobra comisiones. Se mantiene en 0 por compatibilidad.';
COMMENT ON COLUMN public.choferes_habilitados.limite_credito IS
  'RETIRADA: no existe limite de credito. Se mantiene en 0 por compatibilidad.';
COMMENT ON COLUMN public.choferes_habilitados.comision_por_pedido IS
  'RETIRADA: no hay comision por pedido. Se mantiene en 0 por compatibilidad.';
COMMENT ON COLUMN public.choferes_habilitados.estado_pago_premium IS
  'RETIRADA: no existe plan Premium ni cobro a repartidores.';
COMMENT ON COLUMN public.pedidos.comision_entrega IS
  'RETIRADA: NOTIGAS no cobra por pedido. Siempre NULL.';
COMMENT ON COLUMN public.pedidos.comision_registrada IS
  'RETIRADA: siempre false. La idempotencia usa delivery_accounted_at.';
COMMENT ON TABLE public.config_pagos IS
  'Bolivia. NOTIGAS no cobra: el pago entre comprador y repartidor se acuerda fuera de la app (QR local Simple / Banesco QR).';
