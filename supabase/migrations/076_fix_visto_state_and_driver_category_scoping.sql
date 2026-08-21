-- ==============================================================================
-- MIGRACIÓN 076: UNIFICACIÓN DEL ESTADO 'VISTO' Y BLINDAJE DE CATEGORÍA DE CHOFER
-- ==============================================================================

-- 1. Actualizar trg_check_pedido_transition para permitir transición a 'visto'
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

  -- E. Transición hacia 'visto'
  IF NEW.estado = 'visto' AND OLD.estado NOT IN ('pendiente', 'visto') THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'Transición de estado no válida para visto desde %', OLD.estado;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Actualizar guard_pedido_mutation para permitir actualización a estado 'visto'
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
    IF OLD.estado IN ('pendiente', 'visto') THEN
      IF NEW.estado NOT IN (OLD.estado, 'cancelado', 'recibido') THEN
        RAISE EXCEPTION 'El comprador solo puede cambiar estado a cancelado o recibido en pedidos activos';
      END IF;

      IF (to_jsonb(NEW) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at']) THEN
        RAISE EXCEPTION 'El comprador solo puede mover su ubicación o cancelar el pedido';
      END IF;

      IF NEW.latitude < -90 OR NEW.latitude > 90 OR NEW.longitude < -180 OR NEW.longitude > 180 THEN
        RAISE EXCEPTION 'Coordenadas geográficas inválidas';
      END IF;

      RETURN NEW;
    END IF;

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
     AND NEW.estado IN ('pendiente', 'visto')
     AND NEW.visto = true
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['visto', 'estado', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['visto', 'estado', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Modificacion de pedido no autorizada';
END;
$function$;

-- 3. Actualizar rpc_mark_order_seen para unificar estado='visto' y visto=true
CREATE OR REPLACE FUNCTION public.rpc_mark_order_seen(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_driver_id text := auth.uid()::text;
  v_driver record;
  v_order record;
BEGIN
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = v_driver_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El usuario no es un repartidor habilitado');
  END IF;

  SELECT * INTO v_order
  FROM public.pedidos
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Validar ciudad y categoría del chofer
  IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pedido no pertenece a la ciudad del repartidor');
  END IF;

  IF NOT public.is_current_enabled_driver(v_order.ciudad, v_order.categoria) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Categoría no coincide con el repartidor');
  END IF;

  UPDATE public.pedidos
  SET visto = true,
      estado = 'visto',
      updated_at = now()
  WHERE id = p_order_id
    AND estado = 'pendiente';

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'visto', 'visto', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_order_seen(uuid) TO authenticated;
