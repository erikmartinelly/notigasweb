-- ==========================================
-- SUPER PARCHE DE BASE DE DATOS NOTIGAS
-- ==========================================
-- Instrucciones: Copia TODO este código y ejecútalo 
-- en el SQL Editor de Supabase. Esto instalará las 
-- funciones faltantes y corregirá los errores de guardado.

-- 1. CORREGIR EL GUARDADO DE LA FICHA DEL REPARTIDOR (UNIQUE constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'choferes_habilitados_user_id_key'
    ) THEN
        ALTER TABLE public.choferes_habilitados ADD CONSTRAINT choferes_habilitados_user_id_key UNIQUE (user_id);
    END IF;
END $$;


-- 2. PERMITIR QUE LOS COMPRADORES VEAN A LOS REPARTIDORES SIN INICIAR SESIÓN
DO $$
BEGIN
    DROP POLICY IF EXISTS "Auth SELECT choferes" ON choferes_habilitados;
    DROP POLICY IF EXISTS "Public SELECT choferes" ON choferes_habilitados;
    CREATE POLICY "Public SELECT choferes" ON choferes_habilitados FOR SELECT USING (true);
END $$;


-- 3. INSTALAR SISTEMA DE CLUSTERS (AGRUPACIÓN DE PEDIDOS)
DROP FUNCTION IF EXISTS rpc_get_demand_clusters_v2(text, text, double precision, integer);
CREATE OR REPLACE FUNCTION rpc_get_demand_clusters_v2(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL,
    p_max_distance_meters double precision DEFAULT 300,
    p_min_orders integer DEFAULT 2
)
RETURNS TABLE (
    cluster_id text,
    order_count bigint,
    center_lat double precision,
    center_lng double precision,
    total_revenue numeric,
    order_ids jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_orders AS (
        SELECT 
            id, latitude, longitude,
            COALESCE(precio_final, 0) as precio_final
        FROM public.pedidos
        WHERE estado = 'pendiente'
          AND (p_ciudad IS NULL OR LOWER(TRIM(ciudad)) = LOWER(TRIM(p_ciudad)))
          AND (p_categoria IS NULL OR LOWER(TRIM(categoria)) = LOWER(TRIM(p_categoria)))
    ),
    distance_pairs AS (
        SELECT 
            a.id as id_a, 
            b.id as id_b
        FROM filtered_orders a
        JOIN filtered_orders b ON a.id != b.id
        WHERE (6371000 * acos(
                cos(radians(a.latitude)) * cos(radians(b.latitude)) * 
                cos(radians(b.longitude) - radians(a.longitude)) + 
                sin(radians(a.latitude)) * sin(radians(b.latitude))
              )) <= p_max_distance_meters
    ),
    clusters AS (
        SELECT 
            a.id_a as core_id,
            array_agg(a.id_b) || a.id_a as cluster_members
        FROM distance_pairs a
        GROUP BY a.id_a
    ),
    unique_clusters AS (
        SELECT DISTINCT
            (
                SELECT array_agg(member ORDER BY member)
                FROM unnest(c.cluster_members) as member
            ) as sorted_members
        FROM clusters c
        WHERE array_length(c.cluster_members, 1) >= p_min_orders
    )
    SELECT 
        md5(array_to_string(uc.sorted_members, ','))::text as cluster_id,
        array_length(uc.sorted_members, 1)::bigint as order_count,
        avg(o.latitude)::double precision as center_lat,
        avg(o.longitude)::double precision as center_lng,
        sum(o.precio_final)::numeric as total_revenue,
        jsonb_agg(o.id) as order_ids
    FROM unique_clusters uc
    CROSS JOIN unnest(uc.sorted_members) as member_id
    JOIN filtered_orders o ON o.id = member_id
    GROUP BY uc.sorted_members;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_demand_clusters_v2(text, text, double precision, integer) TO anon, authenticated;


-- 4. INSTALAR RPC PARA ACEPTAR GRUPOS DE PEDIDOS
CREATE OR REPLACE FUNCTION rpc_accept_demand_cluster_v2(
    p_order_ids uuid[],
    p_ciudad text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_driver_id text;
    v_driver_record record;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT * INTO v_driver_record
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado o inactivo';
    END IF;

    IF LOWER(TRIM(v_driver_record.ciudad)) != LOWER(TRIM(p_ciudad)) THEN
        RAISE EXCEPTION 'El conductor no opera en esta ciudad';
    END IF;

    UPDATE public.pedidos
    SET 
        estado = 'en_camino',
        driver_id = v_driver_id
    WHERE id = ANY(p_order_ids)
      AND estado = 'pendiente'
      AND LOWER(TRIM(ciudad)) = LOWER(TRIM(p_ciudad));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ninguno de los pedidos seleccionados estaba disponible';
    END IF;

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_accept_demand_cluster_v2(uuid[], text) TO anon, authenticated;


-- 5. INSTALAR ADMIN (SEMBRADO INICIAL Y PERMISOS CASE-INSENSITIVE)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'admin_credentials' AND column_name = 'password_hash'
    ) THEN
        INSERT INTO public.admin_credentials (email, password_hash) 
        VALUES (LOWER('tu-correo-real@gmail.com'), 'dummy_hash_not_used')
        ON CONFLICT (email) DO NOTHING;
    ELSE
        INSERT INTO public.admin_credentials (email) 
        VALUES (LOWER('tu-correo-real@gmail.com'))
        ON CONFLICT (email) DO NOTHING;
    END IF;
END $$;

DROP POLICY IF EXISTS "Admins select own record" ON admin_credentials;
CREATE POLICY "Admins select own record" ON admin_credentials
FOR SELECT USING ( LOWER(email) = LOWER(auth.jwt() ->> 'email') );
