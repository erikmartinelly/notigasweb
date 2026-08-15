-- 035_refine_rpc_assign_order_and_index.sql
-- 1. Actualizar rpc_assign_order() retornando JSONB con FOR UPDATE y normalización de categorías
DROP FUNCTION IF EXISTS public.rpc_assign_order(uuid);

CREATE OR REPLACE FUNCTION public.rpc_assign_order(
    p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_driver record;
    v_order record;
    v_order_cat text;
    v_driver_cat text;
BEGIN
    -- 1. Validar autenticación
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- 2. Validar baneo
    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está baneado o no autorizado';
    END IF;

    -- 3. Obtener chofer
    SELECT *
    INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no es un repartidor habilitado';
    END IF;

    -- 4. Obtener pedido con bloqueo FOR UPDATE
    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    -- 5. Validar ciudad (insensible a mayúsculas)
    IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    -- 6. Normalizar y validar categoría
    v_order_cat := LOWER(TRIM(COALESCE(v_order.categoria, '')));
    v_driver_cat := LOWER(TRIM(COALESCE(v_driver.categoria, '')));

    IF v_order_cat ILIKE '%gas%' OR v_order_cat ILIKE '%glp%' OR v_order_cat ILIKE '%garrafa%' THEN
        v_order_cat := 'gas';
    ELSIF v_order_cat ILIKE '%agua%' OR v_order_cat ILIKE '%botell%' THEN
        v_order_cat := 'agua';
    END IF;

    IF v_driver_cat ILIKE '%gas%' OR v_driver_cat ILIKE '%glp%' OR v_driver_cat ILIKE '%garrafa%' THEN
        v_driver_cat := 'gas';
    ELSIF v_driver_cat ILIKE '%agua%' OR v_driver_cat ILIKE '%botell%' THEN
        v_driver_cat := 'agua';
    END IF;

    IF v_order_cat <> v_driver_cat AND v_driver_cat <> 'otros' AND v_order_cat <> 'otros' THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    -- 7. Validar estado disponible
    IF v_order.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible';
    END IF;

    -- 8. Asignar pedido
    UPDATE public.pedidos
    SET
        estado = 'asignado',
        driver_id = v_driver_id,
        updated_at = now()
    WHERE id = p_order_id
      AND estado IN ('pendiente', 'visto');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido fue asignado por otro repartidor';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'driver_id', v_driver_id,
        'estado', 'asignado'
    );
END;
$$;

-- 2. Actualizar rpc_mark_order_seen()
CREATE OR REPLACE FUNCTION public.rpc_mark_order_seen(
    p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver record;
    v_order record;
    v_order_cat text;
    v_driver_cat text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT *
    INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = auth.uid()::text
      AND NOT EXISTS (
          SELECT 1
          FROM public.usuarios_baneados b
          WHERE b.user_id = auth.uid()::text
      )
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repartidor no habilitado';
    END IF;

    SELECT id, ciudad, categoria, estado
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.estado <> 'pendiente' THEN
        RETURN;
    END IF;

    IF LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_order.ciudad, ''))) THEN
        RAISE EXCEPTION 'Pedido fuera de la zona del repartidor';
    END IF;

    v_order_cat := LOWER(TRIM(COALESCE(v_order.categoria, '')));
    v_driver_cat := LOWER(TRIM(COALESCE(v_driver.categoria, '')));

    IF v_order_cat ILIKE '%gas%' OR v_order_cat ILIKE '%glp%' OR v_order_cat ILIKE '%garrafa%' THEN
        v_order_cat := 'gas';
    ELSIF v_order_cat ILIKE '%agua%' OR v_order_cat ILIKE '%botell%' THEN
        v_order_cat := 'agua';
    END IF;

    IF v_driver_cat ILIKE '%gas%' OR v_driver_cat ILIKE '%glp%' OR v_driver_cat ILIKE '%garrafa%' THEN
        v_driver_cat := 'gas';
    ELSIF v_driver_cat ILIKE '%agua%' OR v_driver_cat ILIKE '%botell%' THEN
        v_driver_cat := 'agua';
    END IF;

    IF v_order_cat <> v_driver_cat AND v_driver_cat <> 'otros' AND v_order_cat <> 'otros' THEN
        RAISE EXCEPTION 'Pedido fuera de la categoría del repartidor';
    END IF;

    UPDATE public.pedidos
    SET visto = true
    WHERE id = p_order_id
      AND estado = 'pendiente';
END;
$$;

-- 3. Crear índice para acelerar consultas y asignación
CREATE INDEX IF NOT EXISTS idx_pedidos_assignment
ON public.pedidos (ciudad, categoria, estado, created_at DESC);
