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

-- M. Contadores privados para protección anti-bot por cuenta
CREATE TABLE IF NOT EXISTS public.security_rate_limits (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
    window_started_at timestamptz NOT NULL DEFAULT now(),
    hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, action)
);

-- ==============================================================================
-- 3. VISTAS PÚBLICAS AUTORIZADAS
-- ============================================================================CREATE OR REPLACE VIEW public.choferes_publicos
WITH (security_barrier = true, security_invoker = false)
AS
SELECT 
    ch.id,
    ch.user_id,
    ch.nombre_completo,
    ch.categoria,
    ch.ciudad,
    ch.zonas,
    ch.schedule,
    ch.placa,
    ch.productos,
    ch.telefono_whatsapp AS telefono,
    NULL::text AS descripcion,
    NULL::text AS foto_url,
    ch.estado_verificacion,
    ch.created_at
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
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
    p.id,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text)) THEN p.user_id 
        ELSE NULL::text 
    END AS user_id,
    p.categoria,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.titulo 
        ELSE 'Pedido Vecinal'::text 
    END AS titulo,
    p.cantidad,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.direccion 
        ELSE NULL::text 
    END AS direccion,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.telefono 
        ELSE NULL::text 
    END AS telefono,
    p.estado,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR p.driver_id = (SELECT auth.uid()::text)) THEN p.driver_id 
        ELSE NULL::text 
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa'::text) AS barrio_otb,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.latitude 
        ELSE (round(p.latitude::numeric, 3))::double precision 
    END AS latitude,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.longitude 
        ELSE (round(p.longitude::numeric, 3))::double precision 
    END AS longitude,
    CASE 
        WHEN (p.user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(p.ciudad, NULL::text)) THEN p.descripcion 
        ELSE NULL::text 
    END AS descripcion,
    COALESCE(p.visto, false) AS visto,
    p.created_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto');

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

CREATE OR REPLACE VIEW public.rutas_repartidores_publicas
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
    r.id,
    CASE 
        WHEN (r.user_id = (SELECT auth.uid()::text)) THEN r.user_id 
        ELSE NULL::text 
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS'::text) AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP'::text) AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución'::text) AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    COALESCE(ch.placa, '') AS placa,
    COALESCE(ch.productos, '') AS productos
