DROP POLICY IF EXISTS notificaciones_repartidor_select_own ON public.notificaciones_repartidor;
CREATE POLICY notificaciones_repartidor_select_own ON public.notificaciones_repartidor FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR (select public.is_admin_email())));
DROP POLICY IF EXISTS notificaciones_repartidor_update_own ON public.notificaciones_repartidor;
CREATE POLICY notificaciones_repartidor_update_own ON public.notificaciones_repartidor FOR UPDATE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR (select public.is_admin_email())))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR (select public.is_admin_email())));
DROP POLICY IF EXISTS "Drivers can read own commission payments" ON public.pagos_comisiones;
CREATE POLICY "Drivers can read own commission payments" ON public.pagos_comisiones FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR (select public.is_admin_email())));
DROP POLICY IF EXISTS "Drivers can read their own commission records" ON public.registro_comisiones;
CREATE POLICY "Drivers can read their own commission records" ON public.registro_comisiones FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR (select public.is_admin_email())));
NOTIFY pgrst, 'reload schema';
