-- ==============================================================================
-- NOTIGAS - CONSOLIDATED FULL PRODUCTION DATABASE SCHEMA
-- Compatible con PostgreSQL 15+ y Supabase Auth / Storage / Realtime
-- Versión Oficial Consolidada de Producción (Incluye Migraciones 001 hasta 086)
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONES
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "postgis" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;

-- ==============================================================================
-- 2. TABLAS BASE
-- ==============================================================================

-- A. Perfiles de usuario (Vecinos, Choferes y Administradores)
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_id text UNIQUE,
    nombre text,
    role text DEFAULT 'vecino' CHECK (role IN ('vecino', 'repartidor', 'admin')),
    ciudad text DEFAULT 'cochabamba',
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
    ciudad text NOT NULL DEFAULT 'cochabamba',
    estado_verificacion text NOT NULL DEFAULT 'aprobado',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- C. Pedidos Vecinales (Máquina Canónica de 6 Estados)
CREATE TABLE IF NOT EXISTS public.pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    categoria text NOT NULL DEFAULT 'gas',
    titulo text NOT NULL,
    descripcion text,
    cantidad text DEFAULT '1 unidad',
    direccion text NOT NULL,
    telefono text DEFAULT '',
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado', 'recibido')),
    driver_id text,
    ciudad text NOT NULL DEFAULT 'cochabamba',
    barrio_otb text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    visto boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- C.1 Archivo Histórico de Pedidos Purgados
CREATE TABLE IF NOT EXISTS public.pedidos_archivo (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
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
    visto boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);

-- D. Rutas y Telemetría en Vivo de Repartidores
CREATE TABLE IF NOT EXISTS public.rutas_repartidores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text UNIQUE NOT NULL,
    distribuidor_nombre text,
    categoria text DEFAULT 'gas',
    titulo text,
    ciudad text DEFAULT 'cochabamba',
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    garrafas_agotadas boolean DEFAULT false,
    telefono text,
    last_active timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- E. Avisos Comunitarios (Pestaña 3: Avisos Gratis de tu Ciudad)
CREATE TABLE IF NOT EXISTS public.avisos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    ciudad text NOT NULL DEFAULT 'cochabamba',
    barrio_otb text DEFAULT 'Global',
    autor text NOT NULL DEFAULT 'Vecino',
    tipo text NOT NULL DEFAULT 'aviso',
    categoria text DEFAULT 'COMENTARIO',
    titulo text,
    descripcion text,
    mensaje text,
    imagen_url text,
    activo boolean DEFAULT true,
    votos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.avisos IS
  'Avisos comunitarios creados por usuarios. Son distintos de la publicidad y conservan su ciclo de vida de 48 horas.';

-- F. Comentarios en Avisos Comunitarios
CREATE TABLE IF NOT EXISTS public.comentarios_avisos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aviso_id uuid REFERENCES public.avisos(id) ON DELETE CASCADE NOT NULL,
    user_id text NOT NULL,
    autor text NOT NULL DEFAULT 'Vecino',
    texto text NOT NULL,
    votos integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- G. Anuncios y Propagandas del Sistema (3 Pestañas Independientes por Ciudad y Global)
CREATE TABLE IF NOT EXISTS public.anuncios_globales (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo text NOT NULL,
    descripcion text,
    url text,
    image_url text,
    activo boolean DEFAULT true,
    ciudad text NOT NULL DEFAULT 'cochabamba',
    posicion text NOT NULL DEFAULT 'mapa' CHECK (posicion IN ('mapa', 'repartidores', 'muro_avisos')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.anuncios_globales IS
  'Anuncios publicitarios administrados. Son persistentes y no pertenecen al ciclo de purga de Avisos Gratis.';
COMMENT ON COLUMN public.anuncios_globales.posicion IS
  'Ubicación publicitaria: mapa, repartidores o muro_avisos. muro_avisos no es una fila de public.avisos.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_anuncios_globales_ciudad_posicion
ON public.anuncios_globales (LOWER(TRIM(ciudad)), LOWER(TRIM(COALESCE(posicion, 'mapa'))));

-- H. Configuración de Publicidad
CREATE TABLE IF NOT EXISTS public.configuracion_publicidad (
    id integer PRIMARY KEY DEFAULT 1,
    modo text DEFAULT 'local' CHECK (modo IN ('adsense', 'local', 'disabled')),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.configuracion_publicidad (id, modo, updated_at)
VALUES (1, 'local', now())
ON CONFLICT (id) DO NOTHING;

-- I. Tablas de Seguridad, Roles y Moderación
CREATE TABLE IF NOT EXISTS public.usuarios_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    rol text NOT NULL DEFAULT 'administrador',
    baneado boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.usuarios_baneados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text UNIQUE NOT NULL,
    email text,
    motivo text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.denuncias (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo text NOT NULL,
    detalle text NOT NULL,
    denunciante_id text,
    denunciado_id text,
    user_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reportes_spam (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo text NOT NULL,
    detalle text NOT NULL,
    user_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.votos_registro (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    entidad_id uuid NOT NULL,
    tipo_entidad text NOT NULL CHECK (tipo_entidad IN ('aviso', 'comentario', 'pedido')),
    valor integer NOT NULL CHECK (valor IN (-1, 1)),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unq_votos_user_entidad UNIQUE (user_id, entidad_id, tipo_entidad)
);

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    action text NOT NULL,
    bucket_start timestamp with time zone NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unq_security_rate_limits UNIQUE (user_id, action, bucket_start)
);

-- ==============================================================================
-- 3. VISTAS PÚBLICAS CON SECURITY INVOKER (PostgreSQL 15+)
-- ==============================================================================

DROP VIEW IF EXISTS public.choferes_publicos CASCADE;
CREATE VIEW public.choferes_publicos WITH (security_invoker = true) AS
SELECT 
    ch.id, 
    ch.user_id, 
    ch.nombre_completo, 
    ch.categoria, 
    ch.ciudad, 
    ch.schedule, 
    ch.placa, 
    ch.productos,
    ch.telefono_whatsapp AS telefono,
    NULL::text AS descripcion,
    NULL::text AS foto_url,
    ch.estado_verificacion,
    ch.created_at
FROM public.choferes_habilitados ch
WHERE NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = ch.user_id
);

DROP VIEW IF EXISTS public.rutas_repartidores_publicas CASCADE;
CREATE VIEW public.rutas_repartidores_publicas WITH (security_invoker = true) AS
SELECT
    r.id,
    CASE
        WHEN r.user_id = (SELECT auth.uid())::text THEN r.user_id
        ELSE NULL::text
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS') AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP') AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución') AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    ch.placa,
    ch.productos
FROM public.rutas_repartidores r
JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = r.user_id
  );

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
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.descripcion
        ELSE NULL::text
    END AS descripcion,
    p.cantidad,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.direccion
        ELSE COALESCE(p.barrio_otb, 'Zona indicada en el mapa')
    END AS direccion,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.telefono
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
  AND p.created_at >= (now() - interval '24 hours')
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = p.user_id
  );