FROM public.rutas_repartidores r
LEFT JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
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
        AND (
          p_ciudad IS NULL
          OR LOWER(TRIM(ch.ciudad)) = LOWER(TRIM(p_ciudad))
          OR (LOWER(TRIM(ch.ciudad)) IN ('cochabamba', 'cbba', 'cercado') AND LOWER(TRIM(p_ciudad)) IN ('cochabamba', 'cbba', 'sacaba', 'quillacollo', 'tiquipaya', 'colcapirhua', 'vinto', 'sipesipe'))
          OR (LOWER(TRIM(ch.ciudad)) IN ('santacruz', 'santa cruz') AND LOWER(TRIM(p_ciudad)) IN ('santacruz', 'santa cruz', 'warnes', 'cotoca', 'montero', 'la guardia', 'laguardia', 'porongo'))
          OR (LOWER(TRIM(ch.ciudad)) IN ('lapaz', 'la paz') AND LOWER(TRIM(p_ciudad)) IN ('lapaz', 'la paz', 'el alto', 'elalto', 'viacha', 'achocalla'))
        )
        AND (
          p_categoria IS NULL
          OR public.normalize_delivery_category(ch.categoria) = public.normalize_delivery_category(p_categoria)
          OR public.normalize_delivery_category(ch.categoria) = 'otros'
          OR public.normalize_delivery_category(p_categoria) = 'otros'
          OR LOWER(TRIM(COALESCE(ch.categoria, ''))) IN ('todos', 'all', '')
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

-- Protección anti-bot e integridad de campos controlados por el servidor
CREATE OR REPLACE FUNCTION public.enforce_action_rate_limit(
  p_action text, p_max_hits integer, p_window_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hits integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para realizar esta acción'; END IF;
  IF p_action IS NULL OR length(p_action) NOT BETWEEN 1 AND 80
     OR p_max_hits NOT BETWEEN 1 AND 1000 OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'Configuración de límite inválida';
  END IF;

  INSERT INTO public.security_rate_limits AS limits
    (user_id, action, window_started_at, hits, updated_at)
  VALUES (v_uid, p_action, now(), 1, now())
  ON CONFLICT (user_id, action) DO UPDATE
  SET hits = CASE
        WHEN now() - limits.window_started_at >= make_interval(secs => p_window_seconds) THEN 1
        ELSE limits.hits + 1
      END,
      window_started_at = CASE
        WHEN now() - limits.window_started_at >= make_interval(secs => p_window_seconds) THEN now()
        ELSE limits.window_started_at
      END,
      updated_at = now()
  RETURNING hits INTO v_hits;

  IF v_hits > p_max_hits THEN
    RAISE EXCEPTION 'Demasiadas acciones seguidas. Espera un momento antes de reintentar.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_field_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.nombre := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre, ''), '<[^>]*>', '', 'g'), 120);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  IF NEW.latitude IS NOT NULL AND NEW.latitude NOT BETWEEN -90 AND 90 THEN RAISE EXCEPTION 'Latitud inválida'; END IF;
  IF NEW.longitude IS NOT NULL AND NEW.longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Longitud inválida'; END IF;
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND auth.uid() IS NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id) THEN
    NEW.user_id := NEW.id::text;
    NEW.role := 'vecino';
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Perfil no autorizado'; END IF;
  IF NEW.role NOT IN ('vecino', 'repartidor') THEN RAISE EXCEPTION 'No puedes asignarte privilegios de administrador'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'No se puede cambiar el propietario'; END IF;
  NEW.user_id := auth.uid()::text;
  PERFORM public.enforce_action_rate_limit('profile_write', 30, 3600);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_limited_content_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.is_banned() THEN RAISE EXCEPTION 'Cuenta no autorizada para publicar'; END IF;

  IF TG_TABLE_NAME = 'pedidos' THEN
    NEW.user_id := v_uid;
    NEW.estado := 'pendiente';
    NEW.driver_id := NULL;
    NEW.visto := false;
    NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 120);
    NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
    NEW.cantidad := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
    NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
    NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
    NEW.categoria := LEFT(LOWER(TRIM(COALESCE(NEW.categoria, 'gas'))), 60);
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    IF NEW.titulo = '' OR NEW.direccion = '' OR length(NEW.telefono) < 6
       OR NEW.latitude NOT BETWEEN -90 AND 90 OR NEW.longitude NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'Datos del pedido inválidos o incompletos';
    END IF;
    PERFORM public.enforce_action_rate_limit('create_order', 8, 300);
  ELSIF TG_TABLE_NAME = 'avisos' THEN
    NEW.user_id := v_uid;
    NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 180);
    NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
    NEW.mensaje := LEFT(REGEXP_REPLACE(COALESCE(NEW.mensaje, ''), '<[^>]*>', '', 'g'), 2000);
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    IF LOWER(TRIM(COALESCE(NEW.tipo, 'aviso'))) IN ('oficial', 'alerta_oficial') THEN
      RAISE EXCEPTION 'Solo un administrador puede publicar avisos oficiales';
    END IF;
    PERFORM public.enforce_action_rate_limit('create_notice', 5, 600);
  ELSIF TG_TABLE_NAME = 'comentarios_avisos' THEN
    NEW.user_id := v_uid;
    NEW.autor := LEFT(REGEXP_REPLACE(COALESCE(NEW.autor, 'Vecino'), '<[^>]*>', '', 'g'), 120);
    NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 2000);
    IF length(TRIM(NEW.texto)) < 1 THEN RAISE EXCEPTION 'El comentario está vacío'; END IF;
    PERFORM public.enforce_action_rate_limit('create_comment', 20, 300);
  ELSIF TG_TABLE_NAME = 'votos_registro' THEN
    NEW.user_id := v_uid;
    PERFORM public.enforce_action_rate_limit('cast_vote', 40, 300);
  ELSIF TG_TABLE_NAME = 'denuncias' THEN
    NEW.denunciante_id := v_uid;
    NEW.user_id := v_uid;
    NEW.motivo := LEFT(REGEXP_REPLACE(COALESCE(NEW.motivo, ''), '<[^>]*>', '', 'g'), 240);
    NEW.detalles := LEFT(REGEXP_REPLACE(COALESCE(NEW.detalles, ''), '<[^>]*>', '', 'g'), 2000);
    PERFORM public.enforce_action_rate_limit('create_report', 8, 3600);
  ELSIF TG_TABLE_NAME = 'reportes_spam' THEN
    NEW.user_id := v_uid;
    NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 1000);
    NEW.motivo := LEFT(REGEXP_REPLACE(COALESCE(NEW.motivo, ''), '<[^>]*>', '', 'g'), 240);
    PERFORM public.enforce_action_rate_limit('create_spam_report', 10, 3600);
  ELSIF TG_TABLE_NAME = 'choferes_habilitados' THEN
    NEW.user_id := v_uid;
    NEW.nombre_completo := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre_completo, ''), '<[^>]*>', '', 'g'), 120);
    NEW.telefono_whatsapp := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono_whatsapp, ''), '[^0-9+ ()-]', '', 'g'), 24);
    NEW.placa := LEFT(UPPER(REGEXP_REPLACE(COALESCE(NEW.placa, ''), '[^A-Za-z0-9-]', '', 'g')), 16);
    NEW.productos := LEFT(REGEXP_REPLACE(COALESCE(NEW.productos, ''), '<[^>]*>', '', 'g'), 500);
    NEW.zonas := LEFT(REGEXP_REPLACE(COALESCE(NEW.zonas, ''), '<[^>]*>', '', 'g'), 500);
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    IF length(NEW.nombre_completo) < 2 OR length(NEW.telefono_whatsapp) < 6 OR length(NEW.placa) < 3 THEN
      RAISE EXCEPTION 'Ficha de repartidor inválida o incompleta';
    END IF;
    PERFORM public.enforce_action_rate_limit('driver_registration', 3, 3600);
  ELSIF TG_TABLE_NAME = 'rutas_repartidores' THEN
    NEW.user_id := v_uid;
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
    IF NEW.latitude NOT BETWEEN -90 AND 90 OR NEW.longitude NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'Ubicación de recorrido inválida';
    END IF;
    PERFORM public.enforce_action_rate_limit('start_driver_route', 30, 3600);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_050_profile_integrity ON public.profiles;
