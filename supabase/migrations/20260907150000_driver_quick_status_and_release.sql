-- ============================================================================
-- MIGRACIÓN 093: ESTADOS RÁPIDOS PARA REPARTIDOR Y LIBERACIÓN DE PEDIDOS (P2P)
-- ============================================================================

-- 1. Agregar columna subestado a pedidos
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS subestado text DEFAULT NULL;

-- 2. Actualizar función guard_pedido_mutation
CREATE OR REPLACE FUNCTION public.guard_pedido_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF OLD.user_id = v_uid THEN
    IF OLD.estado IN ('pendiente', 'visto') THEN
      IF NEW.estado NOT IN (OLD.estado, 'cancelado', 'entregado') THEN
        RAISE EXCEPTION 'El comprador solo puede cambiar estado a cancelado o entregado en pedidos pendientes';
      END IF;

      IF (to_jsonb(NEW) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at']) THEN
        RAISE EXCEPTION 'El comprador solo puede mover su ubicacion o cancelar el pedido';
      END IF;

      IF NEW.latitude < -90 OR NEW.latitude > 90 OR NEW.longitude < -180 OR NEW.longitude > 180 THEN
        RAISE EXCEPTION 'Coordenadas geograficas invalidas';
      END IF;

      RETURN NEW;
    END IF;

    IF OLD.estado IN ('asignado', 'entregado') THEN
      IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
         OR NEW.estado NOT IN (OLD.estado, 'entregado', 'cancelado') THEN
        RAISE EXCEPTION 'El comprador solo puede confirmar la recepcion (entregado) o cancelar el pedido';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No se pueden modificar pedidos finalizados';
  END IF;

  IF OLD.driver_id = v_uid THEN
    IF OLD.estado = 'asignado' THEN
      IF (to_jsonb(NEW) - ARRAY['estado', 'subestado', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'subestado', 'updated_at'])
         OR NEW.estado NOT IN (OLD.estado, 'entregado', 'cancelado', 'pendiente') THEN
        RAISE EXCEPTION 'El repartidor solo puede marcar como entregado o cancelar/soltar la asignacion';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'El repartidor no puede modificar un pedido que ya no le esta asignado o esta finalizado';
  END IF;

  IF OLD.estado IN ('pendiente', 'visto') THEN
    IF NEW.estado = 'asignado' THEN
      IF NEW.driver_id <> v_uid THEN
        RAISE EXCEPTION 'No puedes asignar el pedido a otro repartidor';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['estado', 'driver_id', 'subestado', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'driver_id', 'subestado', 'updated_at']) THEN
        RAISE EXCEPTION 'Al asignar solo se puede modificar el estado y el driver_id';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Operacion no permitida sobre este pedido';
END;
$function$;

-- 3. RPC para cambiar estado rápido (en_camino / en_puerta)
CREATE OR REPLACE FUNCTION public.rpc_driver_set_quick_status(p_order_id uuid, p_quick_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_driver_id text := auth.uid()::text;
    v_order record;
    v_clean_status text;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    v_clean_status := LOWER(TRIM(COALESCE(p_quick_status, '')));
    IF v_clean_status NOT IN ('en_camino', 'en_puerta') THEN
        RAISE EXCEPTION 'Estado rápido no válido. Use en_camino o en_puerta';
    END IF;

    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.driver_id <> v_driver_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: este pedido no está asignado a tu cuenta';
    END IF;

    IF v_order.estado <> 'asignado' AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'El pedido no se encuentra en estado asignado';
    END IF;

    UPDATE public.pedidos
    SET subestado = v_clean_status,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'subestado', v_clean_status,
        'updated_at', now()
    );
END;
$function$;

-- 4. RPC para liberar pedido (no podré llegar / soltar asignación)
CREATE OR REPLACE FUNCTION public.rpc_driver_release_order(p_order_id uuid, p_motivo text DEFAULT 'no_podre_llegar')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_driver_id text := auth.uid()::text;
    v_order record;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.driver_id <> v_driver_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: este pedido no está asignado a tu cuenta';
    END IF;

    IF v_order.estado <> 'asignado' AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Solo se pueden liberar pedidos en estado asignado';
    END IF;

    -- Regresar pedido a estado 'pendiente' y quitar driver_id para que vuelva al radar de la competencia P2P
    UPDATE public.pedidos
    SET estado = 'pendiente',
        driver_id = NULL,
        subestado = NULL,
        visto = false,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'pendiente',
        'released', true,
        'message', 'Pedido liberado correctamente para otros repartidores'
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_driver_set_quick_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_driver_release_order(uuid, text) TO authenticated;

-- 5. Actualizar vista pedidos_publicos incluyendo subestado
CREATE OR REPLACE VIEW public.pedidos_publicos WITH (security_invoker = false, security_barrier = true) AS
SELECT
    p.id,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text THEN p.user_id
        ELSE NULL::text
    END AS user_id,
    p.categoria,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR (p.driver_id IS NULL AND public.is_current_enabled_driver(p.ciudad, p.categoria))
        THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR (p.driver_id IS NULL AND public.is_current_enabled_driver(p.ciudad, p.categoria))
        THEN p.descripcion
        ELSE NULL::text
    END AS descripcion,
    p.cantidad,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR (p.driver_id IS NULL AND public.is_current_enabled_driver(p.ciudad, p.categoria))
        THEN p.direccion
        ELSE COALESCE(p.barrio_otb, 'Zona indicada en el mapa')
    END AS direccion,
    CASE
        WHEN p.driver_id IS NOT NULL AND p.driver_id <> (SELECT auth.uid())::text AND NOT public.is_admin_email() THEN NULL::text
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR (p.driver_id IS NULL AND public.is_current_enabled_driver(p.ciudad, p.categoria))
        THEN p.telefono
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
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR (p.driver_id IS NULL AND public.is_current_enabled_driver(p.ciudad, p.categoria))
        THEN p.latitude
        ELSE round(p.latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR (p.driver_id IS NULL AND public.is_current_enabled_driver(p.ciudad, p.categoria))
        THEN p.longitude
        ELSE round(p.longitude::numeric, 3)::double precision
    END AS longitude,
    p.visto,
    p.created_at,
    p.updated_at,
    p.subestado
FROM public.pedidos p
WHERE 
  p.user_id = (SELECT auth.uid())::text
  OR public.is_admin_email()
  OR p.driver_id = (SELECT auth.uid())::text
  OR (p.estado IN ('pendiente', 'visto') AND p.driver_id IS NULL)
  AND p.created_at >= (now() - interval '48 hours')
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = p.user_id
  );

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;
