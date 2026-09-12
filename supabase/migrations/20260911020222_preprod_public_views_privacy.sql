-- Recovered from the applied Supabase migration history to restore Git/remote parity.
DROP VIEW IF EXISTS public.rutas_repartidores_publicas;
CREATE VIEW public.rutas_repartidores_publicas WITH (security_barrier = true) AS
WITH base AS (
  SELECT r.*, ch.nombre_completo, ch.telefono_whatsapp, ch.placa AS driver_placa,
         ch.productos AS driver_productos, ch.color_camion AS driver_color_camion,
         ch.precio_balon_10kg AS driver_precio,
         ((SELECT auth.uid())::text = r.user_id OR public.is_admin_email() OR EXISTS (
           SELECT 1 FROM public.pedidos p
           WHERE p.user_id = (SELECT auth.uid())::text AND p.driver_id = r.user_id AND p.estado = 'asignado'
         )) AS can_private
  FROM public.rutas_repartidores r
  JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
  WHERE r.last_active >= now() - interval '10 minutes'
    AND ch.bloqueado IS NOT TRUE
    AND ch.estado_servicio = 'activo'
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE (ub.user_id IS NOT NULL AND ub.user_id = r.user_id)
         OR (ub.telefono IS NOT NULL AND ch.telefono_whatsapp IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
         OR (ub.placa IS NOT NULL AND ch.placa IS NOT NULL AND lower(ub.placa) = lower(ch.placa))
         OR (ub.device_id IS NOT NULL AND ch.device_id IS NOT NULL AND ub.device_id = ch.device_id)
    )
)
SELECT id,
       CASE WHEN can_private THEN user_id ELSE NULL::text END AS user_id,
       COALESCE(distribuidor_nombre, nombre_completo, 'Repartidor NOTIGAS') AS distribuidor_nombre,
       COALESCE(categoria, 'Gas GLP') AS categoria,
       COALESCE(titulo, 'En ruta de distribución') AS titulo,
       ciudad,
       CASE WHEN can_private THEN latitude ELSE public.fn_blur_latitude(id, latitude) END AS latitude,
       CASE WHEN can_private THEN longitude ELSE public.fn_blur_longitude(id, latitude, longitude) END AS longitude,
       COALESCE(garrafas_agotadas, false) AS garrafas_agotadas,
       last_active,
       CASE WHEN can_private THEN COALESCE(NULLIF(TRIM(telefono), ''), NULLIF(TRIM(telefono_whatsapp), '')) ELSE NULL::text END AS telefono,
       CASE WHEN can_private THEN COALESCE(driver_placa, '') ELSE NULL::text END AS placa,
       COALESCE(driver_productos, '') AS productos,
       COALESCE(garrafas_agotadas, false) AS balones_agotados,
       COALESCE(NULLIF(TRIM(color_camion), ''), NULLIF(TRIM(driver_color_camion), ''), '') AS color_camion,
       COALESCE(precio_balon_10kg, driver_precio) AS precio_balon_10kg,
       false AS es_premium,
       created_at AS route_created_at,
       'credito'::text AS tipo_plan
FROM base;
ALTER VIEW public.rutas_repartidores_publicas OWNER TO postgres;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

DROP VIEW IF EXISTS public.choferes_publicos;
CREATE VIEW public.choferes_publicos WITH (security_barrier = true) AS
WITH base AS (
  SELECT ch.*,
         ((SELECT auth.uid())::text = ch.user_id OR public.is_admin_email() OR EXISTS (
           SELECT 1 FROM public.pedidos p
           WHERE p.user_id = (SELECT auth.uid())::text AND p.driver_id = ch.user_id AND p.estado = 'asignado'
         )) AS can_private
  FROM public.choferes_habilitados ch
  WHERE lower(trim(coalesce(ch.estado_verificacion,''))) = 'aprobado'
    AND ch.bloqueado IS NOT TRUE
    AND ch.estado_servicio = 'activo'
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE (ub.user_id IS NOT NULL AND ub.user_id = ch.user_id)
         OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
         OR (ub.placa IS NOT NULL AND lower(ub.placa) = lower(ch.placa))
         OR (ub.device_id IS NOT NULL AND ub.device_id = ch.device_id)
         OR (ub.dni IS NOT NULL AND ub.dni = ch.dni)
    )
)
SELECT id,
       CASE WHEN can_private THEN user_id ELSE NULL::text END AS user_id,
       nombre_completo, categoria, ciudad, zonas, schedule,
       CASE WHEN can_private THEN placa ELSE NULL::text END AS placa,
       productos,
       CASE WHEN can_private THEN telefono_whatsapp ELSE NULL::text END AS telefono,
       NULL::text AS descripcion, NULL::text AS foto_url,
       COALESCE(color_camion, '') AS color_camion,
       precio_balon_10kg,
       false AS es_premium,
       NULL::timestamptz AS premium_vence_at,
       estado_verificacion, created_at
FROM base
ORDER BY created_at DESC;
ALTER VIEW public.choferes_publicos OWNER TO postgres;
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;
