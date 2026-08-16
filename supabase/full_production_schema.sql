-- ==============================================================================
-- NOTIGAS - CONSOLIDATED FULL PRODUCTION DATABASE SCHEMA
-- Compatible con PostgreSQL 15+ y Supabase Auth / Storage / Realtime
-- Versión Oficial Consolidada de Producción
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ==============================================================================
-- 2. TABLAS BASE
-- ==============================================================================

-- A. Perfiles de usuario (Vecinos y Choferes)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id text UNIQUE NOT NULL,
    nombre text,
    role text DEFAULT 'vecino' CHECK (role IN ('vecino', 'repartidor', 'admin')),
    ciudad text,
    latitude double precision,
    longitude double precision,
    direccion text,
    telefono text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- B. Choferes Habilitados / Repartidores
CREATE TABLE IF NOT EXISTS public.choferes_habilitados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text UNIQUE NOT NULL,
    nombre_completo text NOT NULL,
    telefono_whatsapp text NOT NULL,
    placa text NOT NULL,
    categoria text NOT NULL DEFAULT 'gas',
    productos text NOT NULL,
    zonas text,
    schedule text,
    ciudad text NOT NULL,
    estado_verificacion text DEFAULT 'aprobado',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- C. Pedidos Vecinales
CREATE TABLE IF NOT EXISTS public.pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    categoria text NOT NULL DEFAULT 'gas',
    titulo text NOT NULL,
    descripcion text,
    cantidad text,
    direccion text NOT NULL,
    telefono text NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado')),
    driver_id text,
    ciudad text NOT NULL,
    barrio_otb text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    visto boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- D. Rutas y Telemetría en Vivo de Repartidores
CREATE TABLE IF NOT EXISTS public.rutas_repartidores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id text UNIQUE NOT NULL,
    ciudad text NOT NULL,
    categoria text NOT NULL DEFAULT 'gas',
    nombre_repartidor text,
    telefono text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    heading double precision,
    speed double precision,
    accuracy double precision,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- E. Avisos y Publicaciones del Foro Comunitario
CREATE TABLE IF NOT EXISTS public.avisos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    ciudad text NOT NULL,
    autor text NOT NULL,
    tipo text NOT NULL DEFAULT 'general',
    titulo text NOT NULL,
    descripcion text NOT NULL,
    imagen_url text,
    votos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- F. Comentarios del Foro
CREATE TABLE IF NOT EXISTS public.comentarios_avisos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aviso_id uuid NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    autor text NOT NULL,
    texto text NOT NULL,
    votos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- G. Anuncios y Promociones Locales
CREATE TABLE IF NOT EXISTS public.anuncios_globales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    ciudad text NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    telefono text,
    categoria text,
    imagen_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- H. Usuarios y Conductores Baneados / Suspendidos
CREATE TABLE IF NOT EXISTS public.usuarios_baneados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text UNIQUE,
    email text,
    telefono text,
    placa text,
    motivo text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- I. Avisos Oficiales del Sistema (Transmisión Administrativa)
CREATE TABLE IF NOT EXISTS public.avisos_oficiales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    mensaje text NOT NULL,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- J. Credenciales Administrativas
CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'superadmin',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- K. Denuncias y Reportes
CREATE TABLE IF NOT EXISTS public.denuncias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    motivo text NOT NULL,
    target_id text,
    target_type text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reportes_spam (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    item_id text NOT NULL,
    item_type text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. VISTAS PÚBLICAS AUTORIZADAS
-- ==============================================================================

CREATE OR REPLACE VIEW public.choferes_publicos AS
SELECT 
    id,
    user_id,
    nombre_completo,
    categoria,
    ciudad,
    zonas,
    schedule,
    placa,
    productos,
    estado_verificacion
FROM public.choferes_habilitados ch
WHERE NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub 
    WHERE ub.user_id = ch.user_id 
       OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
       OR (ub.placa IS NOT NULL AND LOWER(ub.placa) = LOWER(ch.placa))
);

GRANT SELECT ON public.choferes_publicos TO anon, authenticated;

-- ==============================================================================
-- 4. FUNCIONES DE SEGURIDAD Y ESTADO
-- ==============================================================================

-- Comprobar si el usuario conectado es administrador
CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  IF v_email = '' THEN RETURN false; END IF;
  
  IF v_email IN ('admin@notigas.bo', 'superadmin@notigas.com', 'erikmartinelly@gmail.com') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated;

