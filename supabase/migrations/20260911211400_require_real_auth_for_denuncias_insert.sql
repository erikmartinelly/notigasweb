DROP POLICY IF EXISTS denuncias_insert ON public.denuncias;
CREATE POLICY denuncias_insert ON public.denuncias FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select auth.uid()) IS NOT NULL);
NOTIFY pgrst, 'reload schema';
