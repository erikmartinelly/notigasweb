-- ==============================================================================
-- NOTIGAS - CONSOLIDATED FULL PRODUCTION DATABASE SCHEMA
-- Compatible con PostgreSQL 15+ y Supabase Auth / Storage / Realtime
-- Versión Oficial Consolidada de Producción
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONES
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ==============================================================================
-- 2. TABLAS BASE
-- ==============================================================================

-- A. Perfiles de usuario (Vecinos y Choferes)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id text UNIQUE,
    nombre text,
    role text DEFAULT 'vecino' CHECK (role IN ('vecino', 'repartidor', 'admin')),
    ciudad text DEFAULT 'santacruz',
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
    ciudad text NOT NULL DEFAULT 'santacruz',
    estado_verificacion text NOT NULL DEFAULT 'aprobado',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- C. Pedidos Vecinales
CREATE TABLE IF NOT EXISTS public.pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    categoria text NOT NULL DEFAULT 'gas',
    titulo text NOT NULL,
    descripcion text,
    cantidad text DEFAULT '1 unidad',
    direccion text NOT NULL,
    telefono text NOT NULL,
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado')),
    driver_id text,
    ciudad text NOT NULL DEFAULT 'santacruz',
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
    user_id text UNIQUE NOT NULL,
    distribuidor_nombre text,
    categoria text DEFAULT 'gas',
    titulo text,
    ciudad text DEFAULT 'santacruz',
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    garrafas_agotadas boolean DEFAULT false,
    telefono text,
    last_active timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- E. Avisos Comunitarios
CREATE TABLE IF NOT EXISTS public.avisos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    ciudad text NOT NULL DEFAULT 'santacruz',
    barrio_otb text DEFAULT 'Global',
    autor text NOT NULL DEFAULT 'Vecino',
    tipo text NOT NULL DEFAULT 'aviso',
    categoria text DEFAULT 'AVISO VECINAL',
    titulo text,
    descripcion text,
    mensaje text,
    imagen_url text,
    activo boolean DEFAULT true,
    votos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- F. Comentarios de Avisos
CREATE TABLE IF NOT EXISTS public.comentarios_avisos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aviso_id uuid NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    autor text NOT NULL DEFAULT 'Vecino de la OTB',
    texto text NOT NULL,
    votos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- G. Registro de Votos Únicos
CREATE TABLE IF NOT EXISTS public.votos_registro (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    entidad_id uuid NOT NULL,
    tipo_entidad text NOT NULL CHECK (tipo_entidad IN ('aviso', 'comentario', 'pedido')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, entidad_id)
);

-- H. Anuncios y Promociones Locales
CREATE TABLE IF NOT EXISTS public.anuncios_globales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text,
    ciudad text NOT NULL DEFAULT 'santacruz',
    titulo text,
    descripcion text,
    telefono text,
    categoria text,
    url text,
    imagen_url text,
    image_url text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- I. Usuarios Baneados / Suspendidos
CREATE TABLE IF NOT EXISTS public.usuarios_baneados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text,
    email text,
    nombre text,
    telefono text,
    placa text,
    motivo text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- J. Credenciales Administrativas
CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    password_hash text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- K. Denuncias y Reportes de Spam
CREATE TABLE IF NOT EXISTS public.denuncias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    denunciante_id text,
    denunciado_id text,
    user_id text,
    motivo text NOT NULL,
    detalles text,
    target_id text,
    target_type text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reportes_spam (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text,
    texto text,
    motivo text,
    item_id text,
    item_type text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- L. Configuracion global de publicidad (visible para la app, editable solo por Admin)
CREATE TABLE IF NOT EXISTS public.configuracion_publicidad (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    modo text NOT NULL DEFAULT 'hybrid' CHECK (modo IN ('adsense', 'local', 'hybrid', 'disabled')),
    publisher_id text NOT NULL DEFAULT 'ca-pub-2502415561017945',
    slot_repartidores text NOT NULL DEFAULT '',
    slot_avisos text NOT NULL DEFAULT '',
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.configuracion_publicidad (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 3. VISTAS PÚBLICAS AUTORIZADAS
-- ==============================================================================

CREATE OR REPLACE VIEW public.choferes_publicos
WITH (security_barrier = true)
AS
SELECT 
    id,
    nombre_completo,
    categoria,
    ciudad,
    zonas,
    schedule,
    placa,
    productos,
    estado_verificacion
FROM public.choferes_habilitados ch
WHERE LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub 
    WHERE (ub.user_id IS NOT NULL AND ub.user_id = ch.user_id)
       OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
       OR (ub.placa IS NOT NULL AND LOWER(ub.placa) = LOWER(ch.placa))
);

GRANT SELECT ON public.choferes_publicos TO anon, authenticated;

CREATE OR REPLACE VIEW public.pedidos_publicos
WITH (security_barrier = true)
AS
SELECT
    p.id,
    CASE WHEN p.user_id = auth.uid()::text THEN p.user_id ELSE NULL::text END AS user_id,
    p.categoria,
    CASE WHEN p.user_id = auth.uid()::text THEN p.titulo ELSE NULL::text END AS titulo,
    p.cantidad,
    CASE WHEN p.user_id = auth.uid()::text THEN p.direccion ELSE NULL::text END AS direccion,
    CASE WHEN p.user_id = auth.uid()::text THEN p.telefono ELSE NULL::text END AS telefono,
    p.estado,
    CASE WHEN p.user_id = auth.uid()::text OR p.driver_id = auth.uid()::text THEN p.driver_id ELSE NULL::text END AS driver_id,
    p.ciudad,
    p.barrio_otb,
    CASE WHEN p.user_id = auth.uid()::text THEN p.latitude ELSE ROUND(p.latitude::numeric, 3)::double precision END AS latitude,
    CASE WHEN p.user_id = auth.uid()::text THEN p.longitude ELSE ROUND(p.longitude::numeric, 3)::double precision END AS longitude,
    CASE WHEN p.user_id = auth.uid()::text THEN p.descripcion ELSE NULL::text END AS descripcion,
    p.visto,
    p.created_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto');

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

CREATE OR REPLACE VIEW public.rutas_repartidores_publicas
WITH (security_barrier = true)
AS
SELECT
    r.id,
    CASE WHEN r.user_id = auth.uid()::text THEN r.user_id ELSE NULL::text END AS user_id,
    r.distribuidor_nombre,
    r.categoria,
    r.titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    r.garrafas_agotadas,
    r.last_active
FROM public.rutas_repartidores r
JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= now() - interval '10 minutes'
  AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = r.user_id
  );

GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

-- ==============================================================================
-- 4. FUNCIONES DE SEGURIDAD Y ESTADO
-- ==============================================================================

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
  
  RETURN EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_email
  );
END;
$$;

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
       OR (v_email <> '' AND LOWER(TRIM(email)) = v_email)
       OR (v_email <> '' AND user_id = v_email)
  );
END;
$$;

-- ==============================================================================
-- 5. TRIGGERS AUTOMÁTICOS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_pedidos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON public.pedidos;
CREATE TRIGGER trg_pedidos_updated_at
BEFORE UPDATE ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.set_pedidos_updated_at();

CREATE OR REPLACE FUNCTION public.trg_check_pedido_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A. Estados terminales protegidos
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
$$;

DROP TRIGGER IF EXISTS trg_validate_pedido_transition ON public.pedidos;
CREATE TRIGGER trg_validate_pedido_transition
BEFORE UPDATE OF estado ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.trg_check_pedido_transition();

