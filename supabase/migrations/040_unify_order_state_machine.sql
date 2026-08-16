-- 040_unify_order_state_machine.sql
-- Unificación formal de la máquina de estados de pedidos en PostgreSQL:
-- Estados oficiales: 'pendiente', 'visto', 'asignado', 'entregado', 'cancelado'

-- 1. Actualizar Check Constraint en tabla pedidos
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;

ALTER TABLE public.pedidos
ADD CONSTRAINT pedidos_estado_check
CHECK (estado IN ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado'));

-- 2. Trigger de validación estricta de transiciones de estado y permisos
CREATE OR REPLACE FUNCTION public.trg_check_pedido_transition()
RETURNS trigger AS $$
BEGIN
  -- A. Validación de estados terminales
  IF OLD.estado IN ('entregado', 'cancelado') AND NEW.estado <> OLD.estado THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'No se puede modificar un pedido que ya está en estado final (%)', OLD.estado;
    END IF;
  END IF;

  -- B. Transición hacia 'entregado'
  IF NEW.estado = 'entregado' AND OLD.estado <> 'entregado' THEN
    IF NEW.user_id <> auth.uid()::text AND NEW.driver_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador o el repartidor asignado pueden marcar el pedido como entregado.';
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_pedido_transition ON public.pedidos;
CREATE TRIGGER trg_validate_pedido_transition
BEFORE UPDATE OF estado ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.trg_check_pedido_transition();

-- 3. Índice optimizado para búsquedas por estado
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_ciudad_cat
ON public.pedidos (estado, ciudad, categoria, created_at DESC);
