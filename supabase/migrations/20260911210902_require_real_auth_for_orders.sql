DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
CREATE POLICY pedidos_insert ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid()))::text=user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS pedidos_select_strict ON public.pedidos;
CREATE POLICY pedidos_select_strict ON public.pedidos FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR driver_id=((select auth.uid()))::text OR (select public.is_admin_email())));
DROP POLICY IF EXISTS pedidos_update_strict ON public.pedidos;
CREATE POLICY pedidos_update_strict ON public.pedidos FOR UPDATE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR driver_id=((select auth.uid()))::text OR (select public.is_admin_email())))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (user_id=((select auth.uid()))::text OR driver_id=((select auth.uid()))::text OR (select public.is_admin_email())));
NOTIFY pgrst, 'reload schema';
