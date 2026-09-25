-- =============================================================================
-- NOTIGAS Bolivia - Visibilidad del contacto de pedidos abiertos (append-only)
-- Fecha: 2026-09-25
--
-- Requisito: cualquier repartidor aprobado puede ver los datos de contacto del
-- solicitante (telefono, direccion, barrio/OTB) de los pedidos ABIERTOS de su
-- misma categoria y ciudad, para poder ofertar el servicio.
--
-- Reglas que se mantienen intactas:
--   - No se expose nada a visitantes anonymous.
--   - En cuanto un repartidor toma el pedido (driver_id IS NOT NULL) desaparece
--     del mapa (eso ya lo hacia private.can_view_order_radar).
--   - Un pedido dirigido a un repartidor concreto sigue siendo invisible para
--     el resto.
--   - Solo repartidores aprobados, no bloqueados y en servicio activo.
--   - La politica existente pedidos_select_strict no se modifica.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Funcion de elegibilidad para ver el contacto
-- -----------------------------------------------------------------------------
-- Reutiliza exactamente la misma normalizacion de categorias que
-- private.can_view_order_radar (colapsa gas/agua) para que un repartidor vea
-- el mismo conjunto de pedidos que ve en el mapa.
CREATE OR REPLACE FUNCTION private.can_view_order_contact(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private', 'pg_temp'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
  d record;
  p record;
  oc text;
  dc text;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RETURN false;
  END IF;

  SELECT id, user_id, categoria, ciudad, estado, driver_id,
         requested_driver_id, driver_request_status
    INTO p FROM public.pedidos WHERE id = p_order_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- El propio solicitante y el repartidor asignado ya estan cubiertos por
  -- pedidos_select_strict; aqui solo interesan pedidos abiertos y sin tomar.
  IF p.user_id = v_uid OR p.driver_id IS NOT NULL THEN RETURN false; END IF;
  IF p.estado NOT IN ('pendiente','visto') THEN RETURN false; END IF;

  -- Una solicitud dirigida es invisible para cualquier otro repartidor.
  IF p.requested_driver_id IS NOT NULL
     AND (p.driver_request_status <> 'requested' OR p.requested_driver_id <> v_uid) THEN
    RETURN false;
  END IF;

  SELECT categoria, ciudad, estado_verificacion, bloqueado, estado_servicio
    INTO d FROM public.choferes_habilitados WHERE user_id = v_uid LIMIT 1;
  IF NOT FOUND
     OR lower(trim(coalesce(d.estado_verificacion,''))) <> 'aprobado'
     OR coalesce(d.bloqueado, false)
     OR coalesce(d.estado_servicio,'activo') <> 'activo'
     OR lower(trim(coalesce(d.ciudad,''))) <> lower(trim(coalesce(p.ciudad,''))) THEN
    RETURN false;
  END IF;

  -- No se ofrece el pedido a repartidores suspendidos por el administrador.
  IF EXISTS (SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = v_uid) THEN
    RETURN false;
  END IF;

  oc := lower(trim(coalesce(p.categoria,'')));
  dc := lower(trim(coalesce(d.categoria,'')));
  IF oc ilike '%gas%' OR oc ilike '%glp%' OR oc ilike '%garrafa%' OR oc ilike '%balon%' OR oc ilike '%balón%' THEN oc := 'gas';
  ELSIF oc ilike '%agua%' OR oc ilike '%botell%' THEN oc := 'agua'; END IF;
  IF dc ilike '%gas%' OR dc ilike '%glp%' OR dc ilike '%garrafa%' OR dc ilike '%balon%' OR dc ilike '%balón%' THEN dc := 'gas';
  ELSIF dc ilike '%agua%' OR dc ilike '%botell%' THEN dc := 'agua'; END IF;

  RETURN oc = dc;
END;
$function$;

COMMENT ON FUNCTION private.can_view_order_contact(uuid) IS
  'Permite a un repartidor aprobado ver los datos de contacto de un pedido abierto de su misma categoria y ciudad. No aplica a pedidos ya tomados ni a visitantes anonymous.';

-- -----------------------------------------------------------------------------
-- 2. Politica de lectura para repartidores
-- -----------------------------------------------------------------------------
-- Es additive: pedidos_select_strict y pedidos_select_requested_driver siguen
-- vigentes, asi que el solicitante y el repartidor asignado conservan su acceso.
DROP POLICY IF EXISTS pedidos_select_drivers_contacto ON public.pedidos;

CREATE POLICY pedidos_select_drivers_contacto ON public.pedidos
  FOR SELECT
  USING (
    COALESCE(((auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    AND private.can_view_order_contact(id)
  );

-- -----------------------------------------------------------------------------
-- 3. Comprobaciones
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_pedidos_mig INTEGER;
BEGIN
  SELECT count(*) INTO v_pedidos_mig
    FROM public.pedidos
   WHERE driver_id IS NOT NULL
     AND created_at < now() - interval '24 hours';
  RAISE NOTICE 'Pedidos asignados con mas de 24h (se purgan por cron): %', v_pedidos_mig;
END;
$$;

-- El cron purge_records_hourly (0 * * * *) ya archiva y borra todo pedido con
-- created_at < now() - interval '24 hours', y private.can_view_order_radar
-- ya devuelve false en cuanto driver_id IS NOT NULL. No se requiere ningun
-- cambio adicional para la visibilidad de 24h ni para la desaparece del mapa.
