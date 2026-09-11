-- La tabla legacy repartidores contiene teléfono y placa. La app actual usa
-- choferes_publicos / rutas_repartidores_publicas sanitizadas.
DROP POLICY IF EXISTS "Lectura publica repartidores" ON public.repartidores;
REVOKE ALL ON public.repartidores FROM PUBLIC, anon, authenticated;
CREATE POLICY repartidores_admin_select ON public.repartidores
FOR SELECT TO authenticated
USING ((select public.is_admin_email()));
GRANT SELECT ON public.repartidores TO authenticated;
NOTIFY pgrst, 'reload schema';
