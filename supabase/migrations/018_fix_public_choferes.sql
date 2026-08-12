-- 018_fix_public_choferes.sql
-- Allow anyone to see the list of drivers (choferes_habilitados) so unauthenticated buyers can see them.

DO $$
BEGIN
    DROP POLICY IF EXISTS "Auth SELECT choferes" ON choferes_habilitados;
    DROP POLICY IF EXISTS "Public SELECT choferes" ON choferes_habilitados;
    
    CREATE POLICY "Public SELECT choferes" ON choferes_habilitados FOR SELECT USING (true);
END $$;