GRANT SELECT ON public.choferes_publicos TO anon, authenticated;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- ==============================================================================
-- 4. FUNCIONES DE SEGURIDAD Y REGLAS DE NEGOCIO
-- ==============================================================================

-- A. Verificación de Administrador por Email Explícito o Sesión
CREATE OR REPLACE FUNCTION public.is_admin_email_for(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_jwt_email text := LOWER(TRIM(COALESCE(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    auth.jwt() -> 'app_metadata' ->> 'email',
    ''
  )));
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_role text := COALESCE(auth.jwt() ->> 'role', session_user);
BEGIN
  -- Permiso total a superuser / service_role
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- 1. Validar por email en JWT (sesión real autenticada)
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 2. Validar por UID en auth.users (sesión real autenticada)
  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, raw_user_meta_data->>'email', ''))) INTO v_user_email
    FROM auth.users WHERE id = v_user_id;

    IF v_user_email <> '' AND EXISTS (
      SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_user_email
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- A.1 Verificación de Administrador en Sesión Actual (0 argumentos para RLS y Triggers)
CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_jwt_email text := LOWER(TRIM(COALESCE(
    auth.jwt() ->> 'email',
    auth.jwt() -> 'user_metadata' ->> 'email',
    auth.jwt() -> 'app_metadata' ->> 'email',
    ''
  )));
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_role text := COALESCE(auth.jwt() ->> 'role', session_user);
BEGIN
  -- Permiso total a superuser / service_role
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- 1. Validar por email en JWT (sesión real autenticada)
  IF v_jwt_email <> '' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_jwt_email
  ) THEN
    RETURN true;
  END IF;

  -- 2. Validar por UID en auth.users (sesión real autenticada)
  IF v_user_id IS NOT NULL THEN
    SELECT LOWER(TRIM(COALESCE(email, raw_user_meta_data->>'email', ''))) INTO v_user_email
    FROM auth.users WHERE id = v_user_id;

    IF v_user_email <> '' AND EXISTS (
      SELECT 1 FROM public.admin_credentials WHERE LOWER(TRIM(email)) = v_user_email
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- B. Verificación de Usuario Baneado
CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_baneados
    WHERE user_id = (SELECT auth.uid())::text
       OR email = LOWER(TRIM(COALESCE(
            (auth.jwt() ->> 'email'),
            (SELECT email FROM auth.users WHERE id = auth.uid())
          )))
  );
$$;

-- C. Verificación de Repartidor Habilitado en Ciudad/Categoría Específica (Estricta sin comodines)
CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(p_ciudad text DEFAULT NULL, p_categoria text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id = (SELECT auth.uid())::text
      AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
      AND (p_ciudad IS NULL OR LOWER(TRIM(ch.ciudad)) = LOWER(TRIM(p_ciudad)))
      AND (
        p_categoria IS NOT NULL
        AND (
          LOWER(TRIM(ch.categoria)) = LOWER(TRIM(p_categoria))
          OR (LOWER(TRIM(ch.categoria)) IN ('gas', 'gas glp', 'garrafa', 'glp') AND LOWER(TRIM(p_categoria)) IN ('gas', 'gas glp', 'garrafa', 'glp'))
          OR (LOWER(TRIM(ch.categoria)) IN ('agua', 'agua potable', 'botellon') AND LOWER(TRIM(p_categoria)) IN ('agua', 'agua potable', 'botellon'))
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = ch.user_id
      )
  );
$$;

-- D. Limitador de Tasa Anti-Spam
CREATE OR REPLACE FUNCTION public.enforce_action_rate_limit(action_name text, max_events integer, window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bucket timestamp with time zone;
  v_current_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado para rate limit';
  END IF;

  v_bucket := date_trunc('minute', now()) + (floor(date_part('second', now()) / window_seconds) * window_seconds) * interval '1 second';

  INSERT INTO public.security_rate_limits (user_id, action, bucket_start, count)
  VALUES (v_user_id, action_name, v_bucket, 1)
  ON CONFLICT (user_id, action, bucket_start)
  DO UPDATE SET count = public.security_rate_limits.count + 1
  RETURNING count INTO v_current_count;

  IF v_current_count > max_events THEN
    RAISE EXCEPTION 'Límite de tasa excedido para %. Espera un momento antes de reintentar.', action_name;
  END IF;

  RETURN true;
END;
$$;

-- E. Protección de Integridad de Perfil
CREATE OR REPLACE FUNCTION public.guard_profile_field_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  NEW.nombre := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre, ''), '<[^>]*>', '', 'g'), 120);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, 'cochabamba'))), 80);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  NEW.role := COALESCE(NEW.role, 'vecino');

  IF NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN
    RAISE EXCEPTION 'Latitud inválida';
  END IF;
  IF NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN
    RAISE EXCEPTION 'Longitud inválida';
  END IF;

  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND (auth.uid() IS NULL OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id)) THEN
    IF NEW.role NOT IN ('vecino', 'repartidor') THEN
      NEW.role := 'vecino';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes modificar el perfil de otra cuenta';
  END IF;

  IF NEW.role NOT IN ('vecino', 'repartidor') THEN
    RAISE EXCEPTION 'No puedes asignarte privilegios de administrador';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'No se puede cambiar el propietario del perfil';
  END IF;

  RETURN NEW;
