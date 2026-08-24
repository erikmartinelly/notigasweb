CREATE OR REPLACE FUNCTION public.guard_pedido_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
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
      IF (to_jsonb(NEW) - ARRAY['estado', 'driver_id', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'driver_id', 'updated_at']) THEN
        RAISE EXCEPTION 'Al asignar solo se puede modificar el estado y el driver_id';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Operacion no permitida sobre este pedido';
END;
$$;

