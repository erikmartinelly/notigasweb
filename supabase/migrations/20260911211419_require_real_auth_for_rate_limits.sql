DROP POLICY IF EXISTS rate_limits_system_policy ON public.security_rate_limits;
CREATE POLICY rate_limits_system_policy ON public.security_rate_limits FOR ALL TO authenticated
USING (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND user_id=(select auth.uid()))
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND user_id=(select auth.uid()));
NOTIFY pgrst, 'reload schema';
