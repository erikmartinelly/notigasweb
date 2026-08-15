-- ==============================================================================
-- 033_official_notices_and_purge_rpc.sql
-- 1. Asegurar soporte de avisos oficiales en tabla avisos
-- 2. Asignación atómica de pedidos con validación de ciudad y categoría en rpc_assign_order
-- 3. RPC rpc_purge_old_records() para ejecución manual de purga en PostgreSQL
-- ==============================================================================

-- 1. Columnas adicionales en la tabla avisos si no existen
ALTER TABLE public.avisos 
    ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'aviso',
    ADD COLUMN IF NOT EXISTS mensaje text,
    ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

-- Permitir que titulo y descripcion sean opcionales si se usa mensaje directo
ALTER TABLE public.avisos 
    ALTER COLUMN titulo DROP NOT NULL,
    ALTER COLUMN descripcion DROP NOT NULL;

-- 2. Función rpc_assign_order() con comprobación atómica de ciudad y categoría
DROP FUNCTION IF EXISTS public.rpc_assign_order(uuid);

CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id       text;
    v_driver_record   RECORD;
    v_order           RECORD;
    v_result          public.pedidos;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado.';
    END IF;

    -- A. Validar que el conductor esté registrado en choferes_habilitados
    SELECT * INTO v_driver_record
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado o no habilitado.';
    END IF;

    -- B. Obtener el pedido para validar ciudad y categoría con mensajes de error explícitos
    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido no existe.';
    END IF;

    IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver_record.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor.';
    END IF;

    IF LOWER(TRIM(COALESCE(v_order.categoria, ''))) <> LOWER(TRIM(COALESCE(v_driver_record.categoria, ''))) THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor.';
    END IF;

    -- C. Actualización atómica del pedido para evitar condiciones de carrera (Race Conditions)
    UPDATE public.pedidos
    SET
        estado = 'asignado',
        driver_id = v_driver_id,
        updated_at = now()
    WHERE id = p_order_id
      AND estado IN ('pendiente', 'visto')
      AND LOWER(TRIM(COALESCE(ciudad, ''))) = LOWER(TRIM(COALESCE(v_driver_record.ciudad, '')))
      AND LOWER(TRIM(COALESCE(categoria, ''))) = LOWER(TRIM(COALESCE(v_driver_record.categoria, '')))
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido ya no está disponible para asignación o ya fue tomado.';
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

-- 3. RPC rpc_purge_old_records() para ejecución manual desde panel de administración
CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.purge_old_records();

    RETURN jsonb_build_object(
        'ok', true,
        'executed_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated;
