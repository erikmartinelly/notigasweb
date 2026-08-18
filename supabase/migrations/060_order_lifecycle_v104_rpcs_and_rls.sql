-- ============================================================================
-- MIGRACIÓN 060: CICLO DE VIDA DE PEDIDOS V104, RPCS Y ENDURECIMIENTO RLS
-- ============================================================================

-- 1. Asegurar check constraint canónico de 5 estados
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check 
  CHECK (estado IN ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado'));

-- 2. RPC para que el comprador confirme recepción
CREATE OR REPLACE FUNCTION public.rpc_confirm_order_received(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id text;
    v_order record;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.user_id <> v_user_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: no eres el propietario de este pedido';
    END IF;

    IF v_order.estado IN ('entregado', 'cancelado') THEN
        RAISE EXCEPTION 'El pedido ya fue finalizado previamente';
    END IF;

    IF v_order.estado NOT IN ('asignado', 'pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido no se encuentra en un estado válido para confirmar';
    END IF;

    UPDATE public.pedidos
    SET
        estado = 'entregado',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'entregado',
        'confirmed_by', 'buyer'
    );
END;
$$;

-- 3. RPC para que el repartidor confirme entrega
CREATE OR REPLACE FUNCTION public.rpc_driver_confirm_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_driver_id text;
    v_order record;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
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
    SET
        estado = 'entregado',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'entregado',
        'confirmed_by', 'driver'
    );
END;
$$;

-- 4. RPC para que el comprador cancele su pedido
CREATE OR REPLACE FUNCTION public.rpc_cancel_own_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id text;
    v_order record;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.user_id <> v_user_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: no eres el propietario de este pedido';
    END IF;

    IF v_order.estado IN ('entregado', 'cancelado') THEN
        RAISE EXCEPTION 'El pedido ya fue finalizado y no puede ser cancelado';
    END IF;

    UPDATE public.pedidos
    SET
        estado = 'cancelado',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'cancelado'
    );
END;
$$;

-- 5. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.rpc_confirm_order_received(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_own_order(uuid) TO authenticated;

-- 6. Endurecimiento de RLS sobre pedidos
DROP POLICY IF EXISTS "Pedidos Borrar propio o admin" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Borrar admin" ON public.pedidos;
CREATE POLICY "Pedidos Borrar admin" ON public.pedidos
  FOR DELETE TO authenticated
  USING (is_admin_email());

DROP POLICY IF EXISTS "Pedidos Actualizar propio o asignado" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Actualizar admin" ON public.pedidos;
CREATE POLICY "Pedidos Actualizar admin" ON public.pedidos
  FOR UPDATE TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());