-- Comprobar si el usuario conectado está baneado
CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text;
  v_email text;
BEGIN
  v_uid := auth.uid()::text;
  v_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  
  IF v_uid IS NULL AND v_email = '' THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios_baneados 
    WHERE (v_uid IS NOT NULL AND user_id = v_uid)
       OR (v_email <> '' AND LOWER(email) = v_email)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_banned() TO anon, authenticated;

-- Validar credenciales de administrador (para modal de administración)
CREATE OR REPLACE FUNCTION public.validar_admin(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.admin_credentials
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email));
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  RETURN (v_hash = crypt(p_password, v_hash) OR v_hash = p_password);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_admin(text, text) TO anon, authenticated;

-- ==============================================================================
-- 5. TRIGGERS AUTOMÁTICOS
-- ==============================================================================

-- Actualización automática de updated_at en pedidos
CREATE OR REPLACE FUNCTION public.set_pedidos_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON public.pedidos;
CREATE TRIGGER trg_pedidos_updated_at
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.set_pedidos_updated_at();

-- Validación estricta de transiciones de estado de pedidos (5 estados canónicos)
CREATE OR REPLACE FUNCTION public.trg_check_pedido_transition()
RETURNS trigger AS $$
BEGIN
  -- A. Estados terminales: protegidos contra mutación
  IF OLD.estado IN ('entregado', 'cancelado') AND NEW.estado <> OLD.estado THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'No se puede modificar un pedido que ya está en estado final (%)', OLD.estado;
    END IF;
  END IF;

  -- B. Transición hacia 'entregado'
  IF NEW.estado = 'entregado' AND OLD.estado <> 'entregado' THEN
    IF NEW.user_id <> auth.uid()::text AND NEW.driver_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador o el repartidor asignado pueden marcar el pedido como entregado.';
    END IF;
  END IF;

  -- C. Transición hacia 'cancelado'
  IF NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado' THEN
    IF NEW.user_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador creador del pedido puede cancelarlo.';
    END IF;
  END IF;

  -- D. Transición hacia 'asignado'
  IF NEW.estado = 'asignado' AND OLD.estado NOT IN ('pendiente', 'visto', 'asignado') THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'Transición de estado no válida para asignación desde %', OLD.estado;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_pedido_transition ON public.pedidos;
CREATE TRIGGER trg_validate_pedido_transition
BEFORE UPDATE OF estado ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.trg_check_pedido_transition();

-- ==============================================================================
-- 6. PROCEDIMIENTOS RPC OFICIALES CONTRATO ÚNICO
-- ==============================================================================

-- 1. Asignación atómica de pedido individual (FOR UPDATE)
CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_driver record;
    v_order record;
    v_order_cat text;
    v_driver_cat text;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está baneado o no autorizado';
    END IF;

    SELECT * INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no es un repartidor habilitado';
    END IF;

    -- Bloqueo atómico a nivel de fila
    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    -- Normalizar categoría
    v_order_cat := LOWER(TRIM(COALESCE(v_order.categoria, '')));
    v_driver_cat := LOWER(TRIM(COALESCE(v_driver.categoria, '')));

    IF v_order_cat ILIKE '%gas%' OR v_order_cat ILIKE '%glp%' OR v_order_cat ILIKE '%garrafa%' THEN v_order_cat := 'gas'; END IF;
    IF v_order_cat ILIKE '%agua%' OR v_order_cat ILIKE '%botell%' THEN v_order_cat := 'agua'; END IF;
    IF v_driver_cat ILIKE '%gas%' OR v_driver_cat ILIKE '%glp%' OR v_driver_cat ILIKE '%garrafa%' THEN v_driver_cat := 'gas'; END IF;
    IF v_driver_cat ILIKE '%agua%' OR v_driver_cat ILIKE '%botell%' THEN v_driver_cat := 'agua'; END IF;

    IF v_order_cat <> v_driver_cat AND v_driver_cat <> 'otros' AND v_order_cat <> 'otros' THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    IF v_order.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible';
    END IF;

    UPDATE public.pedidos
    SET
        estado = 'asignado',
        driver_id = v_driver_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
      AND estado IN ('pendiente', 'visto');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido fue asignado por otro repartidor';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'driver_id', v_driver_id,
        'estado', 'asignado'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

