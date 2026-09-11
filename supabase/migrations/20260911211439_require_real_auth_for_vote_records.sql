DROP POLICY IF EXISTS votos_select ON public.votos_registro;
CREATE POLICY votos_select ON public.votos_registro FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid()))::text=user_id);
DROP POLICY IF EXISTS votos_insert ON public.votos_registro;
CREATE POLICY votos_insert ON public.votos_registro FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid()))::text=user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS votos_delete ON public.votos_registro;
CREATE POLICY votos_delete ON public.votos_registro FOR DELETE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid()))::text=user_id);
NOTIFY pgrst, 'reload schema';
