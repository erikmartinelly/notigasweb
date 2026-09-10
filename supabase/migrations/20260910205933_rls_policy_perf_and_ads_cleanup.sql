-- Optimize admin checks in RLS and remove duplicate permissive SELECT path for ads.
DROP POLICY IF EXISTS usuarios_roles_select_own_or_admin ON public.usuarios_roles;
CREATE POLICY usuarios_roles_select_own_or_admin
ON public.usuarios_roles
FOR SELECT TO authenticated
USING (
  lower(trim(email)) = lower(trim(coalesce((SELECT auth.jwt()->>'email'),'')))
  OR (SELECT public.is_admin_email())
);

DROP POLICY IF EXISTS usuarios_roles_insert ON public.usuarios_roles;
CREATE POLICY usuarios_roles_insert
ON public.usuarios_roles
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_admin_email()));

DROP POLICY IF EXISTS usuarios_roles_update ON public.usuarios_roles;
CREATE POLICY usuarios_roles_update
ON public.usuarios_roles
FOR UPDATE TO authenticated
USING ((SELECT public.is_admin_email()))
WITH CHECK ((SELECT public.is_admin_email()));

DROP POLICY IF EXISTS usuarios_roles_delete ON public.usuarios_roles;
CREATE POLICY usuarios_roles_delete
ON public.usuarios_roles
FOR DELETE TO authenticated
USING ((SELECT public.is_admin_email()));

DROP POLICY IF EXISTS "Anuncios Admin ALL" ON public.anuncios_globales;
DROP POLICY IF EXISTS anuncios_admin_insert ON public.anuncios_globales;
DROP POLICY IF EXISTS anuncios_admin_update ON public.anuncios_globales;
DROP POLICY IF EXISTS anuncios_admin_delete ON public.anuncios_globales;

CREATE POLICY anuncios_admin_insert
ON public.anuncios_globales
FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_admin_email()));

CREATE POLICY anuncios_admin_update
ON public.anuncios_globales
FOR UPDATE TO authenticated
USING ((SELECT public.is_admin_email()))
WITH CHECK ((SELECT public.is_admin_email()));

CREATE POLICY anuncios_admin_delete
ON public.anuncios_globales
FOR DELETE TO authenticated
USING ((SELECT public.is_admin_email()));

NOTIFY pgrst, 'reload schema';