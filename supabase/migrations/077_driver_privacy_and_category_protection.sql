-- ==============================================================================
-- MIGRACIÓN 077: BLINDAJE DE PRIVACIDAD DE COMPRADORES Y SEGURIDAD ESTRICTA EN RPCS DE CHOFER
-- ==============================================================================

-- 1. Actualizar vista pedidos_publicos para proteger contacto de pedidos no asignados
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;
CREATE VIEW public.pedidos_publicos WITH (security_invoker = true) AS
SELECT
    p.id,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text THEN p.user_id
        ELSE NULL::text
    END AS user_id,
    p.categoria,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    p.cantidad,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() THEN p.direccion
        ELSE COALESCE(p.barrio_otb, 'Zona indicada en el mapa')
    END AS direccion,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_admin_email() THEN p.telefono
        ELSE NULL::text
    END AS telefono,
    p.estado,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text THEN p.driver_id
        ELSE NULL::text
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa') AS barrio_otb,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, p.categoria) THEN p.latitude
        ELSE round(p.latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, p.categoria) THEN p.longitude
        ELSE round(p.longitude::numeric, 3)::double precision
    END AS longitude,
    p.visto,
    p.created_at,
    p.updated_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto', 'asignado')
  AND p.created_at >= (now() - interval '48 hours')
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = p.user_id
  );

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- 2. Eliminar versión anterior de rpc_get_driver_available_orders y crear versión blindada
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

    -- Validar que el chofer esté registrado y habilitado
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

    -- Enforzar estrictamente la ciudad y categoría del chofer registrado (no permite evadir con nulos)
    RETURN QUERY
    SELECT
        p.id,
        'Vecino'::text AS buyer_name,
        p.titulo,
        p.categoria,
        COALESCE(NULLIF(TRIM(p.cantidad), ''), '1 unidad'),
        COALESCE(NULLIF(TRIM(p.barrio_otb), ''), 'Zona indicada en el mapa') AS direccion,
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
      AND (
          v_driver.categoria IS NULL
          OR LOWER(TRIM(v_driver.categoria)) IN ('todos', 'otros')
          OR LOWER(TRIM(p.categoria)) = LOWER(TRIM(v_driver.categoria))
          OR (LOWER(TRIM(v_driver.categoria)) IN ('gas', 'gas glp') AND LOWER(TRIM(p.categoria)) IN ('gas', 'gas glp', 'garrafa'))
          OR (LOWER(TRIM(v_driver.categoria)) IN ('agua', 'agua potable') AND LOWER(TRIM(p.categoria)) IN ('agua', 'agua potable', 'botellon'))
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = p.user_id
      )
    ORDER BY p.created_at ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO authenticated;

-- 3. Actualizar rpc_get_my_assigned_orders para entregar contacto completo solo tras asignación
DROP FUNCTION IF EXISTS public.rpc_get_my_assigned_orders();

CREATE OR REPLACE FUNCTION public.rpc_get_my_assigned_orders()
RETURNS TABLE(
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
    estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
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
              SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = v_driver_id
          )
    ) THEN
        RAISE EXCEPTION 'Repartidor no habilitado o baneado';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        u.email::text AS buyer_email,
        COALESCE(NULLIF(TRIM(p.titulo), ''), split_part(COALESCE(u.email::text, 'vecino@notigas.app'), '@', 1)) AS buyer_name,
        p.titulo,
        p.categoria,
        p.cantidad,
        p.direccion,
        p.telefono,
        p.barrio_otb,
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
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;