END;
$$;

-- F. Creación Automática de Perfil desde Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        nombre,
        ciudad,
        role
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'nombre',
            split_part(COALESCE(NEW.email, ''), '@', 1),
            'Vecino'
        ),
        COALESCE(
            NULLIF(LOWER(TRIM(NEW.raw_user_meta_data ->> 'ciudad')), ''),
            'cochabamba'
        ),
        'vecino'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- G. Control de Mutación y Movimiento de Pedidos en Vivo
CREATE OR REPLACE FUNCTION public.guard_pedido_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- 1. Comprador propietario del pedido
  IF OLD.user_id = v_uid THEN
    IF OLD.estado IN ('pendiente', 'visto') THEN
      IF NEW.estado NOT IN (OLD.estado, 'cancelado', 'recibido') THEN
        RAISE EXCEPTION 'El comprador solo puede cambiar estado a cancelado o recibido en pedidos activos';
      END IF;

      IF (to_jsonb(NEW) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'latitude', 'longitude', 'direccion', 'barrio_otb', 'updated_at']) THEN
        RAISE EXCEPTION 'El comprador solo puede mover su ubicación o cancelar el pedido';
      END IF;

      IF NEW.latitude < -90 OR NEW.latitude > 90 OR NEW.longitude < -180 OR NEW.longitude > 180 THEN
        RAISE EXCEPTION 'Coordenadas geográficas inválidas';
      END IF;

      RETURN NEW;
    END IF;

    IF OLD.estado IN ('asignado', 'entregado') THEN
      IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
         OR NEW.estado NOT IN (OLD.estado, 'recibido', 'cancelado') THEN
        RAISE EXCEPTION 'El comprador solo puede confirmar la recepción o cancelar el pedido';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No se pueden modificar pedidos finalizados';
  END IF;

  -- 2. Repartidor asignado
  IF OLD.driver_id = v_uid THEN
    IF (to_jsonb(NEW) - ARRAY['estado', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'updated_at'])
       OR NEW.estado NOT IN (OLD.estado, 'entregado') THEN
      RAISE EXCEPTION 'El repartidor asignado solo puede confirmar la entrega';
    END IF;
    RETURN NEW;
  END IF;

  -- 3. Repartidor habilitado tomando el pedido (asignación)
  IF OLD.driver_id IS NULL
     AND NEW.driver_id = v_uid
     AND OLD.estado IN ('pendiente', 'visto')
     AND NEW.estado = 'asignado'
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['estado', 'driver_id', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado', 'driver_id', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  -- 4. Repartidor habilitado marcando el pedido como visto
  IF OLD.driver_id IS NULL
     AND NEW.driver_id IS NULL
     AND OLD.estado = 'pendiente'
     AND NEW.estado IN ('pendiente', 'visto')
     AND NEW.visto = true
     AND public.is_current_enabled_driver(OLD.ciudad, OLD.categoria)
     AND (to_jsonb(NEW) - ARRAY['visto', 'estado', 'updated_at'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['visto', 'estado', 'updated_at']) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Modificacion de pedido no autorizada';
END;
$function$;

-- H. Transición de Estados de Pedidos
CREATE OR REPLACE FUNCTION public.trg_check_pedido_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.estado IN ('entregado', 'cancelado', 'recibido') AND NEW.estado <> OLD.estado THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'No se puede modificar un pedido que ya está en estado final (%)', OLD.estado;
    END IF;
  END IF;

  IF NEW.estado IN ('entregado', 'recibido') AND OLD.estado NOT IN ('entregado', 'recibido') THEN
    IF NEW.user_id <> auth.uid()::text AND NEW.driver_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador o el repartidor asignado pueden confirmar la entrega/recepción.';
    END IF;
  END IF;

  IF NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado' THEN
    IF NEW.user_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador creador del pedido puede cancelarlo.';
    END IF;
  END IF;

  IF NEW.estado = 'asignado' AND OLD.estado NOT IN ('pendiente', 'visto', 'asignado') THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'Transición de estado no válida para asignación desde %', OLD.estado;
    END IF;
  END IF;

  IF NEW.estado = 'visto' AND OLD.estado NOT IN ('pendiente', 'visto') THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'Transición de estado no válida para visto desde %', OLD.estado;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- I. Timestamp Automático
CREATE OR REPLACE FUNCTION public.set_pedidos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- J. Rate limits en inserción
CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  PERFORM public.enforce_action_rate_limit('order_create', 5, 60);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_limited_content_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  PERFORM public.enforce_action_rate_limit('content_post', 10, 60);
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 5. PROCEDIMIENTOS ALMACENADOS (RPCS ATÓMICOS DE PRODUCCIÓN)
-- ==============================================================================

-- A. Guardar Anuncio Local
CREATE OR REPLACE FUNCTION public.rpc_save_local_ad(
    p_titulo text,
    p_descripcion text,
    p_url text,
    p_image_url text,
    p_ciudad text,
    p_activo boolean DEFAULT true,
    p_posicion text DEFAULT 'mapa'::text,
    p_admin_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
    v_ad_id UUID;
    v_norm_ciudad TEXT;
    v_norm_pos TEXT;
    v_clean_url TEXT;
BEGIN
    IF NOT public.is_admin_email_for(p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora activa');
    END IF;

    v_norm_ciudad := LOWER(TRIM(COALESCE(p_ciudad, 'global')));
    IF v_norm_ciudad IN ('', 'todas', 'todos', 'all', 'todas las ciudades', 'todas_las_ciudades', 'nacional') THEN
        v_norm_ciudad := 'global';
    END IF;

    v_norm_pos := LOWER(TRIM(COALESCE(p_posicion, 'mapa')));
    IF v_norm_pos = 'avisos' THEN
        v_norm_pos := 'muro_avisos';
    END IF;
    IF v_norm_pos NOT IN ('mapa', 'repartidores', 'muro_avisos') THEN
        v_norm_pos := 'mapa';
    END IF;

    v_clean_url := NULLIF(TRIM(p_url), '');

    INSERT INTO public.anuncios_globales (
        titulo,
        descripcion,
        url,
        image_url,
        ciudad,
        posicion,
        activo,
        created_at
    )
    VALUES (
        COALESCE(NULLIF(TRIM(p_titulo), ''), 'Auspiciador Oficial NOTIGAS'),
        COALESCE(NULLIF(TRIM(p_descripcion), ''), 'Propaganda Local - ' || UPPER(v_norm_pos)),
        v_clean_url,
        CASE WHEN p_image_url = '__REMOVE__' THEN NULL ELSE NULLIF(TRIM(p_image_url), '') END,
        v_norm_ciudad,
        v_norm_pos,
        COALESCE(p_activo, true),
        now()
    )
    ON CONFLICT (LOWER(TRIM(COALESCE(ciudad, 'global'))), LOWER(TRIM(COALESCE(posicion, 'mapa'))))
    DO UPDATE SET
        titulo = EXCLUDED.titulo,
        descripcion = EXCLUDED.descripcion,
        url = EXCLUDED.url,
        image_url = CASE
            WHEN p_image_url = '__REMOVE__' THEN NULL
            WHEN p_image_url IS NOT NULL AND TRIM(p_image_url) <> '' THEN p_image_url
            ELSE public.anuncios_globales.image_url
        END,
        activo = EXCLUDED.activo,
        created_at = now()
    RETURNING id INTO v_ad_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_ad_id,
        'ciudad', v_norm_ciudad,
        'posicion', v_norm_pos
    );
END;
$$;

-- A.2 Eliminar Anuncio Local
CREATE OR REPLACE FUNCTION public.rpc_delete_local_ad(
    p_ad_id uuid,
    p_admin_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
    IF NOT public.is_admin_email_for(p_admin_email) THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere cuenta administradora activa');
    END IF;

    DELETE FROM public.anuncios_globales
    WHERE id = p_ad_id;

    RETURN jsonb_build_object('success', true, 'id', p_ad_id);
END;
$$;

-- B. Mover Ubicación de Pedido Activo en Vivo
CREATE OR REPLACE FUNCTION public.rpc_update_order_location(
    p_order_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id TEXT;
    v_updated_id UUID;
    v_current_estado TEXT;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
    END IF;

    IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coordenadas inválidas');
    END IF;

    SELECT estado INTO v_current_estado
    FROM public.pedidos
    WHERE id = p_order_id AND user_id = v_user_id;

    IF v_current_estado IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pedido no encontrado o no pertenece a tu cuenta');
    END IF;

    IF v_current_estado NOT IN ('pendiente', 'visto') THEN
        RETURN jsonb_build_object('success', false, 'error', 'El pedido ya está en curso y no puede moverse');
    END IF;

    UPDATE public.pedidos
    SET latitude = p_latitude,
        longitude = p_longitude,
        updated_at = now()
    WHERE id = p_order_id
      AND user_id = v_user_id
    RETURNING id INTO v_updated_id;

    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_updated_id,
        'latitude', p_latitude,
        'longitude', p_longitude
    );
END;
$$;

-- C. Tomar / Asignar Pedido a Repartidor (Estricto por Ciudad Registrada)
CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    -- Validar estrictamente la ciudad del chofer
    IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    v_order_cat := LOWER(TRIM(COALESCE(v_order.categoria, '')));
    v_driver_cat := LOWER(TRIM(COALESCE(v_driver.categoria, '')));

    IF v_order_cat ILIKE '%gas%' OR v_order_cat ILIKE '%glp%' OR v_order_cat ILIKE '%garrafa%' THEN
        v_order_cat := 'gas';
    ELSIF v_order_cat ILIKE '%agua%' OR v_order_cat ILIKE '%botell%' THEN
        v_order_cat := 'agua';
    END IF;

    IF v_driver_cat ILIKE '%gas%' OR v_driver_cat ILIKE '%glp%' OR v_driver_cat ILIKE '%garrafa%' THEN
        v_driver_cat := 'gas';
    ELSIF v_driver_cat ILIKE '%agua%' OR v_driver_cat ILIKE '%botell%' THEN
        v_driver_cat := 'agua';
    END IF;

    IF v_order_cat <> v_driver_cat THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    IF v_order.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible';
    END IF;

    UPDATE public.pedidos
    SET estado = 'asignado',
        driver_id = v_driver_id,
        updated_at = now()
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
$function$;

-- D. Marcar Pedido Visto por Chofer
CREATE OR REPLACE FUNCTION public.rpc_mark_order_seen(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_driver_id text := auth.uid()::text;
  v_driver record;
  v_order record;
BEGIN
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = v_driver_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El usuario no es un repartidor habilitado');
  END IF;

  SELECT * INTO v_order
  FROM public.pedidos
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pedido no pertenece a la ciudad del repartidor');
  END IF;

  IF NOT public.is_current_enabled_driver(v_order.ciudad, v_order.categoria) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Categoría no coincide con el repartidor');
  END IF;

  UPDATE public.pedidos
  SET visto = true,
      estado = 'visto',
      updated_at = now()
  WHERE id = p_order_id
    AND estado = 'pendiente';

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'visto', 'visto', true);
END;
$$;

-- E. Confirmación de Recepción por el Comprador
CREATE OR REPLACE FUNCTION public.rpc_confirm_order_received(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_order record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_order
  FROM public.pedidos
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  IF v_order.user_id <> v_uid AND NOT is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el comprador puede confirmar la recepcion de su pedido');
  END IF;

  UPDATE public.pedidos
  SET estado = 'recibido',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'recibido');
END;
$$;

-- F. Confirmación de Entrega por el Repartidor
CREATE OR REPLACE FUNCTION public.rpc_driver_confirm_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_driver_id text := auth.uid()::text;
  v_order record;
BEGIN
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_order
  FROM public.pedidos
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  IF v_order.driver_id <> v_driver_id AND NOT is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el repartidor asignado puede confirmar la entrega');
  END IF;

  UPDATE public.pedidos
  SET estado = 'entregado',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'entregado');
END;
$$;

-- G. Cancelar Pedido Propio
CREATE OR REPLACE FUNCTION public.rpc_cancel_own_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_order record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_order
  FROM public.pedidos
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  IF v_order.user_id <> v_uid AND NOT is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo el creador del pedido puede cancelarlo');
  END IF;

  UPDATE public.pedidos
  SET estado = 'cancelado',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'cancelado');
END;
$$;

-- H. Listar Pedidos Disponibles para Chofer (Demanda Colectiva y Categoría Estricta)
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

-- I. Bootstrap de Inicialización de Usuario
CREATE OR REPLACE FUNCTION public.rpc_get_user_bootstrap_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_profile record;
  v_driver record;
  v_active_order record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_driver FROM public.choferes_habilitados WHERE user_id = v_uid;
  SELECT * INTO v_active_order FROM public.pedidos WHERE user_id = v_uid AND estado IN ('pendiente', 'visto', 'asignado') ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'profile', row_to_json(v_profile),
    'driver', row_to_json(v_driver),
    'active_order', row_to_json(v_active_order),
    'is_admin', is_admin_email(),
    'is_banned', is_banned()
  );
END;
$$;

-- J. Pedidos Asignados a Mi Cuenta (Repartidor - Contacto Completo Autorizado)
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
SET search_path = public, auth
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
$$;

-- K. Purga Automática de Registros Viejos con Archivador Histórico
CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedidos_archived integer := 0;
  v_pedidos_deleted integer := 0;
  v_rutas_deleted integer := 0;
BEGIN
  -- Permiso total si es llamado desde cron (superuser/postgres) o administrador
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') AND NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere privilegios administrativos');
  END IF;

  -- A. Archivar pedidos terminados o antiguos (> 24h) antes del borrado
  WITH to_archive AS (
    SELECT * FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
  ),
  ins AS (
    INSERT INTO public.pedidos_archivo (
      id, user_id, categoria, titulo, descripcion, cantidad, direccion,
      telefono, estado, driver_id, ciudad, barrio_otb, latitude, longitude,
      visto, created_at, updated_at, archived_at
    )
    SELECT 
      id, user_id, categoria, titulo, descripcion, cantidad, direccion,
      telefono, estado, driver_id, ciudad, barrio_otb, latitude, longitude,
      visto, created_at, updated_at, now()
    FROM to_archive
    ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      driver_id = EXCLUDED.driver_id,
      updated_at = EXCLUDED.updated_at,
      archived_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_pedidos_archived FROM ins;

  -- B. Borrar pedidos archivados
  WITH d AS (
    DELETE FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  -- C. Eliminar rutas inactivas de repartidores (> 2 horas)
  WITH d AS (
    DELETE FROM public.rutas_repartidores
    WHERE last_active < (now() - interval '2 hours')
    RETURNING id
  ) SELECT count(*) INTO v_rutas_deleted FROM d;

  RETURN jsonb_build_object(
    'success', true,
    'pedidos_archivados', v_pedidos_archived,
    'pedidos_eliminados', v_pedidos_deleted,
    'rutas_eliminadas', v_rutas_deleted
  );
END;
$$;

-- L. Incrementar Votos en Avisos y Comentarios
CREATE OR REPLACE FUNCTION public.incrementar_votos_aviso(post_id uuid, delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_total integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Delta inválido';
  END IF;

  INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad, valor)
  VALUES (v_user_id, post_id, 'aviso', delta)
  ON CONFLICT (user_id, entidad_id, tipo_entidad)
  DO UPDATE SET valor = EXCLUDED.valor, created_at = now();

  SELECT COALESCE(SUM(valor), 0) INTO v_total
  FROM public.votos_registro
  WHERE entidad_id = post_id AND tipo_entidad = 'aviso';

  UPDATE public.avisos SET votos = v_total WHERE id = post_id;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.incrementar_votos_comentario(comment_id uuid, delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id text := auth.uid()::text;
  v_total integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Delta inválido';
  END IF;

  INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad, valor)
  VALUES (v_user_id, comment_id, 'comentario', delta)
  ON CONFLICT (user_id, entidad_id, tipo_entidad)
  DO UPDATE SET valor = EXCLUDED.valor, created_at = now();

  SELECT COALESCE(SUM(valor), 0) INTO v_total
  FROM public.votos_registro
  WHERE entidad_id = comment_id AND tipo_entidad = 'comentario';

  UPDATE public.comentarios_avisos SET votos = v_total WHERE id = comment_id;
  RETURN v_total;
END;
$$;

-- M. Eliminación Integral de Cuenta de Usuario
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uuid uuid := auth.uid();
  v_uid text;
  v_email text;
BEGIN
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_uid := v_uuid::text;
  SELECT LOWER(TRIM(COALESCE(email, ''))) INTO v_email
  FROM auth.users WHERE id = v_uuid;

  DELETE FROM public.votos_registro WHERE user_id = v_uid;
  DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados WHERE user_id = v_uid OR (v_email <> '' AND LOWER(TRIM(COALESCE(email, ''))) = v_email);
  DELETE FROM public.profiles WHERE id = v_uuid;
  DELETE FROM auth.users WHERE id = v_uuid;
END;
$$;

-- N. RPCs de Gestión Administrativa
CREATE OR REPLACE FUNCTION public.rpc_admin_list_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin_email() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN (
    SELECT jsonb_agg(u) FROM (
      SELECT
        p.id,
        p.nombre,
        p.role,
        p.ciudad,
        p.telefono,
        p.created_at,
        au.email,
        EXISTS (SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = p.id::text) AS baneado
      FROM public.profiles p
      LEFT JOIN auth.users au ON au.id = p.id
      ORDER BY p.created_at DESC
      LIMIT 200
    ) u
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin_email() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  DELETE FROM public.pedidos WHERE user_id = p_user_id OR driver_id = p_user_id;
  DELETE FROM public.avisos WHERE user_id = p_user_id;
  DELETE FROM public.comentarios_avisos WHERE user_id = p_user_id;
  DELETE FROM public.rutas_repartidores WHERE user_id = p_user_id;
  DELETE FROM public.choferes_habilitados WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id::text = p_user_id;
  DELETE FROM auth.users WHERE id::text = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_driver_by_id(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text;
BEGIN
  IF NOT is_admin_email() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT user_id INTO v_uid FROM public.choferes_habilitados WHERE id = p_driver_id;
  DELETE FROM public.choferes_habilitados WHERE id = p_driver_id;
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
    UPDATE public.profiles SET role = 'vecino' WHERE id::text = v_uid;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_renew_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin_email() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE public.pedidos
  SET estado = 'pendiente',
      driver_id = NULL,
      visto = false,
      created_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_get_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_users_count bigint := 0;
  v_vendors_count bigint := 0;
  v_orders_active bigint := 0;
  v_orders_delivered bigint := 0;
  v_orders_cancelled bigint := 0;
  v_avisos_count bigint := 0;
  v_reports_count bigint := 0;
  v_reported_entities_count bigint := 0;
BEGIN
  IF NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  SELECT count(*) INTO v_users_count FROM public.profiles;
  SELECT count(*) INTO v_vendors_count FROM public.choferes_habilitados WHERE LOWER(TRIM(COALESCE(estado_verificacion, ''))) = 'aprobado';
  SELECT count(*) INTO v_orders_active FROM public.pedidos WHERE estado IN ('pendiente', 'visto', 'asignado');
  SELECT count(*) INTO v_orders_delivered FROM public.pedidos WHERE estado IN ('entregado', 'recibido');
  SELECT count(*) INTO v_orders_cancelled FROM public.pedidos WHERE estado = 'cancelado';
  SELECT count(*) INTO v_avisos_count FROM public.avisos;
  SELECT count(*) INTO v_reports_count FROM public.denuncias;
  
  SELECT count(DISTINCT COALESCE(NULLIF(TRIM(denunciado_id), ''), NULLIF(TRIM(user_id), '')))
  INTO v_reported_entities_count
  FROM public.denuncias
  WHERE COALESCE(NULLIF(TRIM(denunciado_id), ''), NULLIF(TRIM(user_id), '')) IS NOT NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'users_count', v_users_count,
    'vendors_count', v_vendors_count,
    'orders_active', v_orders_active,
    'orders_delivered', v_orders_delivered,
    'orders_cancelled', v_orders_cancelled,
    'avisos_count', v_avisos_count,
    'reports_count', v_reports_count,
    'reported_entities_count', v_reported_entities_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_crear_aviso_vecinal(
  p_ciudad text DEFAULT 'cochabamba',
  p_barrio text DEFAULT 'Global',
  p_autor text DEFAULT 'Vecino',
  p_tipo text DEFAULT 'aviso',
  p_categoria text DEFAULT 'COMENTARIO',
  p_titulo text DEFAULT '',
  p_descripcion text DEFAULT '',
  p_mensaje text DEFAULT '',
  p_imagen text DEFAULT '',
  p_barrio_otb text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_id uuid;
  v_barrio_final text;
  v_ciudad_final text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'Usuario no autenticado');
  END IF;
  IF is_banned() THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'Usuario suspendido');
  END IF;

  v_barrio_final := COALESCE(NULLIF(TRIM(p_barrio_otb), ''), NULLIF(TRIM(p_barrio), ''), 'Global');
  v_ciudad_final := COALESCE(NULLIF(LOWER(TRIM(p_ciudad)), ''), 'cochabamba');

  INSERT INTO public.avisos (
    user_id, ciudad, barrio_otb, autor, tipo, categoria, titulo, descripcion, mensaje, imagen_url, activo, votos, created_at
  )
  VALUES (
    v_uid,
    v_ciudad_final,
    v_barrio_final,
    COALESCE(NULLIF(TRIM(p_autor), ''), 'Vecino de la OTB'),
    COALESCE(NULLIF(TRIM(p_tipo), ''), 'aviso'),
    COALESCE(NULLIF(UPPER(TRIM(p_categoria)), ''), 'COMENTARIO'),
    COALESCE(NULLIF(TRIM(p_titulo), ''), 'Aviso Vecinal'),
    COALESCE(NULLIF(TRIM(p_descripcion), ''), NULLIF(TRIM(p_mensaje), ''), 'Publicación vecinal'),
    COALESCE(NULLIF(TRIM(p_mensaje), ''), NULLIF(TRIM(p_descripcion), ''), ''),
    NULLIF(TRIM(p_imagen), ''),
    true,
    1,
    now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad, valor)
  VALUES (v_uid, v_id, 'aviso', 1)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_actualizar_aviso_propio(
    p_aviso_id uuid,
    p_titulo text,
    p_descripcion text,
    p_categoria text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
    v_uid text := auth.uid()::text;
    v_aviso record;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado');
    END IF;

    IF is_banned() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Usuario suspendido');
    END IF;

    SELECT * INTO v_aviso
    FROM public.avisos
    WHERE id = p_aviso_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Aviso no encontrado');
    END IF;

    IF v_aviso.user_id <> v_uid AND NOT public.is_admin_email() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Solo el autor o administrador puede editar este aviso');
    END IF;

    UPDATE public.avisos
    SET titulo = TRIM(p_titulo),
        descripcion = TRIM(p_descripcion),
        categoria = UPPER(TRIM(p_categoria))
    WHERE id = p_aviso_id;

    RETURN jsonb_build_object('ok', true, 'id', p_aviso_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_agregar_comentario_aviso(p_aviso_id uuid, p_autor text, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF is_banned() THEN
    RAISE EXCEPTION 'Usuario suspendido';
  END IF;

  INSERT INTO public.comentarios_avisos (aviso_id, user_id, autor, texto, votos, created_at)
  VALUES (
    p_aviso_id,
    v_uid,
    COALESCE(NULLIF(TRIM(p_autor), ''), 'Vecino'),
    TRIM(p_texto),
    1,
    now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad, valor)
  VALUES (v_uid, v_id, 'comentario', 1)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- ==============================================================================
-- 6. TRIGGERS DEL SISTEMA
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_guard_profile ON public.profiles;
CREATE TRIGGER trg_guard_profile
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_field_integrity();

DROP TRIGGER IF EXISTS tr_handle_new_user ON auth.users;
CREATE TRIGGER tr_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON public.pedidos;
CREATE TRIGGER trg_pedidos_updated_at
BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.set_pedidos_updated_at();

DROP TRIGGER IF EXISTS trg_guard_pedido_mutation ON public.pedidos;
CREATE TRIGGER trg_guard_pedido_mutation
BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.guard_pedido_mutation();

DROP TRIGGER IF EXISTS trg_validate_pedido_transition ON public.pedidos;
CREATE TRIGGER trg_validate_pedido_transition
BEFORE UPDATE OF estado ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.trg_check_pedido_transition();

DROP TRIGGER IF EXISTS trg_050_limit_pedidos ON public.pedidos;
CREATE TRIGGER trg_050_limit_pedidos
BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.guard_optional_order_insert();

DROP TRIGGER IF EXISTS trg_050_limit_avisos ON public.avisos;
CREATE TRIGGER trg_050_limit_avisos
BEFORE INSERT ON public.avisos
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();

DROP TRIGGER IF EXISTS trg_050_limit_comentarios ON public.comentarios_avisos;
CREATE TRIGGER trg_050_limit_comentarios
BEFORE INSERT ON public.comentarios_avisos
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();

-- ==============================================================================
-- 7. ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_ciudad_estado ON public.pedidos (ciudad, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_created_at ON public.pedidos (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_id ON public.pedidos (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_driver_id ON public.pedidos (driver_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_estado ON public.pedidos (user_id, estado);
CREATE INDEX IF NOT EXISTS idx_rutas_ciudad ON public.rutas_repartidores (ciudad, last_active DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_ciudad ON public.avisos (ciudad, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avisos_user_id ON public.avisos (user_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_aviso_id ON public.comentarios_avisos (aviso_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_choferes_ciudad ON public.choferes_habilitados (ciudad, categoria);
CREATE INDEX IF NOT EXISTS idx_choferes_habilitados_user_id ON public.choferes_habilitados (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_user_id ON public.usuarios_baneados (user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_email ON public.usuarios_baneados (email);
CREATE INDEX IF NOT EXISTS idx_votos_registro_user ON public.votos_registro (user_id, entidad_id);

-- ==============================================================================
-- 8. POLÍTICAS DE SEGURIDAD A NIVEL DE FILA (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes_habilitados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_repartidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anuncios_globales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion_publicidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_baneados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_spam ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votos_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR is_admin_email());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()) OR is_admin_email())
WITH CHECK (id = (SELECT auth.uid()) OR is_admin_email());

-- Choferes Habilitados
DROP POLICY IF EXISTS "choferes_select_own_or_admin" ON public.choferes_habilitados;
CREATE POLICY "choferes_select_own_or_admin" ON public.choferes_habilitados FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email());

DROP POLICY IF EXISTS "choferes_insert_own" ON public.choferes_habilitados;
CREATE POLICY "choferes_insert_own" ON public.choferes_habilitados FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid())::text AND NOT is_banned());

DROP POLICY IF EXISTS "choferes_update_own_or_admin" ON public.choferes_habilitados;
CREATE POLICY "choferes_update_own_or_admin" ON public.choferes_habilitados FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email())
WITH CHECK (user_id = (SELECT auth.uid())::text OR is_admin_email());

DROP POLICY IF EXISTS "choferes_delete_own_or_admin" ON public.choferes_habilitados;
CREATE POLICY "choferes_delete_own_or_admin" ON public.choferes_habilitados FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email());

-- Pedidos (Blindaje Estricto de Acceso por Ciudad y Categoría)
DROP POLICY IF EXISTS "pedidos_select_strict" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select_own_or_driver_or_admin" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;

CREATE POLICY "pedidos_select_strict" ON public.pedidos FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR is_admin_email()
  OR (
    estado IN ('pendiente', 'visto')
    AND driver_id IS NULL
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
);

DROP POLICY IF EXISTS "pedidos_insert_own" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
CREATE POLICY "pedidos_insert_own" ON public.pedidos FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid())::text AND NOT is_banned());

DROP POLICY IF EXISTS "pedidos_update_strict" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_update_own_or_driver_or_admin" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_update_own" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Actualizar admin" ON public.pedidos;

CREATE POLICY "pedidos_update_strict" ON public.pedidos FOR UPDATE TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR is_admin_email()
  OR (
    estado IN ('pendiente', 'visto')
    AND driver_id IS NULL
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
)
WITH CHECK (
  user_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR is_admin_email()
  OR (
    estado = 'asignado'
    AND driver_id = (SELECT auth.uid())::text
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
  OR (
    estado IN ('pendiente', 'visto')
    AND public.is_current_enabled_driver(ciudad, categoria)
  )
);

DROP POLICY IF EXISTS "pedidos_delete_own_or_admin" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Borrar admin" ON public.pedidos;
CREATE POLICY "pedidos_delete_own_or_admin" ON public.pedidos FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email());

-- Rutas Repartidores
DROP POLICY IF EXISTS "rutas_select_public" ON public.rutas_repartidores;
CREATE POLICY "rutas_select_public" ON public.rutas_repartidores FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "rutas_insert_own" ON public.rutas_repartidores;
CREATE POLICY "rutas_insert_own" ON public.rutas_repartidores FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid())::text AND NOT is_banned());

DROP POLICY IF EXISTS "rutas_update_own_or_admin" ON public.rutas_repartidores;
CREATE POLICY "rutas_update_own_or_admin" ON public.rutas_repartidores FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email())
WITH CHECK (user_id = (SELECT auth.uid())::text OR is_admin_email());

DROP POLICY IF EXISTS "rutas_delete_own_or_admin" ON public.rutas_repartidores;
CREATE POLICY "rutas_delete_own_or_admin" ON public.rutas_repartidores FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email());

-- Avisos Comunitarios
DROP POLICY IF EXISTS "avisos_select_public" ON public.avisos;
CREATE POLICY "avisos_select_public" ON public.avisos FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "avisos_insert_own" ON public.avisos;
CREATE POLICY "avisos_insert_own" ON public.avisos FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid())::text AND NOT is_banned());

DROP POLICY IF EXISTS "avisos_update_own_or_admin" ON public.avisos;
CREATE POLICY "avisos_update_own_or_admin" ON public.avisos FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email())
WITH CHECK (user_id = (SELECT auth.uid())::text OR is_admin_email());

