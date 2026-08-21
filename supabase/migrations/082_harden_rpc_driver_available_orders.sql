-- ==============================================================================
-- MIGRACIÓN 082: BLINDAR rpc_get_driver_available_orders Y ELIMINAR COMODINES
-- ==============================================================================

DROP FUNCTION IF EXISTS public.rpc_get_driver_available_orders(text, text);
DROP FUNCTION IF EXISTS public.rpc_get_driver_available_orders();

CREATE OR REPLACE FUNCTION public.rpc_get_driver_available_orders(
    p_ciudad text DEFAULT NULL::text,
    p_categoria text DEFAULT NULL::text
)
RETURNS TABLE(
    id uuid,
    buyer_name text,
    titulo text,
    categoria text,
    cantidad text,
    direccion text,
    telefono text,
    descripcion text,
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone,
    estado text,
    visto boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_driver_id text := auth.uid()::text;
    v_driver record;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT * INTO v_driver
    FROM public.choferes_habilitados ch
    WHERE ch.user_id = v_driver_id
      AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
      AND NOT EXISTS (
          SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = v_driver_id
      )
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repartidor no habilitado o cuenta suspendida';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        'Vecino'::text AS buyer_name,
        p.titulo,
        p.categoria,
        COALESCE(NULLIF(TRIM(p.cantidad), ''), '1 unidad'),
        p.direccion,
        p.telefono,
        p.descripcion,
        COALESCE(NULLIF(TRIM(p.barrio_otb), ''), 'Zona indicada en el mapa') AS barrio_otb,
        p.latitude,
        p.longitude,
        p.created_at,
        p.estado,
        COALESCE(p.visto, false)
    FROM public.pedidos p
    WHERE p.estado IN ('pendiente', 'visto')
      AND p.driver_id IS NULL
      AND LOWER(TRIM(p.ciudad)) = LOWER(TRIM(v_driver.ciudad))
      AND public.is_current_enabled_driver(p.ciudad, p.categoria)
      AND NOT EXISTS (
          SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = p.user_id
      )
    ORDER BY p.created_at ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO authenticated;
