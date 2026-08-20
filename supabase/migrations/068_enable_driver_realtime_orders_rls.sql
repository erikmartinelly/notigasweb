-- ==============================================================================
-- NOTIGAS - MIGRACIÓN 068: HABILITACIÓN DE REALTIME Y RLS PARA REPARTIDORES
-- ==============================================================================

-- 1. Actualizar la función is_current_enabled_driver para soportar conurbaciones y categorías abiertas
CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT public.is_banned()
    AND EXISTS (
      SELECT 1
      FROM public.choferes_habilitados ch
      WHERE ch.user_id = auth.uid()::text
        AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
        AND (
          p_ciudad IS NULL
          OR LOWER(TRIM(ch.ciudad)) = LOWER(TRIM(p_ciudad))
          OR (LOWER(TRIM(ch.ciudad)) IN ('cochabamba', 'cbba', 'cercado') AND LOWER(TRIM(p_ciudad)) IN ('cochabamba', 'cbba', 'sacaba', 'quillacollo', 'tiquipaya', 'colcapirhua', 'vinto', 'sipesipe'))
          OR (LOWER(TRIM(ch.ciudad)) IN ('santacruz', 'santa cruz') AND LOWER(TRIM(p_ciudad)) IN ('santacruz', 'santa cruz', 'warnes', 'cotoca', 'montero', 'la guardia', 'laguardia', 'porongo'))
          OR (LOWER(TRIM(ch.ciudad)) IN ('lapaz', 'la paz') AND LOWER(TRIM(p_ciudad)) IN ('lapaz', 'la paz', 'el alto', 'elalto', 'viacha', 'achocalla'))
        )
        AND (
          p_categoria IS NULL
          OR public.normalize_delivery_category(ch.categoria) = public.normalize_delivery_category(p_categoria)
          OR public.normalize_delivery_category(ch.categoria) = 'otros'
          OR public.normalize_delivery_category(p_categoria) = 'otros'
          OR LOWER(TRIM(COALESCE(ch.categoria, ''))) IN ('todos', 'all', '')
        )
    )
$$;

-- 2. Actualizar política RLS SELECT en pedidos para que Supabase Realtime distribuya nuevos pedidos a repartidores habilitados
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Dueño Driver Admin SELECT" ON public.pedidos;

CREATE POLICY "pedidos_select" ON public.pedidos 
  FOR SELECT TO authenticated 
  USING (
    (SELECT auth.uid())::text = user_id 
    OR (SELECT auth.uid())::text = driver_id 
    OR is_admin_email()
    OR (estado IN ('pendiente', 'visto') AND public.is_current_enabled_driver(ciudad, NULL::text))
  );

-- 3. Recrear la vista pedidos_publicos con security_barrier = true y security_invoker = false
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;

CREATE VIEW public.pedidos_publicos
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
    p.id,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text)) THEN p.user_id 
        ELSE NULL::text 
    END AS user_id,
    p.categoria,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.titulo 
        ELSE 'Pedido Vecinal'::text 
    END AS titulo,
    p.cantidad,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.direccion 
        ELSE NULL::text 
    END AS direccion,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.telefono 
        ELSE NULL::text 
    END AS telefono,
    p.estado,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR p.driver_id = (SELECT auth.uid()::text)) THEN p.driver_id 
        ELSE NULL::text 
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa'::text) AS barrio_otb,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.latitude 
        ELSE (round(p.latitude::numeric, 3))::double precision 
    END AS latitude,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.longitude 
        ELSE (round(p.longitude::numeric, 3))::double precision 
    END AS longitude,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.descripcion 
        ELSE NULL::text 
    END AS descripcion,
    COALESCE(p.visto, false) AS visto,
    p.created_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto');

ALTER VIEW public.pedidos_publicos OWNER TO postgres;
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;
