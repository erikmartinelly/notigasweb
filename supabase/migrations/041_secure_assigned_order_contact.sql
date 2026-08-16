-- Permite que un repartidor autenticado vea el correo solamente de los
-- compradores cuyos pedidos ya fueron asignados a ese repartidor.
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
    v_driver_city text;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT lower(trim(ch.ciudad))
    INTO v_driver_city
    FROM public.choferes_habilitados ch
    WHERE ch.user_id = v_driver_id
      AND NOT EXISTS (
          SELECT 1
          FROM public.usuarios_baneados ub
          WHERE ub.user_id = v_driver_id
      )
    LIMIT 1;

    IF v_driver_city IS NULL THEN
        RAISE EXCEPTION 'Repartidor no habilitado';
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
      AND lower(trim(p.ciudad)) = v_driver_city
      AND p.estado = 'asignado'
    ORDER BY p.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_my_assigned_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;
