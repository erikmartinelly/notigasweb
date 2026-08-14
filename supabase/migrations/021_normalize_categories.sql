-- 021_normalize_categories.sql
-- Normaliza todas las categorías en la base de datos a códigos en minúsculas.

UPDATE public.pedidos
SET categoria = 
  CASE 
    WHEN LOWER(categoria) LIKE '%gas%' THEN 'gas'
    WHEN LOWER(categoria) LIKE '%agua%' THEN 'agua'
    WHEN LOWER(categoria) LIKE '%chatarra%' THEN 'chatarra'
    WHEN LOWER(categoria) LIKE '%papel%' THEN 'papel'
    WHEN LOWER(categoria) LIKE '%frutas%' THEN 'frutas'
    WHEN LOWER(categoria) LIKE '%detergentes%' THEN 'detergentes'
    ELSE 'otros'
  END;

UPDATE public.choferes_habilitados
SET categoria = 
  CASE 
    WHEN LOWER(categoria) LIKE '%gas%' THEN 'gas'
    WHEN LOWER(categoria) LIKE '%agua%' THEN 'agua'
    WHEN LOWER(categoria) LIKE '%chatarra%' THEN 'chatarra'
    WHEN LOWER(categoria) LIKE '%papel%' THEN 'papel'
    WHEN LOWER(categoria) LIKE '%frutas%' THEN 'frutas'
    WHEN LOWER(categoria) LIKE '%detergentes%' THEN 'detergentes'
    ELSE 'otros'
  END;

-- Reemplazar rpc_get_demand_clusters_v2 para que asuma matching exacto (las apps ya deben mandar códigos limpios)
DROP FUNCTION IF EXISTS rpc_get_demand_clusters_v2(text, text, double precision, integer);

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
            AND (p_ciudad IS NULL OR p.ciudad = LOWER(TRIM(p_ciudad)))
            AND (p_categoria IS NULL OR p.categoria = LOWER(TRIM(p_categoria)))
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

GRANT EXECUTE ON FUNCTION rpc_get_demand_clusters_v2(text, text, double precision, integer) TO anon, authenticated;