CREATE TRIGGER trg_050_profile_integrity BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_field_integrity();
DROP TRIGGER IF EXISTS trg_050_limit_pedidos ON public.pedidos;
CREATE TRIGGER trg_050_limit_pedidos BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_avisos ON public.avisos;
CREATE TRIGGER trg_050_limit_avisos BEFORE INSERT ON public.avisos
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_comentarios ON public.comentarios_avisos;
CREATE TRIGGER trg_050_limit_comentarios BEFORE INSERT ON public.comentarios_avisos
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_votos ON public.votos_registro;
CREATE TRIGGER trg_050_limit_votos BEFORE INSERT ON public.votos_registro
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_denuncias ON public.denuncias;
CREATE TRIGGER trg_050_limit_denuncias BEFORE INSERT ON public.denuncias
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_reportes_spam ON public.reportes_spam;
CREATE TRIGGER trg_050_limit_reportes_spam BEFORE INSERT ON public.reportes_spam
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_driver_registration ON public.choferes_habilitados;
CREATE TRIGGER trg_050_limit_driver_registration BEFORE INSERT ON public.choferes_habilitados
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();
DROP TRIGGER IF EXISTS trg_050_limit_driver_route ON public.rutas_repartidores;
CREATE TRIGGER trg_050_limit_driver_route BEFORE INSERT ON public.rutas_repartidores
FOR EACH ROW EXECUTE FUNCTION public.guard_limited_content_insert();

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

