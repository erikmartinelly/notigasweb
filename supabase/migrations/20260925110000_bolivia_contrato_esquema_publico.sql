-- Bolivia: el contrato de esquema publico deja de anunciar una cola de pagos.
--
-- rpc_public_schema_contract() seguia reportando
--   version            = '20260915_preprod_v1'
--   payment_admin_queue = 'yape_remesas_bolivia_v2'
-- desde la migracion 20260915041809. Ese literal describia el modelo de
-- remesas por Yape que NOTIGAS ya no tiene: las tablas pagos_comisiones y
-- registro_comisiones se eliminaron, las RPCs de cobros se retiraron y el
-- pago ocurre directamente entre comprador y repartidor con QR local.
--
-- Un verificador publico que anuncia una cola de cobros que no existe es una
-- fuente de verdad falsa para cualquier auditoria externa. Se reescribe para
-- que describa el diseno vigente y se anaden los invariantes de Bolivia que
-- conviene poder comprobar desde anon.
--
-- No se toca ninguna tabla ni dato: solo la forma de este reporte.

CREATE OR REPLACE FUNCTION public.rpc_public_schema_contract()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'version', '20260925_bolivia_v1',
    'pais', 'BO',
    'ciudad_predeterminada', 'cochabamba',
    'moneda', 'BOB',
    'modelo_de_pago', 'qr_local_entre_las_partes',
    'comision_por_pedido', 0,
    'contacto_del_repartidor_visible', true,
    'tablas_de_cobros', 'ninguna'
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_public_schema_contract() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_public_schema_contract() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.rpc_public_schema_contract() IS
  'Contrato de esquema publico de NOTIGAS Bolivia. Sin cola de cobros: el pago es por QR local entre comprador y repartidor.';
