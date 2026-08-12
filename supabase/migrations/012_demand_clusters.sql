-- 012_demand_clusters.sql
-- Crea un RPC para obtener agrupaciones de demanda por cuadrícula geográfica

CREATE OR REPLACE FUNCTION rpc_get_demand_clusters(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL,
    p_decimals integer DEFAULT 3 -- 3 decimales = ~110m
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
SECURITY DEFINER -- Ejecuta con permisos para poder leer la tabla de pedidos completa y agregar
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Generamos un ID de cluster sintético basado en las coordenadas truncadas, ciudad y categoría
        md5(p.ciudad || p.categoria || round(p.latitude::numeric, p_decimals)::text || round(p.longitude::numeric, p_decimals)::text) AS cluster_id,
        p.ciudad,
        p.categoria,
        AVG(p.latitude) AS centro_lat,
        AVG(p.longitude) AS centro_lng,
        COUNT(p.id) AS pedidos_activos,
        MAX(p.created_at) AS created_at_ultimo
    FROM 
        public.pedidos p
    WHERE 
        p.estado = 'pendiente'
        AND (p_ciudad IS NULL OR p.ciudad = p_ciudad)
        AND (p_categoria IS NULL OR p.categoria = p_categoria)
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
    GROUP BY 
        p.ciudad,
        p.categoria,
        round(p.latitude::numeric, p_decimals),
        round(p.longitude::numeric, p_decimals);
END;
$$;

-- Opcional: Otorgar permiso a roles anónimos y autenticados (Supabase)
GRANT EXECUTE ON FUNCTION rpc_get_demand_clusters(text, text, integer) TO anon, authenticated;

-- RPC para que un repartidor acepte todos los pedidos de un cluster
CREATE OR REPLACE FUNCTION rpc_accept_demand_cluster(
    p_cluster_id text,
    p_ciudad text,
    p_categoria text,
    p_decimals integer DEFAULT 3
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_driver_id text;
BEGIN
    v_driver_id := auth.uid()::text;
    
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.pedidos p
    SET 
        estado = 'asignado',
        driver_id = v_driver_id
    WHERE 
        p.estado = 'pendiente'
        AND p.ciudad = p_ciudad
        AND p.categoria = p_categoria
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND md5(p.ciudad || p.categoria || round(p.latitude::numeric, p_decimals)::text || round(p.longitude::numeric, p_decimals)::text) = p_cluster_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_accept_demand_cluster(text, text, text, integer) TO authenticated;