-- 1.1 Comprador confirma recepción de su pedido (V104)
CREATE OR REPLACE FUNCTION public.rpc_confirm_order_received(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id text;
    v_order record;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.user_id <> v_user_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: no eres el propietario de este pedido';
    END IF;

    IF v_order.estado IN ('entregado', 'cancelado') THEN
        RAISE EXCEPTION 'El pedido ya fue finalizado previamente';
    END IF;

    IF v_order.estado NOT IN ('asignado', 'pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido no se encuentra en un estado válido para confirmar';
    END IF;

    UPDATE public.pedidos
    SET
        estado = 'entregado',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'entregado',
        'confirmed_by', 'buyer'
    );
END;
$$;

-- 1.2 Repartidor confirma entrega del pedido (V104)
CREATE OR REPLACE FUNCTION public.rpc_driver_confirm_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_driver_id text;
    v_order record;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.driver_id <> v_driver_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: este pedido no está asignado a tu cuenta';
    END IF;

    IF v_order.estado <> 'asignado' AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'El pedido no se encuentra en estado asignado';
    END IF;

    UPDATE public.pedidos
    SET
        estado = 'entregado',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'entregado',
        'confirmed_by', 'driver'
    );
END;
$$;

-- 1.3 Comprador cancela su pedido (V104)
CREATE OR REPLACE FUNCTION public.rpc_cancel_own_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id text;
    v_order record;
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.user_id <> v_user_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: no eres el propietario de este pedido';
    END IF;

    IF v_order.estado IN ('entregado', 'cancelado') THEN
        RAISE EXCEPTION 'El pedido ya fue finalizado y no puede ser cancelado';
    END IF;

    UPDATE public.pedidos
    SET
        estado = 'cancelado',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'cancelado'
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
    SET visto = true,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
      AND estado = 'pendiente';
END;
$$;

-- 3. Bootstrap consolidado de usuario (1 sola consulta en login)
CREATE OR REPLACE FUNCTION public.rpc_get_user_bootstrap_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_id_text text;
  v_is_admin boolean := false;
  v_profile jsonb := null;
  v_driver jsonb := null;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'is_admin', false,
      'profile', null,
      'driver', null
    );
  END IF;

  v_user_id_text := v_user_id::text;
  v_is_admin := public.is_admin_email();

  -- Obtener perfil
  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id;

  -- Obtener datos de chofer si existen y no está baneado
  SELECT to_jsonb(ch) INTO v_driver
  FROM public.choferes_habilitados ch
  WHERE ch.user_id = v_user_id_text
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE ub.user_id = v_user_id_text
    );

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', v_user_id_text,
    'is_admin', v_is_admin,
    'profile', v_profile,
    'driver', v_driver
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_user_bootstrap_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_bootstrap_data() TO authenticated;

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

    -- Avisos gratis duran 48 horas
    DELETE FROM public.avisos
    WHERE created_at < now() - interval '48 hours';
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

    -- Avisos gratis duran 48 horas
    DELETE FROM public.avisos
    WHERE created_at < now() - interval '48 hours';
    GET DIAGNOSTICS v_avisos_borrados = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'pedidos_purgados', v_pedidos_borrados,
        'rutas_purgadas', v_rutas_borradas,
        'avisos_purgados', v_avisos_borrados,
        'duracion_avisos_horas', 48,
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
  v_uuid uuid := auth.uid();
  v_uid text;
  v_email text;
