-- ==============================================================================
-- MIGRACIÓN 075: CORRECCIÓN DE RESTRICCIÓN DE MUTACIÓN EN PEDIDOS Y SINCRONIZACIÓN DE ESQUEMA
-- ==============================================================================

-- 1. Actualizar trigger trg_check_pedido_transition para incluir estado 'recibido'
CREATE OR REPLACE FUNCTION public.trg_check_pedido_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A. Estados terminales protegidos
  IF OLD.estado IN ('entregado', 'cancelado', 'recibido') AND NEW.estado <> OLD.estado THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'No se puede modificar un pedido que ya está en estado final (%)', OLD.estado;
    END IF;
  END IF;

  -- B. Transición hacia 'entregado' o 'recibido'
  IF NEW.estado IN ('entregado', 'recibido') AND OLD.estado NOT IN ('entregado', 'recibido') THEN
    IF NEW.user_id <> auth.uid()::text AND NEW.driver_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador o el repartidor asignado pueden confirmar la entrega/recepción.';
    END IF;
  END IF;

  -- C. Transición hacia 'cancelado'
  IF NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado' THEN
    IF NEW.user_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador creador del pedido puede cancelarlo.';
    END IF;
  END IF;

  -- D. Transición hacia 'asignado'
  IF NEW.estado = 'asignado' AND OLD.estado NOT IN ('pendiente', 'visto', 'asignado') THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'Transición de estado no válida para asignación desde %', OLD.estado;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Eliminar trigger duplicado enforce_pedido_transition si existe
DROP TRIGGER IF EXISTS enforce_pedido_transition ON public.pedidos;

-- 3. Redefinir guard_pedido_mutation para permitir actualización de coordenadas/ubicación en pedidos pendientes
CREATE OR REPLACE FUNCTION public.guard_pedido_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  -- A. Administrador tiene acceso irrestricto
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- B. El comprador propietario del pedido (OLD.user_id = v_uid)
  IF OLD.user_id = v_uid THEN
    -- Si el pedido está pendiente o visto: puede cancelar, marcar recibido, y mover su ubicación
    IF OLD.estado IN ('pendiente', 'visto') THEN
      IF NEW.estado NOT IN (OLD.estado, 'cancelado', 'recibido') THEN
        RAISE EXCEPTION 'El comprador solo puede cambiar estado a cancelado o recibido en pedidos pendientes';
      END IF;

      -- Verificar que no altere campos restringidos (driver_id, user_id, categoria, etc.)
      IF (to_jsonb(NEW) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at']) THEN
        RAISE EXCEPTION 'El comprador solo puede mover su ubicación o cancelar el pedido';
      END IF;

      -- Validar rangos de coordenadas
      IF NEW.latitude < -90 OR NEW.latitude > 90 OR NEW.longitude < -180 OR NEW.longitude > 180 THEN
        RAISE EXCEPTION 'Coordenadas geográficas inválidas';
      END IF;

      RETURN NEW;
    END IF;

    -- Si el pedido ya está asignado o entregado: solo puede confirmar recepción o cancelar
    IF OLD.estado IN ('asignado', 'entregado') THEN
      IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
         OR NEW.estado NOT IN (OLD.estado, 'recibido', 'cancelado') THEN
        RAISE EXCEPTION 'El comprador solo puede confirmar la recepción o cancelar el pedido';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No se pueden modificar pedidos finalizados';
  END IF;

  -- C. El repartidor asignado (OLD.driver_id = v_uid)
  IF OLD.driver_id = v_uid THEN
    IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
       OR NEW.estado NOT IN (OLD.estado, 'entregado') THEN
      RAISE EXCEPTION 'El repartidor asignado solo puede confirmar la entrega';
    END IF;
    RETURN NEW;
  END IF;

  -- D. Un repartidor habilitado tomando el pedido (asignación)
  IF OLD.driver_id IS NULL
     AND NEW.driver_id = v_uid
     AND OLD.estado IN ('pendiente', 'visto')
     AND NEW.estado = 'asignado'
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['estado', 'driver_id', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'driver_id', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  -- E. Un repartidor habilitado marcando el pedido como 'visto'
  IF OLD.driver_id IS NULL
     AND NEW.driver_id IS NULL
     AND OLD.estado = 'pendiente'
     AND NEW.estado = OLD.estado
     AND NEW.visto = true
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['visto', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['visto', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Modificacion de pedido no autorizada';
END;
$function$;

-- 4. Recrear el RPC rpc_update_order_location asegurando ejecución
CREATE OR REPLACE FUNCTION public.rpc_update_order_location(
    p_order_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id TEXT;
    v_updated_id UUID;
    v_current_estado TEXT;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coordenadas inválidas');
    END IF;

    SELECT estado INTO v_current_estado
    FROM public.pedidos
    WHERE id = p_order_id AND user_id = v_user_id;

    IF v_current_estado IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido no encontrado o no pertenece a tu cuenta');
    END IF;

    IF v_current_estado NOT IN ('pendiente', 'visto') THEN
        RETURN jsonb_build_object('success', false, 'error', 'El pedido ya está en curso y no puede moverse');
    END IF;

    UPDATE public.pedidos
    SET latitude = p_latitude,
        longitude = p_longitude,
        updated_at = now()
    WHERE id = p_order_id
      AND user_id = v_user_id
    RETURNING id INTO v_updated_id;

    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_updated_id,
        'latitude', p_latitude,
        'longitude', p_longitude
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_order_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
