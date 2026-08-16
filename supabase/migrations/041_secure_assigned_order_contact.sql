-- ==============================================================================
-- 041_secure_assigned_order_contact.sql
-- RPC para acceso seguro a datos de contacto de compradores por parte del repartidor asignado
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_get_my_assigned_orders()
RETURNS TABLE (
    id uuid,
    buyer_email text,
    titulo text,
    categoria text,
    cantidad text,
    direccion text,
    telefono text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone,
    estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text := auth.uid()::text;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

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
        RAISE EXCEPTION 'Repartidor no habilitado o baneado';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        u.email::text AS buyer_email,
        p.titulo,
        p.categoria,
        p.cantidad,
        p.direccion,
        p.telefono,
        p.latitude,
        p.longitude,
        p.created_at,
        p.estado
    FROM public.pedidos p
    LEFT JOIN auth.users u ON u.id::text = p.user_id
    WHERE p.driver_id = v_driver_id
      AND p.estado = 'asignado'
    ORDER BY p.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_my_assigned_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;
