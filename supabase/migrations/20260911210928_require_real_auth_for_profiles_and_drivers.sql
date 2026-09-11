DROP POLICY IF EXISTS choferes_delete ON public.choferes_habilitados;
CREATE POLICY choferes_delete ON public.choferes_habilitados FOR DELETE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())));
DROP POLICY IF EXISTS choferes_insert ON public.choferes_habilitados;
CREATE POLICY choferes_insert ON public.choferes_habilitados FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid()))::text=user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS choferes_select ON public.choferes_habilitados;
CREATE POLICY choferes_select ON public.choferes_habilitados FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())));
DROP POLICY IF EXISTS choferes_update ON public.choferes_habilitados;
CREATE POLICY choferes_update ON public.choferes_habilitados FOR UPDATE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (((select auth.uid()))::text=user_id OR (select public.is_admin_email())));

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid())=id OR (select public.is_admin_email())));
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select auth.uid())=id AND NOT public.is_banned());
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid())=id OR (select public.is_admin_email())));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid())=id OR (select public.is_admin_email())))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND ((select auth.uid())=id OR (select public.is_admin_email())));
NOTIFY pgrst, 'reload schema';