DROP POLICY IF EXISTS "avisos_delete_own_or_admin" ON public.avisos;
CREATE POLICY "avisos_delete_own_or_admin" ON public.avisos FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email());

-- Comentarios Avisos
DROP POLICY IF EXISTS "comentarios_select_public" ON public.comentarios_avisos;
CREATE POLICY "comentarios_select_public" ON public.comentarios_avisos FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "comentarios_insert_own" ON public.comentarios_avisos;
CREATE POLICY "comentarios_insert_own" ON public.comentarios_avisos FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid())::text AND NOT is_banned());

DROP POLICY IF EXISTS "comentarios_update_own_or_admin" ON public.comentarios_avisos;
CREATE POLICY "comentarios_update_own_or_admin" ON public.comentarios_avisos FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email())
WITH CHECK (user_id = (SELECT auth.uid())::text OR is_admin_email());

DROP POLICY IF EXISTS "comentarios_delete_own_or_admin" ON public.comentarios_avisos;
CREATE POLICY "comentarios_delete_own_or_admin" ON public.comentarios_avisos FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid())::text OR is_admin_email());

-- Anuncios Globales y Configuración
DROP POLICY IF EXISTS "Anuncios Public SELECT" ON public.anuncios_globales;
CREATE POLICY "Anuncios Public SELECT" ON public.anuncios_globales FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Anuncios Admin ALL" ON public.anuncios_globales;
CREATE POLICY "Anuncios Admin ALL" ON public.anuncios_globales FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "config_publicidad_select_public" ON public.configuracion_publicidad;
CREATE POLICY "config_publicidad_select_public" ON public.configuracion_publicidad FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "config_publicidad_admin_all" ON public.configuracion_publicidad;
CREATE POLICY "config_publicidad_admin_all" ON public.configuracion_publicidad FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

