-- 039_unify_cluster_id_algorithm.sql
-- Unificación del algoritmo de generación de cluster_id: md5(string_agg(id::text, ',' ORDER BY id))
-- para rpc_get_demand_clusters_v2, rpc_get_orders_for_cluster_v2 y rpc_accept_demand_cluster_v2

-- 1. Eliminar versiones anteriores y sobrecargas obsoletas
DROP FUNCTION IF EXISTS public.rpc_accept_demand_cluster_v2(text, uuid[]);
DROP FUNCTION IF EXISTS public.rpc_accept_demand_cluster_v2(uuid[], text);
DROP FUNCTION IF EXISTS public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_get_demand_clusters_v2(text, text, double precision, integer);

-- 2. Función: rpc_get_demand_clusters_v2
CREATE OR REPLACE FUNCTION public.rpc_get_demand_clusters_v2(
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
SECURITY DEFINER SET search_path = public
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
            AND (p_ciudad IS NULL OR LOWER(TRIM(p.ciudad)) = LOWER(TRIM(p_ciudad)))
            AND (p_categoria IS NULL OR LOWER(TRIM(p.categoria)) = LOWER(TRIM(p_categoria)))
            AND p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
    )
    SELECT 
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

GRANT EXECUTE ON FUNCTION public.rpc_get_demand_clusters_v2(text, text, double precision, integer) TO anon, authenticated;

-- 3. Función: rpc_get_orders_for_cluster_v2
CREATE OR REPLACE FUNCTION public.rpc_get_orders_for_cluster_v2(
    p_cluster_id text,
    p_ciudad text,
    p_categoria text,
    p_distancia_metros double precision DEFAULT 300,
    p_min_pedidos integer DEFAULT 2
)
RETURNS TABLE (
    id uuid,
    user_id text,
    categoria text,
    titulo text,
    descripcion text,
    cantidad text,
    direccion text,
    telefono text,
    estado text,
    driver_id text,
    ciudad text,
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH clustered_orders AS (
        SELECT 
            p.*,
            ST_ClusterDBSCAN(
                ST_Transform(ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326), 3857),
                eps := p_distancia_metros,
                minpoints := p_min_pedidos
            ) OVER (PARTITION BY p.ciudad, p.categoria) AS cluster_id_raw
        FROM 
            public.pedidos p
        WHERE 
            p.estado = 'pendiente'
            AND LOWER(TRIM(p.ciudad)) = LOWER(TRIM(p_ciudad))
            AND LOWER(TRIM(p.categoria)) = LOWER(TRIM(p_categoria))
            AND p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
    ),
    valid_clusters AS (
        SELECT 
            co.cluster_id_raw,
            md5(string_agg(co.id::text, ',' ORDER BY co.id)) AS gen_cluster_id,
            COUNT(co.id) AS cluster_count
        FROM clustered_orders co
        WHERE co.cluster_id_raw IS NOT NULL
        GROUP BY co.cluster_id_raw
    )
    SELECT 
        co.id,
        co.user_id,
        co.categoria,
        co.titulo,
        co.descripcion,
        co.cantidad,
        co.direccion,
        co.telefono,
        co.estado,
        co.driver_id,
        co.ciudad,
        co.barrio_otb,
        co.latitude,
        co.longitude,
        co.created_at,
        co.updated_at
    FROM clustered_orders co
    JOIN valid_clusters vc ON co.cluster_id_raw = vc.cluster_id_raw
    WHERE vc.gen_cluster_id = p_cluster_id
      AND vc.cluster_count >= p_min_pedidos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) TO anon, authenticated;

-- 4. Función: rpc_accept_demand_cluster_v2
CREATE OR REPLACE FUNCTION public.rpc_accept_demand_cluster_v2(
    p_cluster_id text,
    p_ciudad text,
    p_categoria text,
    p_distancia_metros double precision DEFAULT 300,
    p_min_pedidos integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_driver_record RECORD;
    v_updated_count integer;
    v_assigned_ids uuid[];
    v_d_cat text;
    v_p_cat text;
BEGIN
    v_driver_id := auth.uid()::text;
    
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- 1. Validar conductor en el backend y exigir que NO esté baneado
    SELECT * INTO v_driver_record
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id 
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_baneados WHERE user_id = v_driver_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado o se encuentra baneado';
    END IF;

    IF LOWER(TRIM(COALESCE(v_driver_record.ciudad, ''))) <> LOWER(TRIM(COALESCE(p_ciudad, ''))) THEN
        RAISE EXCEPTION 'El conductor no opera en esta ciudad';
    END IF;

    -- Normalizar validación de categoría
    v_d_cat := LOWER(TRIM(COALESCE(v_driver_record.categoria, '')));
    v_p_cat := LOWER(TRIM(COALESCE(p_categoria, '')));

    IF v_d_cat ILIKE '%gas%' OR v_d_cat ILIKE '%glp%' OR v_d_cat ILIKE '%garrafa%' THEN v_d_cat := 'gas'; END IF;
    IF v_d_cat ILIKE '%agua%' OR v_d_cat ILIKE '%botell%' THEN v_d_cat := 'agua'; END IF;
    IF v_p_cat ILIKE '%gas%' OR v_p_cat ILIKE '%glp%' OR v_p_cat ILIKE '%garrafa%' THEN v_p_cat := 'gas'; END IF;
    IF v_p_cat ILIKE '%agua%' OR v_p_cat ILIKE '%botell%' THEN v_p_cat := 'agua'; END IF;

    IF v_d_cat <> v_p_cat AND v_d_cat <> 'otros' AND v_p_cat <> 'otros' THEN
        RAISE EXCEPTION 'La categoría del conductor no coincide con la demanda';
    END IF;

    -- 2. Recalcular el cluster con algoritmo unificado y bloquear/actualizar
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
            AND LOWER(TRIM(p.ciudad)) = LOWER(TRIM(p_ciudad))
            AND LOWER(TRIM(p.categoria)) = LOWER(TRIM(p_categoria))
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
    ),
    updated AS (
        UPDATE public.pedidos up
        SET 
            estado = 'asignado',
            driver_id = v_driver_id,
            updated_at = timezone('utc'::text, now())
        FROM clustered_orders co
        JOIN valid_clusters vc ON co.cluster_id_raw = vc.cluster_id_raw
        WHERE up.id = co.id
          AND vc.gen_cluster_id = p_cluster_id
          AND vc.cluster_count >= p_min_pedidos
          AND up.estado = 'pendiente'
        RETURNING up.id
    )
    SELECT array_agg(id) INTO v_assigned_ids FROM updated;

    v_updated_count := coalesce(cardinality(v_assigned_ids), 0);

    IF v_updated_count < p_min_pedidos THEN
        RAISE EXCEPTION 'El grupo de demanda ya no tiene suficientes pedidos activos o fue tomado por alguien más';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'assigned_count', v_updated_count,
        'cluster_id', p_cluster_id,
        'driver_id', v_driver_id,
        'order_ids', v_assigned_ids
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) TO authenticated;
