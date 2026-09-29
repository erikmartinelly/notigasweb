-- ============================================================================
-- Permisos de escritura en suscripciones_recarga
-- ----------------------------------------------------------------------------
-- El repositorio revoca INSERT/UPDATE/DELETE de forma amplia y concede tabla por
-- tabla (migraciones 048 y 069). Por eso una tabla creada por SQL nace unicamente
-- con SELECT: sin este GRANT el alta desde la app fallaba con
-- "permission denied for table suscripciones_recarga".
--
-- Se concede solo a authenticated. El aislamiento de filas no depende del GRANT
-- sino de RLS, que limita cada suscripcion a su propio vecino con
-- user_id = auth.uid(); anon no recibe nada y ademas las politicas son
-- TO authenticated.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suscripciones_recarga TO authenticated;
REVOKE ALL ON public.suscripciones_recarga FROM anon;

DO $$
DECLARE
  v_faltan text;
BEGIN
  SELECT string_agg(p, ', ') INTO v_faltan
  FROM unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name    = 'suscripciones_recarga'
       AND grantee       = 'authenticated'
       AND privilege_type = p
  );

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'a authenticated le siguen faltando privilegios: %', v_faltan;
  END IF;
END $$;