-- 2. Marcar pedido como visto por un conductor
CREATE OR REPLACE FUNCTION public.rpc_mark_order_seen(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    UPDATE public.pedidos
    SET visto = true, updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
      AND estado = 'pendiente';
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_order_seen(uuid) TO authenticated;

-- 3. Obtener grupos de demanda espacial (DBSCAN con hash determinista)
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
SECURITY DEFINER
SET search_path = public
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

-- 4. Obtener pedidos dentro de un grupo de demanda
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
SECURITY DEFINER
SET search_path = public
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

-- 5. Aceptar grupo de demanda completo atómicamente
CREATE OR REPLACE FUNCTION public.rpc_accept_demand_cluster_v2(
    p_cluster_id text,
    p_ciudad text,
    p_categoria text,
    p_distancia_metros double precision DEFAULT 300,
    p_min_pedidos integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    v_d_cat := LOWER(TRIM(COALESCE(v_driver_record.categoria, '')));
    v_p_cat := LOWER(TRIM(COALESCE(p_categoria, '')));

    IF v_d_cat ILIKE '%gas%' OR v_d_cat ILIKE '%glp%' OR v_d_cat ILIKE '%garrafa%' THEN v_d_cat := 'gas'; END IF;
    IF v_d_cat ILIKE '%agua%' OR v_d_cat ILIKE '%botell%' THEN v_d_cat := 'agua'; END IF;
    IF v_p_cat ILIKE '%gas%' OR v_p_cat ILIKE '%glp%' OR v_p_cat ILIKE '%garrafa%' THEN v_p_cat := 'gas'; END IF;
    IF v_p_cat ILIKE '%agua%' OR v_p_cat ILIKE '%botell%' THEN v_p_cat := 'agua'; END IF;

    IF v_d_cat <> v_p_cat AND v_d_cat <> 'otros' AND v_p_cat <> 'otros' THEN
        RAISE EXCEPTION 'La categoría del conductor no coincide con la demanda';
    END IF;

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

-- 6. Purga automática de registros antiguos (> 72 horas)
CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedidos_borrados integer := 0;
    v_rutas_borradas integer := 0;
    v_avisos_borrados integer := 0;
BEGIN
    DELETE FROM public.pedidos
    WHERE (estado IN ('entregado', 'cancelado') AND updated_at < now() - interval '72 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');
    GET DIAGNOSTICS v_pedidos_borrados = ROW_COUNT;

    DELETE FROM public.rutas_repartidores
    WHERE updated_at < now() - interval '12 hours';
    GET DIAGNOSTICS v_rutas_borradas = ROW_COUNT;

    DELETE FROM public.avisos
    WHERE created_at < now() - interval '72 hours';
    GET DIAGNOSTICS v_avisos_borrados = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'pedidos_purgados', v_pedidos_borrados,
        'rutas_purgadas', v_rutas_borradas,
        'avisos_purgados', v_avisos_borrados,
        'ejecutado_el', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO anon, authenticated;

-- 7. Eliminación completa de cuenta en cascada
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid text;
    v_uuid uuid;
BEGIN
    v_uuid := auth.uid();
    v_uid := v_uuid::text;

    IF v_uuid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
    DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
    DELETE FROM public.rutas_repartidores WHERE driver_id = v_uid;
    DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
    DELETE FROM public.avisos WHERE user_id = v_uid;
    DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uuid;
    DELETE FROM auth.users WHERE id = v_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- ==============================================================================
-- 7. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- A. Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes_habilitados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_repartidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anuncios_globales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_baneados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_oficiales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_spam ENABLE ROW LEVEL SECURITY;

-- B. Políticas: profiles
DROP POLICY IF EXISTS "Profiles Public SELECT" ON public.profiles;
CREATE POLICY "Profiles Public SELECT" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Profiles User ALL" ON public.profiles;
CREATE POLICY "Profiles User ALL" ON public.profiles FOR ALL USING (auth.uid() = id OR is_admin_email());

-- C. Políticas: choferes_habilitados
DROP POLICY IF EXISTS "Choferes Admin ALL" ON public.choferes_habilitados;
CREATE POLICY "Choferes Admin ALL" ON public.choferes_habilitados FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Choferes Insertar propio" ON public.choferes_habilitados;
CREATE POLICY "Choferes Insertar propio" ON public.choferes_habilitados FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Choferes Modificar propio" ON public.choferes_habilitados;
CREATE POLICY "Choferes Modificar propio" ON public.choferes_habilitados FOR UPDATE USING (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Choferes Borrar propio" ON public.choferes_habilitados;
CREATE POLICY "Choferes Borrar propio" ON public.choferes_habilitados FOR DELETE USING (auth.uid()::text = user_id);

-- D. Políticas: pedidos
DROP POLICY IF EXISTS "Pedidos Public SELECT" ON public.pedidos;
CREATE POLICY "Pedidos Public SELECT" ON public.pedidos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Pedidos Insertar propio" ON public.pedidos;
CREATE POLICY "Pedidos Insertar propio" ON public.pedidos FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Pedidos Actualizar propio o asignado" ON public.pedidos;
CREATE POLICY "Pedidos Actualizar propio o asignado" ON public.pedidos FOR UPDATE USING (
    auth.uid()::text = user_id OR auth.uid()::text = driver_id OR is_admin_email()
);

DROP POLICY IF EXISTS "Pedidos Borrar propio o admin" ON public.pedidos;
CREATE POLICY "Pedidos Borrar propio o admin" ON public.pedidos FOR DELETE USING (
    auth.uid()::text = user_id OR is_admin_email()
);

-- E. Políticas: rutas_repartidores
DROP POLICY IF EXISTS "Rutas Public SELECT" ON public.rutas_repartidores;
CREATE POLICY "Rutas Public SELECT" ON public.rutas_repartidores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Rutas Driver Modificar" ON public.rutas_repartidores;
CREATE POLICY "Rutas Driver Modificar" ON public.rutas_repartidores FOR ALL USING (auth.uid()::text = driver_id OR is_admin_email());

-- F. Políticas: avisos y comentarios
DROP POLICY IF EXISTS "Avisos Public SELECT" ON public.avisos;
CREATE POLICY "Avisos Public SELECT" ON public.avisos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Avisos User Insert" ON public.avisos;
CREATE POLICY "Avisos User Insert" ON public.avisos FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Avisos User Delete" ON public.avisos;
CREATE POLICY "Avisos User Delete" ON public.avisos FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Comentarios Public SELECT" ON public.comentarios_avisos;
CREATE POLICY "Comentarios Public SELECT" ON public.comentarios_avisos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Comentarios User Insert" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Insert" ON public.comentarios_avisos FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Comentarios User Delete" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Delete" ON public.comentarios_avisos FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

-- G. Políticas: avisos_oficiales y anuncios_globales
DROP POLICY IF EXISTS "Avisos Oficiales Public SELECT" ON public.avisos_oficiales;
CREATE POLICY "Avisos Oficiales Public SELECT" ON public.avisos_oficiales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Avisos Oficiales Admin ALL" ON public.avisos_oficiales;
CREATE POLICY "Avisos Oficiales Admin ALL" ON public.avisos_oficiales FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Anuncios Public SELECT" ON public.anuncios_globales;
CREATE POLICY "Anuncios Public SELECT" ON public.anuncios_globales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anuncios User Insert" ON public.anuncios_globales;
CREATE POLICY "Anuncios User Insert" ON public.anuncios_globales FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Anuncios User Delete" ON public.anuncios_globales;
CREATE POLICY "Anuncios User Delete" ON public.anuncios_globales FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

-- H. Políticas: usuarios_baneados y admin_credentials
DROP POLICY IF EXISTS "Baneados Admin ALL" ON public.usuarios_baneados;
CREATE POLICY "Baneados Admin ALL" ON public.usuarios_baneados FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Admin Credentials Admin ALL" ON public.admin_credentials;
CREATE POLICY "Admin Credentials Admin ALL" ON public.admin_credentials FOR ALL USING (is_admin_email());

-- ==============================================================================
-- 8. ÍNDICES DE RENDIMIENTO PARA PRODUCCIÓN
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_ciudad_cat ON public.pedidos (estado, ciudad, categoria, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_driver_id ON public.pedidos (driver_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_id ON public.pedidos (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_updated_at ON public.pedidos (updated_at);
CREATE INDEX IF NOT EXISTS idx_rutas_ciudad_cat ON public.rutas_repartidores (ciudad, categoria, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_ciudad_created ON public.avisos (ciudad, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_aviso_id ON public.comentarios_avisos (aviso_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_choferes_ciudad ON public.choferes_habilitados (ciudad, categoria);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_user_id ON public.usuarios_baneados (user_id);
