-- ==============================================================================
-- Migración: Soporte para Planes de Registro de Repartidores (PRO vs Gratuito)
-- Timestamp: 20260908003000
-- ==============================================================================

-- 1. Agregar columna tipo_plan en choferes_habilitados
ALTER TABLE public.choferes_habilitados
ADD COLUMN IF NOT EXISTS tipo_plan text DEFAULT 'gratuito';

-- 2. Sincronizar registros existentes que ya sean VIP
UPDATE public.choferes_habilitados
SET tipo_plan = 'pro'
WHERE es_premium = true AND (tipo_plan IS NULL OR tipo_plan = 'gratuito');

-- 3. Índice para optimizar consultas de tipo de plan
CREATE INDEX IF NOT EXISTS idx_choferes_habilitados_tipo_plan
ON public.choferes_habilitados(tipo_plan);

-- 4. Actualizar la vista pública rutas_repartidores_publicas agregando columnas al final (retrocompatibilidad)
CREATE OR REPLACE VIEW public.rutas_repartidores_publicas AS
 SELECT r.id,
    CASE
        WHEN r.user_id = (( SELECT auth.uid()::text AS uid)) THEN r.user_id
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
    COALESCE(NULLIF(TRIM(BOTH FROM r.telefono), ''::text), NULLIF(TRIM(BOTH FROM ch.telefono_whatsapp), ''::text)) AS telefono,
    COALESCE(ch.placa, ''::text) AS placa,
    COALESCE(ch.productos, ''::text) AS productos,
    COALESCE(r.garrafas_agotadas, false) AS balones_agotados,
    COALESCE(NULLIF(TRIM(BOTH FROM r.color_camion), ''::text), NULLIF(TRIM(BOTH FROM ch.color_camion), ''::text), ''::text) AS color_camion,
    COALESCE(r.precio_balon_10kg, ch.precio_balon_10kg) AS precio_balon_10kg,
    COALESCE(ch.es_premium AND (ch.premium_vence_at IS NULL OR ch.premium_vence_at >= now()), false) AS es_premium,
    r.created_at AS route_created_at,
    COALESCE(ch.tipo_plan, CASE WHEN ch.es_premium THEN 'pro' ELSE 'gratuito' END) AS tipo_plan
   FROM rutas_repartidores r
     LEFT JOIN choferes_habilitados ch ON ch.user_id = r.user_id
  WHERE r.last_active >= (now() - '00:10:00'::interval) AND NOT (EXISTS ( SELECT 1
           FROM usuarios_baneados ub
          WHERE ub.user_id = r.user_id));

-- Otorgar permisos de lectura en la vista
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated, service_role;
