-- 050_production_antibot_and_field_integrity.sql
-- Capa final de producción: límites por usuario, integridad de campos y permisos mínimos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action)
);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_rate_limits FROM PUBLIC, anon, authenticated;

-- Hasta esta versión, la existencia de una ficha implicaba siempre modo
-- repartidor. Se conserva ese estado inicial; desde ahora el usuario puede
-- persistir role='vecino' para alternar a comprador sin borrar su ficha.
UPDATE public.profiles AS p
SET role = 'repartidor', updated_at = now()
WHERE p.role = 'vecino'
  AND EXISTS (
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id = p.id::text
  );

CREATE OR REPLACE FUNCTION public.enforce_action_rate_limit(
  p_action text,
  p_max_hits integer,
  p_window_seconds integer
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para realizar esta acción';
  END IF;
  IF p_action IS NULL OR length(p_action) NOT BETWEEN 1 AND 80
     OR p_max_hits NOT BETWEEN 1 AND 1000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'Configuración de límite inválida';
  END IF;

  INSERT INTO public.security_rate_limits AS limits (
    user_id, action, window_started_at, hits, updated_at
  )
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
    RAISE EXCEPTION 'Demasiadas acciones seguidas. Espera un momento antes de reintentar.'
      USING ERRCODE = 'P0001';
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

  IF NEW.latitude IS NOT NULL AND (NEW.latitude < -90 OR NEW.latitude > 90) THEN
    RAISE EXCEPTION 'Latitud inválida';
  END IF;
  IF NEW.longitude IS NOT NULL AND (NEW.longitude < -180 OR NEW.longitude > 180) THEN
    RAISE EXCEPTION 'Longitud inválida';
  END IF;

  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  -- El trigger interno de Supabase Auth crea el perfil con contexto de servicio.
  IF TG_OP = 'INSERT' AND auth.uid() IS NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id) THEN
    NEW.role := 'vecino';
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
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR public.is_banned() THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_050_profile_integrity ON public.profiles;
CREATE TRIGGER trg_050_profile_integrity
BEFORE INSERT OR UPDATE ON public.profiles
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

-- El perfil propio puede alternar vecino/repartidor, pero nunca autoasignarse admin.
DROP POLICY IF EXISTS "Profiles User ALL" ON public.profiles;
CREATE POLICY "Profiles User ALL" ON public.profiles FOR ALL
USING (auth.uid() = id OR public.is_admin_email())
WITH CHECK (
  public.is_admin_email()
  OR (auth.uid() = id AND role IN ('vecino', 'repartidor'))
);

-- Revierte las concesiones excesivas de 048 para usuarios anónimos y para objetos futuros.
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

-- Ninguna función nueva queda ejecutable automáticamente. Se habilitan solo RPC oficiales.
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
        'rpc_get_demand_clusters_v2', 'rpc_get_orders_for_cluster_v2',
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

COMMIT;
