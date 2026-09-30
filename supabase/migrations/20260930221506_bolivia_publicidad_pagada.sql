-- ============================================================================
-- NOTIGAS Bolivia - Publicidad pagada por día
--
-- Un negocio registrado escribe el texto de su anuncio, elige cuántos días
-- quiere publicarlo, paga por QR local (Simple / Banesco) y sube el
-- comprobante. El OCR del navegador extrae monto, operación, canal y país, y
-- esta migración valida ese comprobante contra el precio configurado.
--
-- Precio: 9 Bs por cada 24 h (configurable en config_publicidad_pagos).
-- Publicación: inmediata; el admin revisa después y puede retirar.
--
-- Todo el alta entra por rpc_publicar_anuncio_pagado (SECURITY DEFINER), así
-- que el cliente nunca decide el precio ni puede insertar un anuncio activo
-- a mano.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Configuración de precio y datos de cobro (singleton)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config_publicidad_pagos (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  precio_por_dia        numeric(10,2) NOT NULL DEFAULT 9.00 CHECK (precio_por_dia > 0),
  moneda                text NOT NULL DEFAULT 'Bs',
  dias_minimo           integer NOT NULL DEFAULT 1 CHECK (dias_minimo BETWEEN 1 AND 90),
  dias_maximo           integer NOT NULL DEFAULT 30 CHECK (dias_maximo BETWEEN 1 AND 90),
  activo                boolean NOT NULL DEFAULT true,
  pais_destino          text NOT NULL DEFAULT 'Bolivia',
  beneficiario_nombre   text,
  beneficiario_documento text,
  metodo_entrega        text NOT NULL DEFAULT 'QR Simple / Banesco QR',
  numero_cuenta         text,
  instrucciones         text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (dias_maximo >= dias_minimo)
);

INSERT INTO public.config_publicidad_pagos (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.config_publicidad_pagos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_publicidad_pagos FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Anuncios publicitarios pagados
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anuncios_publicitarios (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anunciante_nombre       text,
  anunciante_contacto     text,
  titulo                  text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 3 AND 120),
  descripcion             text CHECK (descripcion IS NULL OR length(descripcion) <= 800),
  url                     text CHECK (url IS NULL OR length(url) <= 500),
  image_url               text CHECK (image_url IS NULL OR length(image_url) <= 500),
  ciudad                  text NOT NULL DEFAULT 'global' CHECK (length(ciudad) <= 60),
  posicion                text NOT NULL DEFAULT 'mapa'
                            CHECK (posicion IN ('mapa','repartidores','muro_avisos')),
  dias                    integer NOT NULL CHECK (dias BETWEEN 1 AND 90),
  precio_por_dia          numeric(10,2) NOT NULL CHECK (precio_por_dia > 0),
  monto_esperado          numeric(10,2) NOT NULL CHECK (monto_esperado > 0),
  estado                  text NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo','expirado','retirado')),
  revision_pendiente      boolean NOT NULL DEFAULT true,
  sospechoso              boolean NOT NULL DEFAULT false,
  voucher_operacion       text,
  voucher_operacion_norm  text,
  voucher_monto           numeric(10,2),
  voucher_canal           text,
  voucher_pais            text,
  voucher_fecha           timestamptz,
  voucher_confianza       real,
  voucher_texto           text,
  voucher_imagen_path     text,
  expira_en               timestamptz NOT NULL,
  retirado_por            uuid,
  retirado_en             timestamptz,
  motivo_retiro           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (monto_esperado = round(precio_por_dia * dias, 2))
);

-- Un mismo comprobante no puede comprar dos anuncios.
CREATE UNIQUE INDEX IF NOT EXISTS anuncios_publicitarios_voucher_unico
  ON public.anuncios_publicitarios (voucher_operacion_norm)
  WHERE voucher_operacion_norm IS NOT NULL;

-- Consultas del dueño ("mis anuncios") y del admin.
CREATE INDEX IF NOT EXISTS anuncios_publicitarios_user_created_idx
  ON public.anuncios_publicitarios (user_id, created_at DESC);

-- Cola de revisión y barrido de expirados.
CREATE INDEX IF NOT EXISTS anuncios_publicitarios_estado_expira_idx
  ON public.anuncios_publicitarios (estado, expira_en);

-- Lectura pública de anuncios vivos ordenados por posición/ciudad.
CREATE INDEX IF NOT EXISTS anuncios_publicitarios_vivos_idx
  ON public.anuncios_publicitarios (posicion, ciudad, created_at DESC)
  WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS anuncios_publicitarios_revision_idx
  ON public.anuncios_publicitarios (created_at DESC)
  WHERE revision_pendiente;

