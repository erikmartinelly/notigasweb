-- ==========================================
-- 032_enhance_rpc_assign_order.sql
-- Mejora rpc_assign_order() con validación de ciudad y categoría
-- antes de asignar el pedido al repartidor.
-- ==========================================

DROP FUNCTION IF EXISTS public.rpc_assign_order(uuid);

CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_driver_rec RECORD;
    v_order_rec  RECORD;
    v_result     public.pedidos;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- 1. Validar que el conductor esté registrado
    SELECT * INTO v_driver_rec
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado';
    END IF;

    -- 2. Obtener el pedido para validaciones previas
    SELECT * INTO v_order_rec
    FROM public.pedidos
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    -- 3. Validar estado del pedido
    IF v_order_rec.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible (estado: %)', v_order_rec.estado;
    END IF;

    -- 4. Validar ciudad del repartidor vs pedido
    IF LOWER(TRIM(COALESCE(v_order_rec.ciudad, ''))) != LOWER(TRIM(COALESCE(v_driver_rec.ciudad, '')))
       AND COALESCE(v_order_rec.ciudad, '') != '' THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    -- 5. Validar categoría del repartidor vs pedido
    IF LOWER(TRIM(COALESCE(v_order_rec.categoria, ''))) != LOWER(TRIM(COALESCE(v_driver_rec.categoria, '')))
       AND COALESCE(v_order_rec.categoria, '') != '' THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    -- 6. Asignar pedido atómicamente (doble check de estado por concurrencia)
    UPDATE public.pedidos
    SET 
        estado = 'asignado',
        driver_id = v_driver_id
    WHERE id = p_order_id
      AND estado IN ('pendiente', 'visto')
      AND (driver_id IS NULL OR driver_id = v_driver_id)
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido ya fue asignado por otro repartidor';
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;
