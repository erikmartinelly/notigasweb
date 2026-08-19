-- ============================================================================
-- MIGRACIÓN 062: RESOLUCIÓN DE ALERTA DE SEGURIDAD POSTGIS & RLS PUBLIC
-- ============================================================================

-- 1. Asegurar PostGIS en el esquema seguro "extensions"
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- 2. Asegurar que las RPCs de reparto sólo sean ejecutables por usuarios autenticados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_driver_confirm_delivery') THEN
    REVOKE EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated;
  END IF;
END $$;

-- 3. Política explícita para tabla interna security_rate_limits
CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limits_admin_only" ON public.security_rate_limits;
CREATE POLICY "rate_limits_admin_only" ON public.security_rate_limits
  FOR ALL TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());