ALTER TABLE public.anuncios_publicitarios ENABLE ROW LEVEL SECURITY;

-- El dueño solo ve sus propios anuncios. No hay INSERT/UPDATE/DELETE directos:
-- el alta entra por la RPC y el retiro por la RPC de admin.
DROP POLICY IF EXISTS anuncios_publicitarios_select_propios ON public.anuncios_publicitarios;
CREATE POLICY anuncios_publicitarios_select_propios
  ON public.anuncios_publicitarios
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.anuncios_publicitarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.anuncios_publicitarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anuncios_publicitarios TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Lectura pública de los anuncios pagados vigentes
--    Se devuelven solo columnas seguras (nada de vouchers, montos ni flags de
--    revisión). El filtro de vigencia (estado + expira_en) lo impone el
--    servidor, así que un anuncio vencido o retirado desaparece solo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_anuncios_publicitarios_vivos(p_limite integer DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  titulo      text,
  descripcion text,
  url         text,
  image_url   text,
  ciudad      text,
  posicion    text,
  created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.titulo, p.descripcion, p.url, p.image_url,
         p.ciudad, p.posicion, p.created_at
  FROM public.anuncios_publicitarios p
  WHERE p.estado = 'activo'
    AND p.expira_en > now()
  ORDER BY p.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limite, 50), 100));
$function$;

REVOKE ALL ON FUNCTION public.rpc_anuncios_publicitarios_vivos(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_anuncios_publicitarios_vivos(integer) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Lectura pública de la configuración de cobro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_publicidad_pagos_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'precio_por_dia',         c.precio_por_dia,
    'moneda',                 c.moneda,
    'dias_minimo',            c.dias_minimo,
    'dias_maximo',            c.dias_maximo,
    'activo',                 c.activo,
    'pais_destino',           c.pais_destino,
    'beneficiario_nombre',    c.beneficiario_nombre,
    'beneficiario_documento', c.beneficiario_documento,
    'metodo_entrega',         c.metodo_entrega,
    'numero_cuenta',          c.numero_cuenta,
    'instrucciones',          c.instrucciones
  )
  FROM public.config_publicidad_pagos c
  WHERE c.id = 1;
$function$;

