-- ==============================================================================
-- MIGRACIÓN 080: AGREGAR COLUMNA DESCRIPCION A LA VISTA PEDIDOS_PUBLICOS
-- ==============================================================================

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
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() OR public.is_current_enabled_driver(p.ciudad, p.categoria) THEN p.descripcion
        ELSE NULL::text
    END AS descripcion,
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
