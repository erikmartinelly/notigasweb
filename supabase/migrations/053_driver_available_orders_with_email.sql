-- 053_driver_available_orders_with_email.sql
-- Proporciona a los repartidores habilitados acceso a los pedidos disponibles con correo del comprador para prevenir pedidos falsos.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_get_driver_available_orders(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    buyer_email text,
    buyer_name text,
    titulo text,
    categoria text,
    cantidad text,
    direccion text,
    telefono text,
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone,
    estado text,
    visto boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_driver_id text := auth.uid()::text;
    v_norm_city text := NULLIF(LOWER(TRIM(COALESCE(p_ciudad, ''))), '');
    v_norm_cat text := NULLIF(LOWER(TRIM(COALESCE(p_categoria, ''))), '');
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- Validar que el usuario sea un chofer habilitado no baneado
    IF NOT EXISTS (
        SELECT 1
        FROM public.choferes_habilitados ch
        WHERE ch.user_id = v_driver_id
          AND NOT EXISTS (
              SELECT 1
              FROM public.usuarios_baneados ub
              WHERE ub.user_id = v_driver_id
          )
    ) THEN
        RAISE EXCEPTION 'Repartidor no habilitado o cuenta suspendida';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        COALESCE(u.email::text, 'vecino@notigas.app') AS buyer_email,
        COALESCE(NULLIF(TRIM(p.titulo), ''), 'Vecino') AS buyer_name,
        p.titulo,
        p.categoria,
        COALESCE(NULLIF(TRIM(p.cantidad), ''), '1 unidad') AS cantidad,
        COALESCE(NULLIF(TRIM(p.direccion), ''), 'Ubicación fijada en mapa GPS (opcional)') AS direccion,
        NULLIF(TRIM(p.telefono), '') AS telefono,
        COALESCE(NULLIF(TRIM(p.barrio_otb), ''), 'Zona indicada en el mapa') AS barrio_otb,
        p.latitude,
        p.longitude,
        p.created_at,
        p.estado,
        COALESCE(p.visto, false) AS visto
    FROM public.pedidos p
    LEFT JOIN auth.users u ON u.id::text = p.user_id
    WHERE p.estado IN ('pendiente', 'visto')
      AND (v_norm_city IS NULL OR LOWER(TRIM(p.ciudad)) = v_norm_city)
      AND (
          v_norm_cat IS NULL
          OR LOWER(TRIM(p.categoria)) = v_norm_cat
          OR (v_norm_cat IN ('gas', 'gas glp') AND LOWER(TRIM(p.categoria)) IN ('gas', 'gas glp', 'garrafa'))
          OR (v_norm_cat IN ('agua', 'agua potable') AND LOWER(TRIM(p.categoria)) IN ('agua', 'agua potable', 'botellon'))
      )
    ORDER BY p.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO anon;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('053', 'driver_available_orders_with_email')
ON CONFLICT (version) DO NOTHING;

COMMIT;