CREATE OR REPLACE FUNCTION public.guard_pedido_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF OLD.user_id = v_uid THEN
    IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
       OR NEW.estado NOT IN (OLD.estado, 'cancelado', 'entregado') THEN
      RAISE EXCEPTION 'El comprador solo puede cancelar o confirmar la entrega';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.driver_id = v_uid THEN
    IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
       OR NEW.estado NOT IN (OLD.estado, 'entregado') THEN
      RAISE EXCEPTION 'El repartidor asignado solo puede confirmar la entrega';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.driver_id IS NULL
     AND NEW.driver_id = v_uid
     AND OLD.estado IN ('pendiente', 'visto')
     AND NEW.estado = 'asignado'
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['estado', 'driver_id', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'driver_id', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  IF OLD.driver_id IS NULL
     AND NEW.driver_id IS NULL
     AND OLD.estado = 'pendiente'
     AND NEW.estado = OLD.estado
     AND NEW.visto = true
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['visto', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['visto', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Modificacion de pedido no autorizada';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pedido_mutation ON public.pedidos;
CREATE TRIGGER trg_guard_pedido_mutation
BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.guard_pedido_mutation();

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        nombre,
        ciudad
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            split_part(COALESCE(NEW.email, ''), '@', 1)
        ),
        COALESCE(
            NULLIF(
                NEW.raw_user_meta_data ->> 'ciudad',
                ''
            ),
            'santacruz'
        )
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

CREATE OR REPLACE FUNCTION public.sanitize_html()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 160);
  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.mensaje := LEFT(REGEXP_REPLACE(COALESCE(NEW.mensaje, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.autor := LEFT(REGEXP_REPLACE(COALESCE(NEW.autor, 'Vecino'), '<[^>]*>', '', 'g'), 120);
  NEW.categoria := LEFT(REGEXP_REPLACE(COALESCE(NEW.categoria, 'AVISO VECINAL'), '<[^>]*>', '', 'g'), 80);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_html_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.autor := LEFT(REGEXP_REPLACE(COALESCE(NEW.autor, 'Vecino de la OTB'), '<[^>]*>', '', 'g'), 120);
  NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 2000);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_official_notice_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF LOWER(TRIM(COALESCE(NEW.tipo, ''))) IN ('oficial', 'alerta_oficial')
     AND NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Solo un administrador puede emitir comunicados oficiales';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_avisos ON public.avisos;
CREATE TRIGGER trg_sanitize_avisos
BEFORE INSERT OR UPDATE ON public.avisos
FOR EACH ROW EXECUTE FUNCTION public.sanitize_html();

DROP TRIGGER IF EXISTS trg_official_notice_admin ON public.avisos;
CREATE TRIGGER trg_official_notice_admin
BEFORE INSERT OR UPDATE OF tipo ON public.avisos
FOR EACH ROW EXECUTE FUNCTION public.enforce_official_notice_admin();

DROP TRIGGER IF EXISTS trg_sanitize_comentarios ON public.comentarios_avisos;
CREATE TRIGGER trg_sanitize_comentarios
BEFORE INSERT OR UPDATE ON public.comentarios_avisos
FOR EACH ROW EXECUTE FUNCTION public.sanitize_html_chat();

CREATE OR REPLACE FUNCTION public.normalize_delivery_category(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN LOWER(TRIM(COALESCE(p_value, ''))) ~ '(gas|glp|garrafa)' THEN 'gas'
    WHEN LOWER(TRIM(COALESCE(p_value, ''))) ~ '(agua|botell)' THEN 'agua'
    ELSE LOWER(TRIM(COALESCE(p_value, '')))
  END
$$;

CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT public.is_banned()
    AND EXISTS (
      SELECT 1
      FROM public.choferes_habilitados ch
      WHERE ch.user_id = auth.uid()::text
        AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
        AND (p_ciudad IS NULL OR LOWER(TRIM(ch.ciudad)) = LOWER(TRIM(p_ciudad)))
        AND (
          p_categoria IS NULL
          OR public.normalize_delivery_category(ch.categoria) = public.normalize_delivery_category(p_categoria)
          OR public.normalize_delivery_category(ch.categoria) = 'otros'
          OR public.normalize_delivery_category(p_categoria) = 'otros'
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.guard_driver_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Ficha de repartidor no autorizada';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- El registro es automatico. El administrador modera mediante baneo o borrado.
    NEW.estado_verificacion := 'aprobado';
  ELSIF NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion
        OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la verificacion';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_driver_verification ON public.choferes_habilitados;
CREATE TRIGGER trg_guard_driver_verification
BEFORE INSERT OR UPDATE ON public.choferes_habilitados
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_verification();

-- ==============================================================================
-- 6. PROCEDIMIENTOS RPC OFICIALES
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
      AND LOWER(TRIM(COALESCE(estado_verificacion, ''))) = 'aprobado'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no es un repartidor habilitado';
    END IF;

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

    -- Normalizar categorías
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

-- 2. Marcar pedido como visto por un conductor
CREATE OR REPLACE FUNCTION public.rpc_mark_order_seen(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.pedidos%ROWTYPE;
BEGIN
    SELECT * INTO v_order FROM public.pedidos WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF NOT public.is_current_enabled_driver(v_order.ciudad, v_order.categoria) THEN
        RAISE EXCEPTION 'Repartidor no habilitado para este pedido';
    END IF;

    UPDATE public.pedidos
    SET visto = true, updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
      AND estado = 'pendiente';
END;
$$;

-- 3. Obtener grupos de demanda espacial (DBSCAN determinista)
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
    IF NOT public.is_current_enabled_driver(p_ciudad, NULL) THEN
        RAISE EXCEPTION 'Repartidor no habilitado para esta ciudad';
    END IF;

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
    IF NOT public.is_current_enabled_driver(p_ciudad, p_categoria) THEN
        RAISE EXCEPTION 'Repartidor no habilitado para esta ciudad o categoria';
    END IF;

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
        NULL::text AS user_id,
        co.categoria,
        NULL::text AS titulo,
        NULL::text AS descripcion,
        co.cantidad,
        NULL::text AS direccion,
        NULL::text AS telefono,
        co.estado,
        NULL::text AS driver_id,
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

-- 6. Contacto seguro de compradores para el grupo asignado
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
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.choferes_habilitados ch
        WHERE ch.user_id = v_driver_id
          AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
          AND NOT EXISTS (
              SELECT 1
              FROM public.usuarios_baneados ub
              WHERE ub.user_id = v_driver_id
          )
    ) THEN
        RAISE EXCEPTION 'Repartidor no habilitado o baneado';
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
      AND p.estado = 'asignado'
    ORDER BY p.created_at ASC;
END;
$$;

-- 7. Purga de registros antiguos
CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.pedidos
    WHERE (estado IN ('entregado', 'cancelado') AND updated_at < now() - interval '72 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');

    DELETE FROM public.rutas_repartidores
    WHERE last_active < now() - interval '12 hours';

    DELETE FROM public.avisos
    WHERE created_at < now() - interval '72 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_purga_notigas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.purge_old_records();
END;
$$;

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
    IF NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ejecutar la purga';
    END IF;

    DELETE FROM public.pedidos
    WHERE (estado IN ('entregado', 'cancelado') AND updated_at < now() - interval '72 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');
    GET DIAGNOSTICS v_pedidos_borrados = ROW_COUNT;

    DELETE FROM public.rutas_repartidores
    WHERE last_active < now() - interval '12 hours';
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

-- 8. Votos Seguros
CREATE OR REPLACE FUNCTION public.incrementar_votos_aviso(aviso_id uuid, incremento integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := auth.uid()::text;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF is_banned() THEN
    RAISE EXCEPTION 'Usuario no autorizado o suspendido';
  END IF;

  IF incremento > 0 THEN
    BEGIN
      INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad) 
      VALUES (v_user_id, aviso_id, 'aviso');
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya has votado esta publicación';
    END;
    UPDATE public.avisos SET votos = votos + 1 WHERE id = aviso_id;
  ELSE
    DELETE FROM public.votos_registro 
    WHERE user_id = v_user_id AND entidad_id = aviso_id AND tipo_entidad = 'aviso';
    UPDATE public.avisos SET votos = GREATEST(0, votos - 1) WHERE id = aviso_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.incrementar_votos_comentario(comentario_id uuid, incremento integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := auth.uid()::text;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF is_banned() THEN
    RAISE EXCEPTION 'Usuario no autorizado o suspendido';
  END IF;

  IF incremento > 0 THEN
    BEGIN
      INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad) 
      VALUES (v_user_id, comentario_id, 'comentario');
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya has votado este comentario';
    END;
    UPDATE public.comentarios_avisos SET votos = votos + 1 WHERE id = comentario_id;
  ELSE
    DELETE FROM public.votos_registro 
    WHERE user_id = v_user_id AND entidad_id = comentario_id AND tipo_entidad = 'comentario';
    UPDATE public.comentarios_avisos SET votos = GREATEST(0, votos - 1) WHERE id = comentario_id;
  END IF;
END;
$$;

-- 9. Eliminación de cuenta en cascada
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
    DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
    DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
    DELETE FROM public.avisos WHERE user_id = v_uid;
    DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uuid;
    DELETE FROM auth.users WHERE id = v_uuid;
END;
$$;

-- 10. Herramientas administrativas auditables
CREATE OR REPLACE FUNCTION public.rpc_admin_list_users()
RETURNS TABLE (
    user_id uuid,
    email text,
    nombre text,
    role text,
    created_at timestamp with time zone,
    is_driver boolean,
    is_banned boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::text,
        COALESCE(p.nombre, u.raw_user_meta_data ->> 'full_name', split_part(COALESCE(u.email, ''), '@', 1))::text,
        CASE WHEN ch.user_id IS NOT NULL THEN 'repartidor' ELSE COALESCE(p.role, 'vecino') END::text,
        u.created_at,
        (ch.user_id IS NOT NULL),
        EXISTS (
            SELECT 1 FROM public.usuarios_baneados ub
            WHERE ub.user_id = u.id::text
               OR (ub.email IS NOT NULL AND LOWER(TRIM(ub.email)) = LOWER(TRIM(COALESCE(u.email, ''))))
        )
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.choferes_habilitados ch ON ch.user_id = u.id::text
    WHERE NOT EXISTS (
        SELECT 1 FROM public.admin_credentials ac
        WHERE LOWER(TRIM(ac.email)) = LOWER(TRIM(COALESCE(u.email, '')))
    )
    ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid text := p_user_id::text;
    v_email text;
BEGIN
    IF NOT public.is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores';
    END IF;

    SELECT LOWER(TRIM(COALESCE(u.email, ''))) INTO v_email
    FROM auth.users u WHERE u.id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado';
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_credentials ac WHERE LOWER(TRIM(ac.email)) = v_email) THEN
        RAISE EXCEPTION 'No se puede eliminar una cuenta administradora desde el panel';
    END IF;

    DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
    DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
    DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
    DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
    DELETE FROM public.avisos WHERE user_id = v_uid;
    DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
    DELETE FROM public.votos_registro WHERE user_id = v_uid;
    DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
    DELETE FROM public.reportes_spam WHERE user_id = v_uid;
    DELETE FROM public.usuarios_baneados WHERE user_id = v_uid OR LOWER(TRIM(COALESCE(email, ''))) = v_email;
    DELETE FROM public.profiles WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_renew_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores';
    END IF;

    UPDATE public.pedidos
    SET estado = 'pendiente',
        driver_id = NULL,
        visto = false,
        created_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'pendiente');
END;
$$;

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
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votos_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_spam ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_publicidad ENABLE ROW LEVEL SECURITY;

-- B. Políticas: profiles
DROP POLICY IF EXISTS "Profiles Public SELECT" ON public.profiles;
DROP POLICY IF EXISTS "Profiles User SELECT" ON public.profiles;
CREATE POLICY "Profiles User SELECT" ON public.profiles FOR SELECT USING (auth.uid() = id OR is_admin_email());

DROP POLICY IF EXISTS "Profiles User ALL" ON public.profiles;
CREATE POLICY "Profiles User ALL" ON public.profiles FOR ALL USING (auth.uid() = id OR is_admin_email());

-- C. Políticas: choferes_habilitados
DROP POLICY IF EXISTS "Choferes Public SELECT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Own Admin SELECT" ON public.choferes_habilitados;
CREATE POLICY "Choferes Own Admin SELECT" ON public.choferes_habilitados FOR SELECT USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Choferes Insertar propio" ON public.choferes_habilitados;
CREATE POLICY "Choferes Insertar propio" ON public.choferes_habilitados FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Choferes Actualizar propio o Admin" ON public.choferes_habilitados;
CREATE POLICY "Choferes Actualizar propio o Admin" ON public.choferes_habilitados FOR UPDATE
USING (auth.uid()::text = user_id OR is_admin_email())
WITH CHECK (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Choferes Borrar propio o Admin" ON public.choferes_habilitados;
CREATE POLICY "Choferes Borrar propio o Admin" ON public.choferes_habilitados FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

-- D. Políticas: pedidos
DROP POLICY IF EXISTS "Pedidos Dueño Driver Admin SELECT" ON public.pedidos;
CREATE POLICY "Pedidos Dueño Driver Admin SELECT" ON public.pedidos FOR SELECT USING (
    (auth.uid())::text = user_id 
    OR (auth.uid())::text = driver_id 
    OR is_admin_email()
);

DROP POLICY IF EXISTS "Pedidos Insertar propio" ON public.pedidos;
CREATE POLICY "Pedidos Insertar propio" ON public.pedidos FOR INSERT WITH CHECK (
    (auth.uid())::text = user_id 
    AND NOT is_banned()
);

DROP POLICY IF EXISTS "Pedidos Actualizar propio o asignado" ON public.pedidos;
CREATE POLICY "Pedidos Actualizar propio o asignado" ON public.pedidos FOR UPDATE USING (
    (auth.uid())::text = user_id 
    OR (auth.uid())::text = driver_id 
    OR is_admin_email()
)
WITH CHECK (
    (auth.uid())::text = user_id
    OR (auth.uid())::text = driver_id
    OR is_admin_email()
);

DROP POLICY IF EXISTS "Pedidos Borrar propio o admin" ON public.pedidos;
CREATE POLICY "Pedidos Borrar propio o admin" ON public.pedidos FOR DELETE USING (
    (auth.uid())::text = user_id 
    OR is_admin_email()
);

-- E. Políticas: rutas_repartidores
DROP POLICY IF EXISTS "Rutas Public SELECT" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Rutas Own Admin SELECT" ON public.rutas_repartidores;
CREATE POLICY "Rutas Own Admin SELECT" ON public.rutas_repartidores FOR SELECT USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Rutas Driver Insertar" ON public.rutas_repartidores;
CREATE POLICY "Rutas Driver Insertar" ON public.rutas_repartidores FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Rutas Driver Actualizar" ON public.rutas_repartidores;
CREATE POLICY "Rutas Driver Actualizar" ON public.rutas_repartidores FOR UPDATE USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Rutas Driver Borrar" ON public.rutas_repartidores;
CREATE POLICY "Rutas Driver Borrar" ON public.rutas_repartidores FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

-- F. Políticas: avisos y comentarios
DROP POLICY IF EXISTS "Avisos Public SELECT" ON public.avisos;
CREATE POLICY "Avisos Public SELECT" ON public.avisos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Avisos User Insert" ON public.avisos;
CREATE POLICY "Avisos User Insert" ON public.avisos FOR INSERT WITH CHECK (
    auth.uid()::text = user_id
    AND NOT is_banned()
    AND (LOWER(TRIM(COALESCE(tipo, ''))) NOT IN ('oficial', 'alerta_oficial') OR is_admin_email())
);

DROP POLICY IF EXISTS "Avisos User Update" ON public.avisos;
CREATE POLICY "Avisos User Update" ON public.avisos FOR UPDATE
USING (auth.uid()::text = user_id OR is_admin_email())
WITH CHECK (
    (auth.uid()::text = user_id OR is_admin_email())
    AND (LOWER(TRIM(COALESCE(tipo, ''))) NOT IN ('oficial', 'alerta_oficial') OR is_admin_email())
);

DROP POLICY IF EXISTS "Avisos User Delete" ON public.avisos;
CREATE POLICY "Avisos User Delete" ON public.avisos FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Comentarios Public SELECT" ON public.comentarios_avisos;
CREATE POLICY "Comentarios Public SELECT" ON public.comentarios_avisos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Comentarios User Insert" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Insert" ON public.comentarios_avisos FOR INSERT WITH CHECK (auth.uid()::text = user_id AND NOT is_banned());

DROP POLICY IF EXISTS "Comentarios User Update" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Update" ON public.comentarios_avisos FOR UPDATE USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Comentarios User Delete" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Delete" ON public.comentarios_avisos FOR DELETE USING (auth.uid()::text = user_id OR is_admin_email());

-- G. Políticas: anuncios_globales
DROP POLICY IF EXISTS "Anuncios Public SELECT" ON public.anuncios_globales;
CREATE POLICY "Anuncios Public SELECT" ON public.anuncios_globales FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anuncios Admin ALL" ON public.anuncios_globales;
CREATE POLICY "Anuncios Admin ALL" ON public.anuncios_globales FOR ALL USING (is_admin_email());

-- H. Políticas: usuarios_baneados y admin_credentials
DROP POLICY IF EXISTS "Baneados Admin ALL" ON public.usuarios_baneados;
CREATE POLICY "Baneados Admin ALL" ON public.usuarios_baneados FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Admin Credentials Admin ALL" ON public.admin_credentials;
CREATE POLICY "Admin Credentials Admin ALL" ON public.admin_credentials FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Admins select own record" ON public.admin_credentials;
CREATE POLICY "Admins select own record" ON public.admin_credentials FOR SELECT USING (LOWER(TRIM(email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', ''))));

-- I. Políticas: votos_registro
DROP POLICY IF EXISTS "Auth SELECT votos_registro" ON public.votos_registro;
CREATE POLICY "Auth SELECT votos_registro" ON public.votos_registro FOR SELECT USING (auth.uid()::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Auth INSERT votos_registro" ON public.votos_registro;
CREATE POLICY "Auth INSERT votos_registro" ON public.votos_registro FOR INSERT WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Auth DELETE votos_registro" ON public.votos_registro;
CREATE POLICY "Auth DELETE votos_registro" ON public.votos_registro FOR DELETE USING (auth.uid()::text = user_id);

-- J. Políticas: denuncias y reportes_spam
DROP POLICY IF EXISTS "Denuncias Insertar auth" ON public.denuncias;
CREATE POLICY "Denuncias Insertar auth" ON public.denuncias FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Denuncias Admin ALL" ON public.denuncias;
CREATE POLICY "Denuncias Admin ALL" ON public.denuncias FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Reportes Insertar auth" ON public.reportes_spam;
CREATE POLICY "Reportes Insertar auth" ON public.reportes_spam FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Reportes Admin ALL" ON public.reportes_spam;
CREATE POLICY "Reportes Admin ALL" ON public.reportes_spam FOR ALL USING (is_admin_email());

-- K. Politicas: configuracion_publicidad
DROP POLICY IF EXISTS "Publicidad Public SELECT" ON public.configuracion_publicidad;
CREATE POLICY "Publicidad Public SELECT" ON public.configuracion_publicidad FOR SELECT USING (true);

DROP POLICY IF EXISTS "Publicidad Admin ALL" ON public.configuracion_publicidad;
CREATE POLICY "Publicidad Admin ALL" ON public.configuracion_publicidad FOR ALL
USING (is_admin_email()) WITH CHECK (is_admin_email());

-- ==============================================================================
-- 8. PERMISOS DE EJECUCIÓN (GRANTS Y REVOKES)
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_pedidos_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_check_pedido_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_html() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_html_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_records() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_purga_notigas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_delivery_category(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_official_notice_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_pedido_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_driver_verification() FROM PUBLIC, anon, authenticated;

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.choferes_habilitados FROM anon;
REVOKE SELECT ON public.pedidos FROM anon;
REVOKE SELECT ON public.rutas_repartidores FROM anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.choferes_habilitados TO authenticated;
GRANT SELECT ON public.pedidos TO authenticated;
GRANT SELECT ON public.rutas_repartidores TO authenticated;
GRANT SELECT ON public.configuracion_publicidad TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.configuracion_publicidad TO authenticated;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_users() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_admin_renew_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_renew_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_assign_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_mark_order_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_order_seen(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) FROM authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_my_assigned_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_purge_old_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated;

REVOKE ALL ON FUNCTION public.incrementar_votos_aviso(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_aviso(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.incrementar_votos_comentario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_comentario(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_demand_clusters_v2(text, text, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_demand_clusters_v2(text, text, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned() TO anon, authenticated;

-- ==============================================================================
-- 9. ÍNDICES DE RENDIMIENTO PARA PRODUCCIÓN
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_ciudad_cat ON public.pedidos (estado, ciudad, categoria, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_driver_id ON public.pedidos (driver_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_id ON public.pedidos (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_updated_at ON public.pedidos (updated_at);
CREATE INDEX IF NOT EXISTS idx_rutas_ciudad_last_active ON public.rutas_repartidores (ciudad, last_active DESC);
CREATE INDEX IF NOT EXISTS idx_rutas_user_id ON public.rutas_repartidores (user_id);
CREATE INDEX IF NOT EXISTS idx_avisos_ciudad_created ON public.avisos (ciudad, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_aviso_id ON public.comentarios_avisos (aviso_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_choferes_ciudad ON public.choferes_habilitados (ciudad, categoria);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_user_id ON public.usuarios_baneados (user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_email ON public.usuarios_baneados (email);
CREATE INDEX IF NOT EXISTS idx_votos_registro_user ON public.votos_registro (user_id, entidad_id);