BEGIN
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_uid := v_uuid::text;
  SELECT LOWER(TRIM(COALESCE(email, ''))) INTO v_email
  FROM auth.users
  WHERE id = v_uuid;

  DELETE FROM public.votos_registro
  WHERE user_id = v_uid
     OR (tipo_entidad = 'aviso' AND entidad_id IN (
          SELECT id FROM public.avisos WHERE user_id = v_uid
        ))
     OR (tipo_entidad = 'comentario' AND entidad_id IN (
          SELECT c.id
          FROM public.comentarios_avisos c
          WHERE c.user_id = v_uid
             OR c.aviso_id IN (SELECT a.id FROM public.avisos a WHERE a.user_id = v_uid)
        ))
     OR (tipo_entidad = 'pedido' AND entidad_id IN (
          SELECT id FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid
        ));
  DELETE FROM public.comentarios_avisos
  WHERE user_id = v_uid
     OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id = v_uid);
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
  DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados
  WHERE user_id = v_uid
     OR (v_email <> '' AND LOWER(TRIM(COALESCE(email, ''))) = v_email);
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

    DELETE FROM public.votos_registro
    WHERE user_id = v_uid
       OR (tipo_entidad = 'aviso' AND entidad_id IN (
            SELECT id FROM public.avisos WHERE user_id = v_uid
          ))
       OR (tipo_entidad = 'comentario' AND entidad_id IN (
            SELECT c.id
            FROM public.comentarios_avisos c
            WHERE c.user_id = v_uid
               OR c.aviso_id IN (SELECT a.id FROM public.avisos a WHERE a.user_id = v_uid)
          ))
       OR (tipo_entidad = 'pedido' AND entidad_id IN (
            SELECT id FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid
          ));
    DELETE FROM public.comentarios_avisos
    WHERE user_id = v_uid
       OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id = v_uid);
    DELETE FROM public.avisos WHERE user_id = v_uid;
    DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
    DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
    DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
    DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
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
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

-- B. Políticas: profiles
DROP POLICY IF EXISTS "Profiles Public SELECT" ON public.profiles;
DROP POLICY IF EXISTS "Profiles User SELECT" ON public.profiles;
CREATE POLICY "Profiles User SELECT" ON public.profiles FOR SELECT USING (auth.uid() = id OR is_admin_email());

DROP POLICY IF EXISTS "Profiles User ALL" ON public.profiles;
CREATE POLICY "Profiles User ALL" ON public.profiles FOR ALL
USING (auth.uid() = id OR is_admin_email())
WITH CHECK (
    is_admin_email()
    OR (auth.uid() = id AND role IN ('vecino', 'repartidor'))
);

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
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Dueño Driver Admin SELECT" ON public.pedidos;
CREATE POLICY "pedidos_select" ON public.pedidos FOR SELECT USING (
    (auth.uid())::text = user_id 
    OR (auth.uid())::text = driver_id 
    OR is_admin_email()
    OR (estado IN ('pendiente', 'visto') AND public.is_current_enabled_driver(ciudad, NULL::text))
);

DROP POLICY IF EXISTS "Pedidos Insertar propio" ON public.pedidos;
CREATE POLICY "Pedidos Insertar propio" ON public.pedidos FOR INSERT WITH CHECK (
    (auth.uid())::text = user_id 
    AND NOT is_banned()
);

DROP POLICY IF EXISTS "Pedidos Actualizar propio o asignado" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Actualizar admin" ON public.pedidos;
CREATE POLICY "Pedidos Actualizar admin" ON public.pedidos FOR UPDATE TO authenticated USING (
    is_admin_email()
)
WITH CHECK (
    is_admin_email()
);

DROP POLICY IF EXISTS "Pedidos Borrar propio o admin" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Borrar admin" ON public.pedidos;
CREATE POLICY "Pedidos Borrar admin" ON public.pedidos FOR DELETE TO authenticated USING (
    is_admin_email()
);

-- E. Políticas: rutas_repartidores
DROP POLICY IF EXISTS "Rutas Public SELECT" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Rutas Own Admin SELECT" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "rutas_select_public" ON public.rutas_repartidores;
CREATE POLICY "rutas_select_public" ON public.rutas_repartidores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Rutas Driver Insertar" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "rutas_insert_own" ON public.rutas_repartidores;
CREATE POLICY "rutas_insert_own" ON public.rutas_repartidores FOR INSERT WITH CHECK (((SELECT auth.uid())::text = user_id) AND NOT is_banned());

DROP POLICY IF EXISTS "Rutas Driver Actualizar" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "rutas_update_own_or_admin" ON public.rutas_repartidores;
CREATE POLICY "rutas_update_own_or_admin" ON public.rutas_repartidores FOR UPDATE USING (((SELECT auth.uid())::text = user_id) OR is_admin_email()) WITH CHECK (((SELECT auth.uid())::text = user_id) OR is_admin_email());

