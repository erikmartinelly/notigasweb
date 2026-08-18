-- ============================================================================
-- MIGRACIÓN 062: RESOLUCIÓN DE ALERTA DE SEGURIDAD POSTGIS & RLS PUBLIC
-- ============================================================================

-- 1. Mover PostGIS al esquema seguro "extensions" para eliminar spatial_ref_sys del esquema public
DROP EXTENSION IF EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

-- 2. Asegurar que las RPCs de reparto sólo sean ejecutables por usuarios autenticados
REVOKE EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated;

-- 3. Política explícita para tabla interna security_rate_limits
DROP POLICY IF EXISTS "rate_limits_admin_only" ON public.security_rate_limits;
CREATE POLICY "rate_limits_admin_only" ON public.security_rate_limits
  FOR ALL TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());
