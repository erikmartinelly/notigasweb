-- =============================================================================
-- 043_production_privacy_and_integrity.sql
-- Privacidad de pedidos y telemetria, avisos oficiales y reglas de repartidor.
-- Este archivo es SQL puro: ejecutar completo en Supabase SQL Editor.
-- =============================================================================

BEGIN;

ALTER TABLE public.avisos
  ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'AVISO VECINAL';

ALTER TABLE public.choferes_habilitados
  ALTER COLUMN estado_verificacion SET DEFAULT 'pendiente';

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
    NEW.estado_verificacion := 'pendiente';
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

-- -----------------------------------------------------------------------------
-- Sanitizacion y autenticidad de comunicados oficiales
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Vistas publicas: no exponen contacto ni identificadores de terceros
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.pedidos_publicos;
CREATE VIEW public.pedidos_publicos
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
  CASE
    WHEN p.user_id = auth.uid()::text OR p.driver_id = auth.uid()::text THEN p.driver_id
    ELSE NULL::text
  END AS driver_id,
  p.ciudad,
  p.barrio_otb,
  CASE
    WHEN p.user_id = auth.uid()::text THEN p.latitude
    ELSE ROUND(p.latitude::numeric, 3)::double precision
  END AS latitude,
  CASE
    WHEN p.user_id = auth.uid()::text THEN p.longitude
    ELSE ROUND(p.longitude::numeric, 3)::double precision
  END AS longitude,
  CASE WHEN p.user_id = auth.uid()::text THEN p.descripcion ELSE NULL::text END AS descripcion,
  p.visto,
  p.created_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto');

DROP VIEW IF EXISTS public.choferes_publicos;
CREATE VIEW public.choferes_publicos
WITH (security_barrier = true)
AS
SELECT
  ch.id,
  ch.nombre_completo,
  ch.categoria,
  ch.ciudad,
  ch.zonas,
  ch.schedule,
  ch.placa,
  ch.productos,
  ch.estado_verificacion
FROM public.choferes_habilitados ch
WHERE LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
    SELECT 1
    FROM public.usuarios_baneados ub
    WHERE (ub.user_id IS NOT NULL AND ub.user_id = ch.user_id)
       OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
       OR (ub.placa IS NOT NULL AND LOWER(ub.placa) = LOWER(ch.placa))
  );

DROP VIEW IF EXISTS public.rutas_repartidores_publicas;
CREATE VIEW public.rutas_repartidores_publicas
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
  r.telefono,
  r.last_active
FROM public.rutas_repartidores r
JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= now() - interval '10 minutes'
  AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub
    WHERE ub.user_id = r.user_id
  );

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.choferes_habilitados FROM anon;
REVOKE SELECT ON public.pedidos FROM anon;
REVOKE SELECT ON public.rutas_repartidores FROM anon;

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.choferes_habilitados TO authenticated;
GRANT SELECT ON public.pedidos TO authenticated;
GRANT SELECT ON public.rutas_repartidores TO authenticated;
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

DROP POLICY IF EXISTS "Profiles Public SELECT" ON public.profiles;
DROP POLICY IF EXISTS "Profiles User SELECT" ON public.profiles;
CREATE POLICY "Profiles User SELECT" ON public.profiles
FOR SELECT USING (auth.uid() = id OR public.is_admin_email());

DROP POLICY IF EXISTS "Choferes Public SELECT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Own Admin SELECT" ON public.choferes_habilitados;
CREATE POLICY "Choferes Own Admin SELECT" ON public.choferes_habilitados
FOR SELECT USING (auth.uid()::text = user_id OR public.is_admin_email());

DROP POLICY IF EXISTS "Choferes Actualizar propio o Admin" ON public.choferes_habilitados;
CREATE POLICY "Choferes Actualizar propio o Admin" ON public.choferes_habilitados
FOR UPDATE
USING (auth.uid()::text = user_id OR public.is_admin_email())
WITH CHECK (auth.uid()::text = user_id OR public.is_admin_email());

DROP POLICY IF EXISTS "Rutas Public SELECT" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Rutas Own Admin SELECT" ON public.rutas_repartidores;
CREATE POLICY "Rutas Own Admin SELECT" ON public.rutas_repartidores
FOR SELECT USING (auth.uid()::text = user_id OR public.is_admin_email());

DROP POLICY IF EXISTS "Avisos User Insert" ON public.avisos;
CREATE POLICY "Avisos User Insert" ON public.avisos
FOR INSERT WITH CHECK (
  auth.uid()::text = user_id
  AND NOT public.is_banned()
  AND (
    LOWER(TRIM(COALESCE(tipo, ''))) NOT IN ('oficial', 'alerta_oficial')
    OR public.is_admin_email()
  )
);

DROP POLICY IF EXISTS "Avisos User Update" ON public.avisos;
CREATE POLICY "Avisos User Update" ON public.avisos
FOR UPDATE
USING (auth.uid()::text = user_id OR public.is_admin_email())
WITH CHECK (
  (auth.uid()::text = user_id OR public.is_admin_email())
  AND (
    LOWER(TRIM(COALESCE(tipo, ''))) NOT IN ('oficial', 'alerta_oficial')
    OR public.is_admin_email()
  )
);

-- -----------------------------------------------------------------------------
-- Repartidores habilitados y datos previos a la asignacion
-- -----------------------------------------------------------------------------

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
  WHERE id = p_order_id AND estado = 'pendiente';
END;
$$;

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
    FROM public.pedidos p
    WHERE p.estado = 'pendiente'
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
  FROM clustered_orders c
  WHERE c.cluster_id_raw IS NOT NULL
  GROUP BY c.ciudad, c.categoria, c.cluster_id_raw;
END;
$$;

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
    FROM public.pedidos p
    WHERE p.estado = 'pendiente'
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

-- Impide modificar contacto, propietario o asignacion mediante UPDATE directo.
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

DROP POLICY IF EXISTS "Pedidos Actualizar propio o asignado" ON public.pedidos;
CREATE POLICY "Pedidos Actualizar propio o asignado" ON public.pedidos
FOR UPDATE
USING (
  auth.uid()::text = user_id
  OR auth.uid()::text = driver_id
  OR public.is_admin_email()
)
WITH CHECK (
  auth.uid()::text = user_id
  OR auth.uid()::text = driver_id
  OR public.is_admin_email()
);

-- Las ondas de radar son solo lectura. La asignacion grupal queda deshabilitada.
REVOKE ALL ON FUNCTION public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_get_demand_clusters_v2(text, text, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_demand_clusters_v2(text, text, double precision, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) TO authenticated;

-- Ya no se usa autenticacion administrativa por contraseña propia.
DROP FUNCTION IF EXISTS public.validar_admin(text, text);

REVOKE EXECUTE ON FUNCTION public.normalize_delivery_category(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_official_notice_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_pedido_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_driver_verification() FROM PUBLIC, anon, authenticated;

COMMIT;
