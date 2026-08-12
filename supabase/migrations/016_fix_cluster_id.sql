-- 016_fix_cluster_id.sql
-- Hace que el cluster_id sea completamente determinista basado en los pedidos que lo componen,
-- eliminando la dependencia del número interno generado por ST_ClusterDBSCAN.

CREATE OR REPLACE FUNCTION rpc_get_demand_clusters_v2(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL,
    p_distancia_metros double precision DEFAULT 300,
    p_min_pedidos integer DEFAULT 2
)
RETURNS TABLE (
    cluster_id text,
    ciudad text,
    categoria text,
    centro_lat double precision,
    centro_lng double precision,
    pedidos_activos bigint,
    created_at_ultimo timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH clustered_orders AS (
        SELECT 
            p.id,
            p.ciudad,
            p.categoria,
            p.latitude,
            p.longitude,
            p.created_at,
            ST_ClusterDBSCAN(
                ST_Transform(ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326), 3857),
                eps := p_distancia_metros,
                minpoints := p_min_pedidos
            ) OVER (PARTITION BY p.ciudad, p.categoria) AS cluster_id_raw
        FROM 
            public.pedidos p
        WHERE 
            p.estado = 'pendiente'
            AND (p_ciudad IS NULL OR p.ciudad = p_ciudad)
            AND (p_categoria IS NULL OR p.categoria = p_categoria)
            AND p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
    )
    SELECT 
        -- Hash de todos los UUIDs ordenados, garantiza determinismo 100%
        md5(string_agg(c.id::text, ',' ORDER BY c.id)) AS cluster_id,
        c.ciudad,
        c.categoria,
        AVG(c.latitude) AS centro_lat,
        AVG(c.longitude) AS centro_lng,
        COUNT(c.id) AS pedidos_activos,
        MAX(c.created_at) AS created_at_ultimo
    FROM 
        clustered_orders c
    WHERE 
        c.cluster_id_raw IS NOT NULL
    GROUP BY 
        c.ciudad,
        c.categoria,
        c.cluster_id_raw;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_demand_clusters_v2(text, text, double precision, integer) TO anon, authenticated;


CREATE OR REPLACE FUNCTION rpc_accept_demand_cluster_v2(
    p_cluster_id text,
    p_ciudad text,
    p_categoria text,
    p_distancia_metros double precision DEFAULT 300,
    p_min_pedidos integer DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_driver_id text;
    v_driver_record RECORD;
    v_updated_count integer;
BEGIN
    v_driver_id := auth.uid()::text;
    
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- 1. Validar conductor en el backend
    SELECT * INTO v_driver_record
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado o inactivo';
    END IF;

    IF LOWER(TRIM(v_driver_record.ciudad)) != LOWER(TRIM(p_ciudad)) THEN
        RAISE EXCEPTION 'El conductor no opera en esta ciudad';
    END IF;

    IF LOWER(TRIM(v_driver_record.categoria)) != LOWER(TRIM(p_categoria)) THEN
        RAISE EXCEPTION 'La categoría del conductor no coincide con la demanda';
    END IF;

    -- 2. Recalcular el cluster y actualizar si cumple el mínimo
    WITH clustered_orders AS (
        SELECT 
            p.id,
            ST_ClusterDBSCAN(
                ST_Transform(ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326), 3857),
                eps := p_distancia_metros,
                minpoints := p_min_pedidos
            ) OVER (PARTITION BY p.ciudad, p.categoria) AS cluster_id_raw
        FROM 
            public.pedidos p
        WHERE 
            p.estado = 'pendiente'
            AND p.ciudad = p_ciudad
            AND p.categoria = p_categoria
            AND p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
    ),
    valid_clusters AS (
        SELECT 
            cluster_id_raw,
            md5(string_agg(id::text, ',' ORDER BY id)) AS gen_cluster_id,
            COUNT(id) AS cluster_count
        FROM clustered_orders
        WHERE cluster_id_raw IS NOT NULL
        GROUP BY cluster_id_raw
    )
    UPDATE public.pedidos up
    SET 
        estado = 'asignado',
        driver_id = v_driver_id
    FROM clustered_orders co
    JOIN valid_clusters vc ON co.cluster_id_raw = vc.cluster_id_raw
    WHERE up.id = co.id
      AND vc.gen_cluster_id = p_cluster_id
      AND vc.cluster_count >= p_min_pedidos;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count < p_min_pedidos THEN
        RAISE EXCEPTION 'El grupo de demanda ya no tiene suficientes pedidos activos o fue tomado por alguien más';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) TO authenticated;