-- Tablas Administrativas y Moderación
DROP POLICY IF EXISTS "usuarios_roles_select_public" ON public.usuarios_roles;
CREATE POLICY "usuarios_roles_select_public" ON public.usuarios_roles FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "usuarios_roles_admin_all" ON public.usuarios_roles;
CREATE POLICY "usuarios_roles_admin_all" ON public.usuarios_roles FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "admin_credentials_admin_all" ON public.admin_credentials;
CREATE POLICY "admin_credentials_admin_all" ON public.admin_credentials FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "usuarios_baneados_admin_all" ON public.usuarios_baneados;
CREATE POLICY "usuarios_baneados_admin_all" ON public.usuarios_baneados FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "denuncias_insert_auth" ON public.denuncias;
CREATE POLICY "denuncias_insert_auth" ON public.denuncias FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "denuncias_admin_all" ON public.denuncias;
CREATE POLICY "denuncias_admin_all" ON public.denuncias FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "reportes_spam_insert_auth" ON public.reportes_spam;
CREATE POLICY "reportes_spam_insert_auth" ON public.reportes_spam FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "reportes_spam_admin_all" ON public.reportes_spam;
CREATE POLICY "reportes_spam_admin_all" ON public.reportes_spam FOR ALL TO authenticated
USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "votos_registro_user_all" ON public.votos_registro;
CREATE POLICY "votos_registro_user_all" ON public.votos_registro FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())::text) WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "rate_limits_system_policy" ON public.security_rate_limits;
CREATE POLICY "rate_limits_system_policy" ON public.security_rate_limits FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pedidos_archivo_admin_all" ON public.pedidos_archivo;
CREATE POLICY "pedidos_archivo_admin_all" ON public.pedidos_archivo FOR ALL TO authenticated, service_role
USING (is_admin_email()) WITH CHECK (is_admin_email());

