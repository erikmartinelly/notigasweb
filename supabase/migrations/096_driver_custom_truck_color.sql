-- Migration 096: Add custom truck color to drivers and routes
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS color_camion text DEFAULT '';
ALTER TABLE public.rutas_repartidores ADD COLUMN IF NOT EXISTS color_camion text DEFAULT '';

-- Recreate choferes_publicos to include color_camion
DROP VIEW IF EXISTS public.choferes_publicos CASCADE;
CREATE VIEW public.choferes_publicos
WITH (security_barrier = true, security_invoker = false)
AS
SELECT 
    ch.id,
    ch.user_id,
    ch.nombre_completo,
    ch.categoria,
    ch.ciudad,
    ch.zonas,
    ch.schedule,
    ch.placa,
    ch.productos,
    ch.telefono_whatsapp AS telefono,
    NULL::text AS descripcion,
    NULL::text AS foto_url,
    COALESCE(ch.color_camion, '') AS color_camion,
    ch.estado_verificacion,
    ch.created_at
FROM public.choferes_habilitados ch
WHERE LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub 
    WHERE (ub.user_id IS NOT NULL AND ub.user_id = ch.user_id)
       OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
       OR (ub.placa IS NOT NULL AND LOWER(ub.placa) = LOWER(ch.placa))
  );

ALTER VIEW public.choferes_publicos OWNER TO postgres;
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;

-- Recreate rutas_repartidores_publicas to include color_camion
DROP VIEW IF EXISTS public.rutas_repartidores_publicas CASCADE;
CREATE OR REPLACE VIEW public.rutas_repartidores_publicas AS
SELECT 
    r.id,
    CASE
        WHEN r.user_id = (SELECT auth.uid()::text) THEN r.user_id
        ELSE NULL::text
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS'::text) AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP'::text) AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución'::text) AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    COALESCE(ch.placa, '') AS placa,
    COALESCE(ch.productos, '') AS productos,
    COALESCE(r.garrafas_agotadas, false) AS balones_agotados,
    COALESCE(NULLIF(TRIM(r.color_camion), ''), NULLIF(TRIM(ch.color_camion), ''), '') AS color_camion
FROM public.rutas_repartidores r
LEFT JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = r.user_id
  );

ALTER VIEW public.rutas_repartidores_publicas OWNER TO postgres;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;
