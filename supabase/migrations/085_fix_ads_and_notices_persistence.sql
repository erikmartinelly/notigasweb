-- ==============================================================================
-- MIGRACIÓN 085: CORREGIR PERSISTENCIA Y CREACIÓN DE AVISOS Y PEDIDOS
-- 1. Eliminar bloqueo de teléfono opcional en guard_limited_content_insert()
-- 2. Asegurar firma flexible con defaults para rpc_crear_aviso_vecinal()
-- 3. Evitar borrado automático indebido de avisos comunitarios
-- ==============================================================================

-- 1. Actualizar trigger guard_limited_content_insert()
CREATE OR REPLACE FUNCTION public.guard_limited_content_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  IF public.is_banned() THEN
    RAISE EXCEPTION 'Cuenta suspendida';
  END IF;

  IF v_uid IS NULL AND NEW.user_id IS NOT NULL THEN
    v_uid := NEW.user_id;
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
    
    -- Teléfono es opcional: solo validar longitud si no está vacío
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
    NEW.tipo := LEFT(REGEXP_REPLACE(COALESCE(NEW.tipo, 'general'), '<[^>]*>', '', 'g'), 120);
    NEW.detalle := LEFT(REGEXP_REPLACE(COALESCE(NEW.detalle, ''), '<[^>]*>', '', 'g'), 2000);
    PERFORM public.enforce_action_rate_limit('create_report', 8, 3600);

  ELSIF TG_TABLE_NAME = 'reportes_spam' THEN
    NEW.user_id := v_uid;
    NEW.tipo := LEFT(REGEXP_REPLACE(COALESCE(NEW.tipo, 'spam'), '<[^>]*>', '', 'g'), 120);
    NEW.detalle := LEFT(REGEXP_REPLACE(COALESCE(NEW.detalle, ''), '<[^>]*>', '', 'g'), 2000);
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

-- 2. Recrear rpc_crear_aviso_vecinal con parámetros flexibles y valores por defecto
DROP FUNCTION IF EXISTS public.rpc_crear_aviso_vecinal(text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_crear_aviso_vecinal;

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

GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text, text, text, text, text, text) TO authenticated;

-- 3. Actualizar rpc_purge_old_records para NO borrar avisos comunitarios automáticamente
CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_pedidos_deleted integer := 0;
  v_rutas_deleted integer := 0;
BEGIN
  IF NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Eliminar pedidos completados o cancelados (o con más de 24 horas)
  WITH d AS (
    DELETE FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  -- Eliminar rutas inactivas de repartidores (> 2 horas)
  WITH d AS (
    DELETE FROM public.rutas_repartidores
    WHERE last_active < (now() - interval '2 hours')
    RETURNING id
  ) SELECT count(*) INTO v_rutas_deleted FROM d;

  RETURN jsonb_build_object(
    'success', true,
    'pedidos_eliminados', v_pedidos_deleted,
    'rutas_eliminadas', v_rutas_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated;