-- ==============================================================================
-- 9. PERMISOS Y PRIVILEGIOS GLOBALES (GRANTS)
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.avisos, public.comentarios_avisos, public.anuncios_globales,
  public.configuracion_publicidad, public.rutas_repartidores, public.usuarios_roles TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.choferes_habilitados,
  public.pedidos, public.pedidos_archivo, public.rutas_repartidores, public.avisos, public.comentarios_avisos,
  public.votos_registro, public.denuncias, public.reportes_spam, public.anuncios_globales TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email_for(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_banned() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_order_location(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_mark_order_seen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_order_received(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_own_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_bootstrap_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_aviso(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_comentario(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_driver_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_renew_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_actualizar_aviso_propio(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_agregar_comentario_aviso(uuid, text, text) TO authenticated;

-- Storage de anuncios: lectura pública, escrituras solo para administradores.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anuncios-media',
  'anuncios-media',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "storage_anuncios_read" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "Insercion anuncios-media para admin" ON storage.objects;
DROP POLICY IF EXISTS "Eliminacion anuncios-media para admin" ON storage.objects;
DROP POLICY IF EXISTS "Lectura publica anuncios-media" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_upload" ON storage.objects;
DROP POLICY IF EXISTS "storage_anuncios_delete" ON storage.objects;

CREATE POLICY "storage_anuncios_read" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'anuncios-media');
CREATE POLICY "storage_anuncios_admin_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'anuncios-media' AND public.is_admin_email());
CREATE POLICY "storage_anuncios_admin_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'anuncios-media' AND public.is_admin_email())
WITH CHECK (bucket_id = 'anuncios-media' AND public.is_admin_email());
CREATE POLICY "storage_anuncios_admin_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'anuncios-media' AND public.is_admin_email());

-- ==============================================================================
-- FIN DEL ESQUEMA CONSOLIDADO OFICIAL DE PRODUCCIÓN (NOTIGAS v092)
-- ==============================================================================
