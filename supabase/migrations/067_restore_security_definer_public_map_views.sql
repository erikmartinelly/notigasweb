-- ==============================================================================
-- NOTIGAS - MIGRACIÓN 067: RESTAURACIÓN DE VISTAS PÚBLICAS PARA MAPA
-- Soluciona:
-- 1. Repartidores no podían ver pedidos públicos (security_invoker bloqueaba por RLS de pedidos).
-- 2. Compradores no podían ver camiones activos (security_invoker bloqueaba por RLS de choferes_habilitados).
-- 3. Inclusión canónica de columnas telefono, placa y productos en rutas_repartidores_publicas.
-- ==============================================================================

-- 1. Eliminar vistas anteriores si existen para asegurar reemplazo de opciones de seguridad
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;
DROP VIEW IF EXISTS public.rutas_repartidores_publicas CASCADE;
DROP VIEW IF EXISTS public.choferes_publicos CASCADE;

-- 2. VISTA PÚBLICA DE PEDIDOS (SEGURA, CON SECURITY DEFINER / SECURITY_INVOKER = FALSE)
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

-- 3. VISTA PÚBLICA DE CAMIONES EN VIVO (CON COLUMNAS COMPLETAS REQUERIDAS POR EL MAPA)
CREATE VIEW public.rutas_repartidores_publicas
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
    r.id,
    CASE 
        WHEN (r.user_id = (SELECT auth.uid()::text)) THEN r.user_id 
        ELSE NULL::text 
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, rep.nombre, 'Repartidor NOTIGAS'::text) AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, rep.categoria, 'Gas GLP'::text) AS categoria,
    COALESCE(r.titulo, rep.placa, 'En ruta de distribución'::text) AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), ''), NULLIF(TRIM(rep.telefono), ''), NULLIF(TRIM(rep.whatsapp), '')) AS telefono,
    COALESCE(ch.placa, rep.placa, '') AS placa,
    COALESCE(ch.productos, rep.productos, '') AS productos
FROM public.rutas_repartidores r
LEFT JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
LEFT JOIN public.repartidores rep ON rep.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = r.user_id
  );

ALTER VIEW public.rutas_repartidores_publicas OWNER TO postgres;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

-- 4. VISTA PÚBLICA DE CHOFERES HABILITADOS
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