REVOKE ALL ON FUNCTION public.rpc_publicidad_pagos_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_publicidad_pagos_config() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Alta de anuncio pagado (única vía de creación)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_publicar_anuncio_pagado(
  p_titulo              text,
  p_descripcion         text,
  p_url                 text,
  p_ciudad              text,
  p_posicion            text,
  p_dias                integer,
  p_anunciante_nombre   text,
  p_anunciante_contacto text,
  p_voucher             jsonb,
  p_voucher_imagen_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_cfg         public.config_publicidad_pagos;
  v_precio      numeric(10,2);
  v_total       numeric(10,2);
  v_dias        integer;
  v_pos         text;
  v_ciudad      text;
  v_url         text;
  v_titulo      text;
  v_desc        text;
  v_op          text;
  v_op_norm     text;
  v_monto       numeric(10,2);
  v_canal       text;
  v_pais        text;
  v_fecha       timestamptz;
  v_conf        real;
  v_texto       text;
  v_es_valido   boolean;
  v_recientes   integer;
  v_sospechoso  boolean := false;
  v_id          uuid;
  v_expira      timestamptz;
  v_limite      constant integer := 5;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_auth',
      'mensaje', 'Debes iniciar sesión para publicar.');
  END IF;

  SELECT * INTO v_cfg FROM public.config_publicidad_pagos WHERE id = 1;
  IF v_cfg.id IS NULL OR NOT v_cfg.activo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_disponible',
      'mensaje', 'La publicidad pagada no está disponible por ahora.');
  END IF;

  v_titulo := btrim(coalesce(p_titulo, ''));
  IF length(v_titulo) < 3 OR length(v_titulo) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'titulo',
      'mensaje', 'El título debe tener entre 3 y 120 caracteres.');
  END IF;

  v_desc := nullif(btrim(coalesce(p_descripcion, '')), '');
  IF v_desc IS NOT NULL AND length(v_desc) > 800 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'descripcion',
      'mensaje', 'La descripción no puede pasar de 800 caracteres.');
  END IF;

  v_url := nullif(btrim(coalesce(p_url, '')), '');
  IF v_url IS NOT NULL AND (length(v_url) > 500 OR v_url !~* '^https?://') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'url',
      'mensaje', 'El enlace debe empezar con http:// o https://.');
  END IF;

  v_dias := coalesce(p_dias, 0);
  IF v_dias < v_cfg.dias_minimo OR v_dias > v_cfg.dias_maximo THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'dias',
      'mensaje', format('Elige entre %s y %s días.', v_cfg.dias_minimo, v_cfg.dias_maximo));
  END IF;

  v_pos := lower(btrim(coalesce(p_posicion, 'mapa')));
  IF v_pos NOT IN ('mapa', 'repartidores', 'muro_avisos') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'posicion',
      'mensaje', 'Ubicación de anuncio no válida.');
  END IF;

  v_ciudad := lower(btrim(coalesce(nullif(p_ciudad, ''), 'global')));
  IF length(v_ciudad) > 60 THEN
    v_ciudad := left(v_ciudad, 60);
  END IF;

  -- El precio SIEMPRE sale del servidor, nunca del cliente.
  v_precio := v_cfg.precio_por_dia;
  v_total  := round(v_precio * v_dias, 2);

  -- Límite antifraude: máximo 5 anuncios pagados por usuario en 24 h.
  SELECT count(*) INTO v_recientes
    FROM public.anuncios_publicitarios
   WHERE user_id = v_uid AND created_at > now() - interval '24 hours';
  IF v_recientes >= v_limite THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'limite',
      'mensaje', format('Alcanzaste el límite de %s anuncios por día. Intenta más tarde.', v_limite));
  END IF;

  -- Datos del comprobante leídos por OCR en el navegador.
  v_es_valido := coalesce((p_voucher->>'esValido')::boolean, false);
  v_op        := nullif(btrim(coalesce(p_voucher->>'operacion', '')), '');
  v_op_norm   := lower(regexp_replace(coalesce(v_op, ''), '[^A-Za-z0-9]', '', 'g'));
  v_canal     := nullif(btrim(coalesce(p_voucher->>'canalPago', '')), '');
  v_pais      := nullif(btrim(coalesce(p_voucher->>'paisDestino', '')), '');
  v_texto     := left(nullif(coalesce(p_voucher->>'rawText', ''), ''), 4000);

  BEGIN
    v_monto := nullif(btrim(coalesce(p_voucher->>'monto', '')), '')::numeric;
  EXCEPTION WHEN others THEN
    v_monto := NULL;
  END;
  BEGIN
    v_fecha := nullif(btrim(coalesce(p_voucher->>'fechaISO', '')), '')::timestamptz;
  EXCEPTION WHEN others THEN
    v_fecha := NULL;
  END;
  BEGIN
    v_conf := nullif(btrim(coalesce(p_voucher->>'confianza', '')), '')::real;
  EXCEPTION WHEN others THEN
    v_conf := NULL;
  END;

  IF NOT v_es_valido THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_invalido',
      'mensaje', 'No pudimos leer el comprobante. Sube una foto más clara.');
  END IF;

  IF v_op_norm IS NULL OR length(v_op_norm) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_operacion',
      'mensaje', 'Necesitamos el número de operación del comprobante.');
  END IF;

  IF v_pais IS DISTINCT FROM 'Bolivia' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_pais',
      'mensaje', 'El comprobante debe ser de un pago en Bolivia.');
  END IF;

  IF v_canal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_canal',
      'mensaje', 'El comprobante debe ser de QR local (Simple / Banesco).');
  END IF;

  IF v_monto IS NULL OR abs(v_monto - v_total) > 0.01 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_monto',
      'mensaje', format('El comprobante por Bs %s no coincide con el total de Bs %s.',
                        coalesce(to_char(v_monto, 'FM999999990.00'), '?'), to_char(v_total, 'FM999999990.00')));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anuncios_publicitarios
     WHERE voucher_operacion_norm = v_op_norm
  ) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_duplicado',
      'mensaje', 'Ese comprobante ya fue usado en otro anuncio.');
  END IF;

  -- Señales de riesgo que se marcan para la revisión del admin, sin bloquear.
  v_sospechoso := (v_conf IS NOT NULL AND v_conf < 55)
               OR (v_fecha IS NOT NULL AND v_fecha < now() - interval '7 days');

  v_expira := now() + (v_dias || ' days')::interval;

  INSERT INTO public.anuncios_publicitarios (
    user_id, anunciante_nombre, anunciante_contacto,
    titulo, descripcion, url, ciudad, posicion,
    dias, precio_por_dia, monto_esperado,
    estado, revision_pendiente, sospechoso,
    voucher_operacion, voucher_operacion_norm, voucher_monto,
    voucher_canal, voucher_pais, voucher_fecha, voucher_confianza,
    voucher_texto, voucher_imagen_path, expira_en
  ) VALUES (
    v_uid, nullif(btrim(coalesce(p_anunciante_nombre, '')), ''),
    nullif(btrim(coalesce(p_anunciante_contacto, '')), ''),
    v_titulo, v_desc, v_url, v_ciudad, v_pos,
    v_dias, v_precio, v_total,
    'activo', true, v_sospechoso,
    v_op, v_op_norm, v_monto,
    v_canal, v_pais, v_fecha, v_conf,
    v_texto, nullif(btrim(coalesce(p_voucher_imagen_path, '')), ''), v_expira
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'expira_en', v_expira,
    'dias', v_dias, 'precio_por_dia', v_precio, 'monto', v_total,
    'posicion', v_pos, 'ciudad', v_ciudad, 'sospechoso', v_sospechoso
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'voucher_duplicado',
      'mensaje', 'Ese comprobante ya fue usado en otro anuncio.');
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_publicar_anuncio_pagado(text,text,text,text,text,integer,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_publicar_anuncio_pagado(text,text,text,text,text,integer,text,text,jsonb,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. "Mis anuncios"
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_mis_anuncios_publicitarios()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_auth',
      'mensaje', 'Debes iniciar sesión.');
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT id, titulo, descripcion, url, image_url, ciudad, posicion,
           dias, monto_esperado, estado, expira_en, created_at,
           (estado = 'activo' AND expira_en > now()) AS vigente,
           greatest(0, ceil(extract(epoch FROM (expira_en - now())) / 86400.0))::integer AS dias_restantes
    FROM public.anuncios_publicitarios
    WHERE user_id = v_uid
    ORDER BY created_at DESC
    LIMIT 100
  ) x;

  RETURN jsonb_build_object('ok', true, 'anuncios', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_mis_anuncios_publicitarios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_mis_anuncios_publicitarios() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Revisión del admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_anuncios_publicitarios(p_limite integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_out     jsonb;
  v_limite  integer := greatest(1, least(coalesce(p_limite, 100), 500));
BEGIN
  IF NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_admin',
      'mensaje', 'Solo el administrador puede revisar anuncios.');
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT id, user_id, anunciante_nombre, anunciante_contacto,
           titulo, descripcion, url, image_url, ciudad, posicion,
           dias, precio_por_dia, monto_esperado, estado,
           revision_pendiente, sospechoso,
           voucher_operacion, voucher_monto, voucher_canal, voucher_pais,
           voucher_fecha, voucher_confianza, voucher_imagen_path,
           expira_en, retirado_en, motivo_retiro, created_at
    FROM public.anuncios_publicitarios
    ORDER BY created_at DESC
    LIMIT v_limite
  ) x;

  RETURN jsonb_build_object('ok', true, 'anuncios', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_admin_anuncios_publicitarios(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_anuncios_publicitarios(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_admin_retirar_anuncio_publicitario(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_admin',
      'mensaje', 'Solo el administrador puede retirar anuncios.');
  END IF;

  UPDATE public.anuncios_publicitarios
     SET estado = 'retirado',
         retirado_por = v_uid,
         retirado_en = now(),
         motivo_retiro = left(coalesce(nullif(btrim(p_motivo), ''), ''), 300),
         revision_pendiente = false
   WHERE id = p_id AND estado <> 'retirado';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'no_encontrado',
      'mensaje', 'El anuncio no existe o ya estaba retirado.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_admin_retirar_anuncio_publicitario(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_retirar_anuncio_publicitario(uuid,text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Almacenamiento privado de comprobantes (solo dueño y admin)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vouchers-publicidad', 'vouchers-publicidad', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS vouchers_publicidad_insert_propio ON storage.objects;
CREATE POLICY vouchers_publicidad_insert_propio
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'vouchers-publicidad'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS vouchers_publicidad_select_propio_o_admin ON storage.objects;
CREATE POLICY vouchers_publicidad_select_propio_o_admin
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'vouchers-publicidad'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.is_admin_email()
    )
  );

DROP POLICY IF EXISTS vouchers_publicidad_delete_propio_o_admin ON storage.objects;
CREATE POLICY vouchers_publicidad_delete_propio_o_admin
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'vouchers-publicidad'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.is_admin_email()
    )
  );
