-- Reconciliación exacta con Supabase producción: 20260911020205
ALTER TABLE public.choferes_habilitados DROP CONSTRAINT IF EXISTS choferes_estado_servicio_check;
ALTER TABLE public.choferes_habilitados ADD CONSTRAINT choferes_estado_servicio_check CHECK (estado_servicio IN ('activo','suspendido_tope','suspendido','suspendido_mora','suspendido_pago','inactivo','baneado'));

DROP POLICY IF EXISTS rutas_select_public ON public.rutas_repartidores;
DROP POLICY IF EXISTS rutas_select_own_or_admin ON public.rutas_repartidores;
CREATE POLICY rutas_select_own_or_admin ON public.rutas_repartidores FOR SELECT TO authenticated USING (((SELECT auth.uid())::text = user_id) OR public.is_admin_email());

REVOKE INSERT, UPDATE, DELETE ON public.admin_credentials FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usuarios_baneados FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usuarios_roles FROM authenticated;

DROP POLICY IF EXISTS admin_credentials_select_own ON public.admin_credentials;
CREATE POLICY admin_credentials_select_own ON public.admin_credentials FOR SELECT TO authenticated USING (lower(trim(email)) = lower(trim(coalesce((SELECT auth.jwt()->>'email'),''))));

DROP POLICY IF EXISTS usuarios_roles_select_own_or_admin ON public.usuarios_roles;
CREATE POLICY usuarios_roles_select_own_or_admin ON public.usuarios_roles FOR SELECT TO authenticated USING (lower(trim(email)) = lower(trim(coalesce((SELECT auth.jwt()->>'email'),''))) OR (SELECT public.is_admin_email()));
