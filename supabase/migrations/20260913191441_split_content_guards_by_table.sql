BEGIN;

-- Un trigger PL/pgSQL no debe referenciar campos de relaciones heterogéneas.
-- Separamos el guard genérico en funciones privadas tipadas por tabla.

CREATE OR REPLACE FUNCTION private.guard_avisos_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.user_id := v_uid;
  NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 180);
  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.mensaje := LEFT(REGEXP_REPLACE(COALESCE(NEW.mensaje, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
  IF LOWER(TRIM(COALESCE(NEW.tipo, 'aviso'))) IN ('oficial', 'alerta_oficial') THEN RAISE EXCEPTION 'Solo un administrador puede publicar avisos oficiales'; END IF;
  PERFORM public.enforce_action_rate_limit('create_notice', 5, 600);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_comentarios_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.user_id := v_uid;
  NEW.autor := LEFT(REGEXP_REPLACE(COALESCE(NEW.autor, 'Vecino'), '<[^>]*>', '', 'g'), 120);
  NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 2000);
  IF length(TRIM(NEW.texto)) < 1 THEN RAISE EXCEPTION 'El comentario está vacío'; END IF;
  PERFORM public.enforce_action_rate_limit('create_comment', 20, 300);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_votos_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.user_id := v_uid;
  NEW.valor := CASE WHEN COALESCE(NEW.valor, 1) < 0 THEN -1 ELSE 1 END;
  PERFORM public.enforce_action_rate_limit('cast_vote', 40, 300);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_denuncias_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.denunciante_id := v_uid;
  NEW.user_id := v_uid;
  NEW.motivo := LEFT(REGEXP_REPLACE(COALESCE(NEW.motivo, 'general'), '<[^>]*>', '', 'g'), 120);
  NEW.detalles := LEFT(REGEXP_REPLACE(COALESCE(NEW.detalles, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.telefono_denunciado := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono_denunciado, ''), '[^0-9+ ()-]', '', 'g'), 24);
  PERFORM public.enforce_action_rate_limit('create_report', 8, 3600);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_reportes_spam_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.user_id := v_uid;
  NEW.motivo := LEFT(REGEXP_REPLACE(COALESCE(NEW.motivo, 'spam'), '<[^>]*>', '', 'g'), 120);
  NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 2000);
  PERFORM public.enforce_action_rate_limit('create_spam_report', 10, 3600);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_driver_registration_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.user_id := v_uid;
  NEW.nombre_completo := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre_completo, ''), '<[^>]*>', '', 'g'), 120);
  NEW.telefono_whatsapp := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono_whatsapp, ''), '[^0-9+ ()-]', '', 'g'), 24);
  NEW.placa := LEFT(UPPER(REGEXP_REPLACE(COALESCE(NEW.placa, ''), '[^A-Za-z0-9-]', '', 'g')), 16);
  NEW.productos := LEFT(REGEXP_REPLACE(COALESCE(NEW.productos, ''), '<[^>]*>', '', 'g'), 500);
  NEW.zonas := LEFT(REGEXP_REPLACE(COALESCE(NEW.zonas, ''), '<[^>]*>', '', 'g'), 500);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
  IF length(NEW.nombre_completo) < 2 OR length(NEW.telefono_whatsapp) < 6 OR length(NEW.placa) < 3 THEN RAISE EXCEPTION 'Ficha de repartidor inválida o incompleta'; END IF;
  PERFORM public.enforce_action_rate_limit('driver_registration', 3, 3600);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_driver_route_insert_internal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION 'Cuenta autenticada requerida'; END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;
  NEW.user_id := v_uid;
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  IF NEW.latitude NOT BETWEEN -90 AND 90 OR NEW.longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Ubicación de recorrido inválida'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_avisos_insert_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_comentarios_insert_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_votos_insert_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_denuncias_insert_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_reportes_spam_insert_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_driver_registration_insert_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_driver_route_insert_internal() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_050_limit_avisos ON public.avisos;
CREATE TRIGGER trg_050_limit_avisos BEFORE INSERT ON public.avisos FOR EACH ROW EXECUTE FUNCTION private.guard_avisos_insert_internal();
DROP TRIGGER IF EXISTS trg_050_limit_comentarios ON public.comentarios_avisos;
CREATE TRIGGER trg_050_limit_comentarios BEFORE INSERT ON public.comentarios_avisos FOR EACH ROW EXECUTE FUNCTION private.guard_comentarios_insert_internal();
DROP TRIGGER IF EXISTS trg_050_limit_votos ON public.votos_registro;
CREATE TRIGGER trg_050_limit_votos BEFORE INSERT ON public.votos_registro FOR EACH ROW EXECUTE FUNCTION private.guard_votos_insert_internal();
DROP TRIGGER IF EXISTS trg_050_limit_denuncias ON public.denuncias;
CREATE TRIGGER trg_050_limit_denuncias BEFORE INSERT ON public.denuncias FOR EACH ROW EXECUTE FUNCTION private.guard_denuncias_insert_internal();
DROP TRIGGER IF EXISTS trg_050_limit_reportes_spam ON public.reportes_spam;
CREATE TRIGGER trg_050_limit_reportes_spam BEFORE INSERT ON public.reportes_spam FOR EACH ROW EXECUTE FUNCTION private.guard_reportes_spam_insert_internal();
DROP TRIGGER IF EXISTS trg_050_limit_driver_registration ON public.choferes_habilitados;
CREATE TRIGGER trg_050_limit_driver_registration BEFORE INSERT ON public.choferes_habilitados FOR EACH ROW EXECUTE FUNCTION private.guard_driver_registration_insert_internal();
DROP TRIGGER IF EXISTS trg_050_limit_driver_route ON public.rutas_repartidores;
CREATE TRIGGER trg_050_limit_driver_route BEFORE INSERT ON public.rutas_repartidores FOR EACH ROW EXECUTE FUNCTION private.guard_driver_route_insert_internal();

DROP FUNCTION IF EXISTS public.guard_limited_content_insert();

COMMIT;
