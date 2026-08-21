-- ==============================================================================
-- MIGRACIÓN 078: AISLAMIENTO ESTRICTO POR CATEGORÍA Y BLINDAJE DE RLS EN PEDIDOS
-- ==============================================================================

-- 1. Actualizar is_current_enabled_driver para coincidencia precisa de categoría y chofer
CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(p_ciudad text DEFAULT NULL, p_categoria text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id = (SELECT auth.uid())::text
      AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
      AND (p_ciudad IS NULL OR LOWER(TRIM(ch.ciudad)) = LOWER(TRIM(p_ciudad)))
      AND (
        p_categoria IS NULL
        OR LOWER(TRIM(ch.categoria)) IN ('todos', 'otros')
        OR LOWER(TRIM(ch.categoria)) = LOWER(TRIM(p_categoria))
        OR (LOWER(TRIM(ch.categoria)) IN ('gas', 'gas glp') AND LOWER(TRIM(p_categoria)) IN ('gas', 'gas glp', 'garrafa'))
        OR (LOWER(TRIM(ch.categoria)) IN ('agua', 'agua potable') AND LOWER(TRIM(p_categoria)) IN ('agua', 'agua potable', 'botellon'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = ch.user_id
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) TO anon, authenticated;

-- 2. Actualizar la vista pública pedidos_publicos garantizando envío de p.categoria
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;
CREATE VIEW public.pedidos_publicos WITH (security_invoker = true) AS
SELECT
    p.id,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text THEN p.user_id
        ELSE NULL::text
    END AS user_id,
    p.categoria,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    p.cantidad,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() THEN p.direccion
        ELSE COALESCE(p.barrio_otb, 'Zona indicada en el mapa')
    END AS direccion,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() THEN p.telefono
        ELSE NULL::text
    END AS telefono,
    p.estado,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text THEN p.driver_id
        ELSE NULL::text
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa') AS barrio_otb,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, p.categoria) THEN p.latitude
        ELSE round(p.latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, p.categoria) THEN p.longitude
        ELSE round(p.longitude::numeric, 3)::double precision
    END AS longitude,
    p.visto,
    p.created_at,
    p.updated_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto', 'asignado')
  AND p.created_at >= (now() - interval '48 hours')
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = p.user_id
  );

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- 3. Blindar políticas RLS en public.pedidos exigiendo coincidencia estricta de ciudad y categoría
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select_own_or_driver_or_admin" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select_strict" ON public.pedidos;

CREATE POLICY "pedidos_select_strict" ON public.pedidos
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR is_admin_email()
  OR (
    estado IN ('pendiente', 'visto')
    AND driver_id IS NULL
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
);

DROP POLICY IF EXISTS "pedidos_update_own_or_driver_or_admin" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_update_own" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_update_strict" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Actualizar admin" ON public.pedidos;

CREATE POLICY "pedidos_update_strict" ON public.pedidos
FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR is_admin_email()
  OR (
    estado IN ('pendiente', 'visto')
    AND driver_id IS NULL
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR is_admin_email()
  OR (
    estado = 'asignado'
    AND driver_id = (SELECT auth.uid())::text
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
  OR (
    estado IN ('pendiente', 'visto')
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
);