DROP POLICY IF EXISTS "Rutas Driver Borrar" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "rutas_delete_own_or_admin" ON public.rutas_repartidores;
CREATE POLICY "rutas_delete_own_or_admin" ON public.rutas_repartidores FOR DELETE USING (((SELECT auth.uid())::text = user_id) OR is_admin_email());

-- F. Políticas: avisos y comentarios
DROP POLICY IF EXISTS "Avisos Public SELECT" ON public.avisos;
CREATE POLICY "Avisos Public SELECT" ON public.avisos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Avisos User Insert" ON public.avisos;
CREATE POLICY "Avisos User Insert" ON public.avisos FOR INSERT WITH CHECK (
    ((SELECT auth.uid())::text = user_id)
    AND NOT is_banned()
    AND (LOWER(TRIM(COALESCE(tipo, ''))) NOT IN ('oficial', 'alerta_oficial') OR is_admin_email())
);

DROP POLICY IF EXISTS "Avisos User Update" ON public.avisos;
CREATE POLICY "Avisos User Update" ON public.avisos FOR UPDATE
USING (((SELECT auth.uid())::text = user_id) OR is_admin_email())
WITH CHECK (
    (((SELECT auth.uid())::text = user_id) OR is_admin_email())
    AND (LOWER(TRIM(COALESCE(tipo, ''))) NOT IN ('oficial', 'alerta_oficial') OR is_admin_email())
);

DROP POLICY IF EXISTS "Avisos User Delete" ON public.avisos;
CREATE POLICY "Avisos User Delete" ON public.avisos FOR DELETE USING (((SELECT auth.uid())::text = user_id) OR is_admin_email());

DROP POLICY IF EXISTS "Comentarios Public SELECT" ON public.comentarios_avisos;
CREATE POLICY "Comentarios Public SELECT" ON public.comentarios_avisos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Comentarios User Insert" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Insert" ON public.comentarios_avisos FOR INSERT WITH CHECK (((SELECT auth.uid())::text = user_id) AND NOT is_banned());

DROP POLICY IF EXISTS "Comentarios User Update" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Update" ON public.comentarios_avisos FOR UPDATE USING (((SELECT auth.uid())::text = user_id) OR is_admin_email());

DROP POLICY IF EXISTS "Comentarios User Delete" ON public.comentarios_avisos;
CREATE POLICY "Comentarios User Delete" ON public.comentarios_avisos FOR DELETE USING (((SELECT auth.uid())::text = user_id) OR is_admin_email());

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
DROP POLICY IF EXISTS "admin_credentials_select_own" ON public.admin_credentials;
CREATE POLICY "admin_credentials_select_own" ON public.admin_credentials FOR SELECT USING (LOWER(TRIM(email)) = LOWER(TRIM(COALESCE((SELECT auth.jwt() ->> 'email'), ''))));

-- I. Políticas: votos_registro
DROP POLICY IF EXISTS "Auth SELECT votos_registro" ON public.votos_registro;
CREATE POLICY "Auth SELECT votos_registro" ON public.votos_registro FOR SELECT USING (((SELECT auth.uid())::text = user_id) OR is_admin_email());

DROP POLICY IF EXISTS "Auth INSERT votos_registro" ON public.votos_registro;
CREATE POLICY "Auth INSERT votos_registro" ON public.votos_registro FOR INSERT WITH CHECK ((SELECT auth.uid())::text = user_id);

DROP POLICY IF EXISTS "Auth DELETE votos_registro" ON public.votos_registro;
CREATE POLICY "Auth DELETE votos_registro" ON public.votos_registro FOR DELETE USING ((SELECT auth.uid())::text = user_id);

