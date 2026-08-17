-- 055_map_views_and_driver_contact_sync.sql
-- Optimiza las vistas públicas de pedidos y camiones para el mapa interactivo y sincronización de radar en tiempo real.

BEGIN;

DROP VIEW IF EXISTS public.rutas_repartidores_publicas;
CREATE VIEW public.rutas_repartidores_publicas AS
SELECT
    r.id,
    CASE
        WHEN r.user_id = auth.uid()::text THEN r.user_id
        ELSE NULL::text
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS') AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP') AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución') AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    ch.placa,
    ch.productos
FROM public.rutas_repartidores r
JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = r.user_id
  );

DROP VIEW IF EXISTS public.pedidos_publicos;
CREATE VIEW public.pedidos_publicos AS
SELECT
    p.id,
    CASE
        WHEN p.user_id = auth.uid()::text THEN p.user_id
        ELSE NULL::text
    END AS user_id,
    p.categoria,
    CASE
        WHEN p.user_id = auth.uid()::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    p.cantidad,
    CASE
        WHEN p.user_id = auth.uid()::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.direccion
        ELSE NULL::text
    END AS direccion,
    CASE
        WHEN p.user_id = auth.uid()::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.telefono
        ELSE NULL::text
    END AS telefono,
    p.estado,
    CASE
        WHEN p.user_id = auth.uid()::text OR p.driver_id = auth.uid()::text THEN p.driver_id
        ELSE NULL::text
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa') AS barrio_otb,
    CASE
        WHEN p.user_id = auth.uid()::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.latitude
        ELSE round(p.latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN p.user_id = auth.uid()::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.longitude
        ELSE round(p.longitude::numeric, 3)::double precision
    END AS longitude,
    CASE
        WHEN p.user_id = auth.uid()::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.descripcion
        ELSE NULL::text
    END AS descripcion,
    COALESCE(p.visto, false) AS visto,
    p.created_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto');

GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('055', 'map_views_and_driver_contact_sync')
ON CONFLICT (version) DO NOTHING;

COMMIT;
