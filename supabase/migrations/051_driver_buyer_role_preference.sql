-- 051_driver_buyer_role_preference.sql
-- Inicializa la preferencia para fichas existentes. A partir de esta versión,
-- el propio usuario puede alternar profiles.role entre repartidor y vecino sin
-- borrar su ficha en choferes_habilitados ni cerrar su sesión.

BEGIN;

UPDATE public.profiles AS p
SET role = 'repartidor', updated_at = now()
WHERE p.role = 'vecino'
  AND EXISTS (
    SELECT 1
    FROM public.choferes_habilitados ch
    WHERE ch.user_id = p.id::text
  );

DROP POLICY IF EXISTS "Profiles User ALL" ON public.profiles;
CREATE POLICY "Profiles User ALL" ON public.profiles FOR ALL
USING (auth.uid() = id OR public.is_admin_email())
WITH CHECK (
  public.is_admin_email()
  OR (auth.uid() = id AND role IN ('vecino', 'repartidor'))
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('051', 'driver_buyer_role_preference')
ON CONFLICT (version) DO NOTHING;

COMMIT;