-- J. Políticas: denuncias y reportes_spam
DROP POLICY IF EXISTS "Denuncias Insertar auth" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_insert_auth" ON public.denuncias;
CREATE POLICY "denuncias_insert_auth" ON public.denuncias FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Denuncias Admin ALL" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_admin_mod" ON public.denuncias;
CREATE POLICY "denuncias_admin_mod" ON public.denuncias FOR ALL TO authenticated USING (is_admin_email()) WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "Reportes Insertar auth" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_insert_auth" ON public.reportes_spam;
CREATE POLICY "reportes_spam_insert_auth" ON public.reportes_spam FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Reportes Admin ALL" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_admin_mod" ON public.reportes_spam;
CREATE POLICY "reportes_spam_admin_mod" ON public.reportes_spam FOR ALL TO authenticated USING (is_admin_email()) WITH CHECK (is_admin_email());

-- K. Politicas: configuracion_publicidad
DROP POLICY IF EXISTS "Publicidad Public SELECT" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_select_public" ON public.configuracion_publicidad;
CREATE POLICY "config_publicidad_select_public" ON public.configuracion_publicidad FOR SELECT USING (true);

DROP POLICY IF EXISTS "Publicidad Admin ALL" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_admin_mod" ON public.configuracion_publicidad;
CREATE POLICY "config_publicidad_admin_mod" ON public.configuracion_publicidad FOR ALL TO authenticated
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
GRANT EXECUTE ON FUNCTION public.normalize_delivery_category(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_banned() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_pedido_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_driver_verification() FROM PUBLIC, anon, authenticated;

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.choferes_habilitados FROM anon;
REVOKE SELECT ON public.pedidos FROM anon;
REVOKE SELECT ON public.rutas_repartidores FROM anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.choferes_habilitados TO authenticated;
GRANT SELECT, INSERT ON public.pedidos TO authenticated;
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

REVOKE ALL ON FUNCTION public.rpc_get_my_assigned_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_purge_old_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated;

REVOKE ALL ON FUNCTION public.incrementar_votos_aviso(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_aviso(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.incrementar_votos_comentario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_comentario(uuid, integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated;

-- ==============================================================================
-- 8.1 REVISION SEGURA DEL PEDIDO POR EL REPARTIDOR (MIGRACION 054)
-- Direccion y telefono son opcionales cuando existe una posicion GPS valida.

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.is_banned() THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  NEW.user_id := v_uid;
  NEW.estado := 'pendiente';
  NEW.driver_id := NULL;
  NEW.visto := false;
  NEW.categoria := LEFT(LOWER(TRIM(COALESCE(NEW.categoria, 'gas'))), 60);

  -- Auto-asignar título por defecto si viene vacío o nulo
  IF NEW.titulo IS NULL OR TRIM(NEW.titulo) = '' THEN
    NEW.titulo := 'Pedido de ' || INITCAP(COALESCE(NEW.categoria, 'Gas'));
  ELSE
    NEW.titulo := LEFT(REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g'), 120);
  END IF;

  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.cantidad := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);

  IF NEW.titulo = ''
     OR (NEW.telefono <> '' AND length(NEW.telefono) < 6)
     OR NEW.latitude NOT BETWEEN -90 AND 90
     OR NEW.longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Datos del pedido invalidos o incompletos';
  END IF;

  PERFORM public.enforce_action_rate_limit('create_order', 8, 300);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_050_limit_pedidos ON public.pedidos;
CREATE TRIGGER trg_050_limit_pedidos BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.guard_optional_order_insert();

CREATE OR REPLACE FUNCTION public.rpc_get_driver_available_orders(
  p_ciudad text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS TABLE (
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
  estado text,
  visto boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_driver_id text := auth.uid()::text;
  v_norm_city text := NULLIF(LOWER(TRIM(COALESCE(p_ciudad, ''))), '');
  v_norm_cat text := NULLIF(LOWER(TRIM(COALESCE(p_categoria, ''))), '');
BEGIN
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id = v_driver_id
      AND NOT EXISTS (
        SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = v_driver_id
      )
  ) THEN
    RAISE EXCEPTION 'Repartidor no habilitado o cuenta suspendida';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    COALESCE(NULLIF(TRIM(p.titulo), ''), split_part(u.email::text, '@', 1)),
    p.titulo,
    p.categoria,
    COALESCE(NULLIF(TRIM(p.cantidad), ''), '1 unidad'),
    COALESCE(NULLIF(TRIM(p.direccion), ''), 'Ubicacion fijada en mapa GPS (opcional)'),
    NULLIF(TRIM(p.telefono), ''),
    COALESCE(NULLIF(TRIM(p.barrio_otb), ''), 'Zona indicada en el mapa'),
    p.latitude,
    p.longitude,
    p.created_at,
    p.estado,
    COALESCE(p.visto, false)
  FROM public.pedidos p
  JOIN auth.users u ON u.id::text = p.user_id
  WHERE p.estado IN ('pendiente', 'visto')
    AND (v_norm_city IS NULL OR LOWER(TRIM(p.ciudad)) = v_norm_city)
    AND (
      v_norm_cat IS NULL
      OR LOWER(TRIM(p.categoria)) = v_norm_cat
      OR (v_norm_cat IN ('gas', 'gas glp') AND LOWER(TRIM(p.categoria)) IN ('gas', 'gas glp', 'garrafa'))
      OR (v_norm_cat IN ('agua', 'agua potable') AND LOWER(TRIM(p.categoria)) IN ('agua', 'agua potable', 'botellon'))
    )
  ORDER BY p.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_driver_available_orders(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO authenticated;

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

-- ==============================================================================
-- 10. CIERRE DE SEGURIDAD Y PERMISOS MÍNIMOS
-- ==============================================================================

UPDATE public.profiles AS p
SET role = 'repartidor', updated_at = now()
WHERE p.role = 'vecino'
  AND EXISTS (SELECT 1 FROM public.choferes_habilitados ch WHERE ch.user_id = p.id::text);

REVOKE ALL ON public.security_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

REVOKE SELECT ON public.profiles, public.choferes_habilitados, public.pedidos,
  public.rutas_repartidores, public.admin_credentials, public.usuarios_baneados,
  public.denuncias, public.reportes_spam, public.votos_registro,
  public.security_rate_limits FROM anon;

GRANT SELECT ON public.avisos, public.comentarios_avisos, public.anuncios_globales,
  public.configuracion_publicidad TO anon, authenticated;
GRANT SELECT ON public.choferes_publicos, public.pedidos_publicos,
  public.rutas_repartidores_publicas TO anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'is_admin_email', 'is_banned', 'rpc_assign_order', 'rpc_mark_order_seen',
        'rpc_confirm_order_received', 'rpc_driver_confirm_delivery', 'rpc_cancel_own_order',
        'rpc_get_driver_available_orders', 'rpc_get_user_bootstrap_data',
        'rpc_get_my_assigned_orders', 'rpc_purge_old_records',
        'incrementar_votos_aviso', 'incrementar_votos_comentario',
        'delete_user_account', 'rpc_admin_list_users', 'rpc_admin_delete_user',
        'rpc_admin_delete_driver_by_id', 'rpc_admin_renew_order',
        'rpc_crear_aviso_vecinal', 'rpc_agregar_comentario_aviso'
      ])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;

  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY['is_admin_email', 'is_banned'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_field_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_limited_content_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_optional_order_insert() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 061: ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN RLS INITPLAN
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_comentarios_avisos_aviso_id ON public.comentarios_avisos (aviso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_choferes_habilitados_user_id ON public.choferes_habilitados (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_estado ON public.pedidos (user_id, estado);

-- ============================================================================
-- 062: RESOLUCIÓN DE ALERTA DE SEGURIDAD POSTGIS Y RLS PUBLIC
-- ============================================================================
DROP EXTENSION IF EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

REVOKE EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated;

DROP POLICY IF EXISTS "rate_limits_admin_only" ON public.security_rate_limits;
DROP POLICY IF EXISTS "rate_limits_system_policy" ON public.security_rate_limits;
CREATE POLICY "rate_limits_system_policy" ON public.security_rate_limits
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT EXECUTE ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_field_integrity() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_limited_content_insert() TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_optional_order_insert() TO postgres, authenticated, service_role;



