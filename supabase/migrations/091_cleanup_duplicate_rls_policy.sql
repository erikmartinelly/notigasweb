-- ==============================================================================
-- MIGRACIÓN 091: LIMPIEZA DE POLÍTICAS RLS DUPLICADAS
-- ==============================================================================

-- Se elimina la política duplicada "Auth SELECT anuncios"
-- La política "Anuncios Public SELECT" (antes "anuncios_select_public") ya cubre el acceso público
DROP POLICY IF EXISTS "Auth SELECT anuncios" ON public.anuncios_globales;
