-- ==========================================
-- 028_get_orders_for_cluster.sql
-- RPC para obtener las órdenes pendientes de un clúster de demanda sin asignarlas,
-- permitiendo calcular rutas dinámicamente basadas en los pedidos de la zona.
-- ==========================================

-- Eliminar versión anterior con tipos de retorno incompatibles si existía
DROP FUNCTION IF EXISTS rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer);

CREATE OR REPLACE FUNCTION rpc_get_orders_for_cluster_v2(
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
    created_at timestamp with time zone
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
            AND p.ciudad = p_ciudad
            AND p.categoria = p_categoria
            AND p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
    ),
    valid_clusters AS (
        SELECT 
            co.cluster_id_raw,
            md5(MIN(co.id::text) || co.cluster_id_raw::text) AS gen_cluster_id,
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
        co.created_at
    FROM clustered_orders co
    JOIN valid_clusters vc ON co.cluster_id_raw = vc.cluster_id_raw
    WHERE vc.gen_cluster_id = p_cluster_id
      AND vc.cluster_count >= p_min_pedidos;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) TO anon, authenticated;
