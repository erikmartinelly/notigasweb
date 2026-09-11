DROP POLICY IF EXISTS usuarios_roles_delete ON public.usuarios_roles;
CREATE POLICY usuarios_roles_delete ON public.usuarios_roles FOR DELETE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select public.is_admin_email()));
NOTIFY pgrst, 'reload schema';
