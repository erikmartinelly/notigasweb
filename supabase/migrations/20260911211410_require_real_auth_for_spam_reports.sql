DROP POLICY IF EXISTS reportes_spam_insert ON public.reportes_spam;
CREATE POLICY reportes_spam_insert ON public.reportes_spam FOR INSERT TO authenticated
WITH CHECK (coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false AND (select auth.uid()) IS NOT NULL);
NOTIFY pgrst, 'reload schema';
