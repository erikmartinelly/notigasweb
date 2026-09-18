-- ============================================================================
-- CHECKLIST PRE-LANZAMIENTO (ítems 1 y 2)
--
-- 1) RLS: cerrar el DELETE de usuarios autenticados sobre tablas financieras.
--    - choferes_habilitados: el DELETE queda exclusivo de administradores.
--      Un repartidor ya no puede eliminar su propia ficha financiera.
--    - security_rate_limits: la política FOR ALL permitía a un usuario borrar
--      sus propios registros de throttling (auto-bypass). Se reemplaza por
--      SELECT/INSERT propios, sin capacidad de UPDATE/DELETE. El enforcement
--      real corre bajo service_role vía funciones SECURITY DEFINER.
--
-- 2) Completar el hardening de search_path de los RPC SECURITY DEFINER que
--    mutan pedidos/asignación/ubicación/estado. PostgreSQL busca pg_temp
--    implícitamente PRIMERO si no se lo lista; listarlo EXPLÍCITAMENTE al final
--    evita que un esquema temporal del llamante capture nombres sin calificar
--    dentro de la función.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. choferes_habilitados: DELETE solo para administradores
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS choferes_delete ON public.choferes_habilitados;
CREATE POLICY choferes_delete ON public.choferes_habilitados FOR DELETE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select public.is_admin_email()));

-- ---------------------------------------------------------------------------
-- 1b. security_rate_limits: sin UPDATE/DELETE para authenticated
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rate_limits_system_policy ON public.security_rate_limits;
CREATE POLICY rate_limits_system_policy ON public.security_rate_limits FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND user_id=(select auth.uid()));
CREATE POLICY rate_limits_select_own ON public.security_rate_limits FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND user_id=(select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. search_path hardening de RPC mutadores SECURITY DEFINER
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.rpc_cancel_own_order(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.rpc_mark_order_seen(uuid)
  SET search_path = public, auth, pg_temp;

ALTER FUNCTION public.rpc_update_order_location(uuid, double precision, double precision)
  SET search_path = public, auth, pg_temp;

ALTER FUNCTION public.rpc_admin_renew_order(uuid)
  SET search_path = public, pg_temp;

NOTIFY pgrst, 'reload schema';

COMMIT;