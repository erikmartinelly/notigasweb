BEGIN;

CREATE OR REPLACE FUNCTION public.guard_limited_content_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN RETURN NEW; END IF;
  IF v_uid IS NULL OR COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Cuenta autenticada requerida';
  END IF;
  IF public.is_banned() THEN RAISE EXCEPTION 'Cuenta suspendida'; END IF;

  IF TG_TABLE_NAME = 'pedidos' THEN
    NEW.user_id := v_uid; NEW.estado := 'pendiente'; NEW.driver_id := NULL; NEW.visto := false;
    NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 120);
    NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
    NEW.cantidad := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
    NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '[^[:print:]]', '', 'g'), 240);
    NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
    NEW.categoria := LEFT(LOWER(TRIM(COALESCE(NEW.categoria, 'gas'))), 60);
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    IF NEW.titulo = '' OR NEW.direccion = '' OR (NEW.telefono <> '' AND length(NEW.telefono) < 6)
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
    IF LOWER(TRIM(COALESCE(NEW.tipo, 'aviso'))) IN ('oficial', 'alerta_oficial') THEN RAISE EXCEPTION 'Solo un administrador puede publicar avisos oficiales'; END IF;
    PERFORM public.enforce_action_rate_limit('create_notice', 5, 600);
  ELSIF TG_TABLE_NAME = 'comentarios_avisos' THEN
    NEW.user_id := v_uid;
    NEW.autor := LEFT(REGEXP_REPLACE(COALESCE(NEW.autor, 'Vecino'), '<[^>]*>', '', 'g'), 120);
    NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 2000);
    IF length(TRIM(NEW.texto)) < 1 THEN RAISE EXCEPTION 'El comentario está vacío'; END IF;
    PERFORM public.enforce_action_rate_limit('create_comment', 20, 300);
  ELSIF TG_TABLE_NAME = 'votos_registro' THEN
    NEW.user_id := v_uid;
    NEW.valor := CASE WHEN COALESCE(NEW.valor, 1) < 0 THEN -1 ELSE 1 END;
    PERFORM public.enforce_action_rate_limit('cast_vote', 40, 300);
  ELSIF TG_TABLE_NAME = 'denuncias' THEN
    NEW.denunciante_id := v_uid; NEW.user_id := v_uid;
    NEW.motivo := LEFT(REGEXP_REPLACE(COALESCE(NEW.motivo, 'general'), '<[^>]*>', '', 'g'), 120);
    NEW.detalles := LEFT(REGEXP_REPLACE(COALESCE(NEW.detalles, ''), '<[^>]*>', '', 'g'), 2000);
    NEW.telefono_denunciado := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono_denunciado, ''), '[^0-9+ ()-]', '', 'g'), 24);
    PERFORM public.enforce_action_rate_limit('create_report', 8, 3600);
  ELSIF TG_TABLE_NAME = 'reportes_spam' THEN
    NEW.user_id := v_uid;
    NEW.motivo := LEFT(REGEXP_REPLACE(COALESCE(NEW.motivo, 'spam'), '<[^>]*>', '', 'g'), 120);
    NEW.texto := LEFT(REGEXP_REPLACE(COALESCE(NEW.texto, ''), '<[^>]*>', '', 'g'), 2000);
    PERFORM public.enforce_action_rate_limit('create_spam_report', 10, 3600);
  ELSIF TG_TABLE_NAME = 'choferes_habilitados' THEN
    NEW.user_id := v_uid;
    NEW.nombre_completo := LEFT(REGEXP_REPLACE(COALESCE(NEW.nombre_completo, ''), '<[^>]*>', '', 'g'), 120);
    NEW.telefono_whatsapp := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono_whatsapp, ''), '[^0-9+ ()-]', '', 'g'), 24);
    NEW.placa := LEFT(UPPER(REGEXP_REPLACE(COALESCE(NEW.placa, ''), '[^A-Za-z0-9-]', '', 'g')), 16);
    NEW.productos := LEFT(REGEXP_REPLACE(COALESCE(NEW.productos, ''), '<[^>]*>', '', 'g'), 500);
    NEW.zonas := LEFT(REGEXP_REPLACE(COALESCE(NEW.zonas, ''), '<[^>]*>', '', 'g'), 500);
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    IF length(NEW.nombre_completo) < 2 OR length(NEW.telefono_whatsapp) < 6 OR length(NEW.placa) < 3 THEN RAISE EXCEPTION 'Ficha de repartidor inválida o incompleta'; END IF;
    PERFORM public.enforce_action_rate_limit('driver_registration', 3, 3600);
  ELSIF TG_TABLE_NAME = 'rutas_repartidores' THEN
    NEW.user_id := v_uid;
    NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);
    NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
    IF NEW.latitude NOT BETWEEN -90 AND 90 OR NEW.longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Ubicación de recorrido inválida'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS denuncias_insert ON public.denuncias;
CREATE POLICY denuncias_insert ON public.denuncias FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false AND auth.uid() IS NOT NULL AND user_id = auth.uid()::text AND denunciante_id = auth.uid()::text);

DROP POLICY IF EXISTS reportes_spam_insert ON public.reportes_spam;
CREATE POLICY reportes_spam_insert ON public.reportes_spam FOR INSERT TO authenticated
WITH CHECK (COALESCE((auth.jwt()->>'is_anonymous')::boolean, false) = false AND auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

REVOKE ALL ON FUNCTION public.trg_estado_pago_ocr_automatico() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_estado_pago_ocr_automatico() TO service_role;
REVOKE ALL ON FUNCTION public.normalize_delivery_category(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_delivery_category(text) TO service_role;

COMMIT;
