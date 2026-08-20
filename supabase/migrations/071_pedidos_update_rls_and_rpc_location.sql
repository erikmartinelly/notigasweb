-- 071_pedidos_update_rls_and_rpc_location.sql

-- 1. Asegurar permisos GRANT UPDATE para authenticated
GRANT UPDATE ON public.pedidos TO authenticated;

-- 2. Crear política RLS para que los usuarios puedan actualizar sus propios pedidos
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'pedidos' 
          AND policyname = 'pedidos_update_own'
    ) THEN
        DROP POLICY "pedidos_update_own" ON public.pedidos;
    END IF;
END $$;

CREATE POLICY "pedidos_update_own"
ON public.pedidos
FOR UPDATE
TO authenticated
USING (
    (auth.uid())::text = user_id
    AND NOT is_banned()
)
WITH CHECK (
    (auth.uid())::text = user_id
    AND NOT is_banned()
);

-- 3. Crear RPC robusto y seguro para actualizar ubicación de pedidos propios
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

    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coordenadas inválidas');
    END IF;

    SELECT estado INTO v_current_estado
    FROM public.pedidos
    WHERE id = p_order_id AND user_id = v_user_id;

    IF v_current_estado IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido no encontrado');
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

-- Registrar migración en historial
INSERT INTO supabase_migrations.schema_migrations(version) 
VALUES ('071_pedidos_update_rls_and_rpc_location') 
ON CONFLICT (version) DO NOTHING;
