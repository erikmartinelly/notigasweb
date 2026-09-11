DROP POLICY IF EXISTS rutas_insert_own ON public.rutas_repartidores;
CREATE POLICY rutas_insert_own ON public.rutas_repartidores FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid()))::text=user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS rutas_select_own_or_admin ON public.rutas_repartidores;
CREATE POLICY rutas_select_own_or_admin ON public.rutas_repartidores FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())));
DROP POLICY IF EXISTS rutas_update_own_or_admin ON public.rutas_repartidores;
CREATE POLICY rutas_update_own_or_admin ON public.rutas_repartidores FOR UPDATE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())));
DROP POLICY IF EXISTS rutas_delete_own_or_admin ON public.rutas_repartidores;
CREATE POLICY rutas_delete_own_or_admin ON public.rutas_repartidores FOR DELETE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())));
NOTIFY pgrst, 'reload schema';
