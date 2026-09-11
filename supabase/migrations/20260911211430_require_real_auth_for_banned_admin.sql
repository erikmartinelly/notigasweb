DROP POLICY IF EXISTS "Baneados Admin ALL" ON public.usuarios_baneados;
CREATE POLICY "Baneados Admin ALL" ON public.usuarios_baneados FOR ALL TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select public.is_admin_email()))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select public.is_admin_email()));
NOTIFY pgrst, 'reload schema';
