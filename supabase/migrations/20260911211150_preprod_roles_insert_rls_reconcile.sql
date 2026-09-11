DROP POLICY IF EXISTS usuarios_roles_insert ON public.usuarios_roles;
CREATE POLICY usuarios_roles_insert ON public.usuarios_roles FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select public.is_admin_email()));
NOTIFY pgrst, 'reload schema';
