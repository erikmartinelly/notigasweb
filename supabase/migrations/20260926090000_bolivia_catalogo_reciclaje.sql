/* ===========================================================================
   NOTIGAS Bolivia — Catalogo de reciclaje + tipo de solicitud
   ---------------------------------------------------------------------------
   1. Catalogo canonico de 11 categorias. Se retiran 'gas' y 'carbon'.
   2. pedidos.tipo_solicitud: 'recogida' (la casa ofrece material y el
      repartidor lo recoge) vs 'compra' (el comprador pide que le lleven).
      El servidor lo DERIVA de la categoria: el cliente no puede declararlo.
   3. Se neutralizan los defaults financieros del modelo peruano (S/0,20 por
      pedido, ciclo de S/50, 100 pedidos gratis, limite de 250, precio del
      balon de gas). El front ya declaraba tipo_plan='sin_comision', pero el
      trigger lo sobrescribia a 'credito' con los montos peruanos.
   4. normalize_delivery_category convivia 'botellas' en 'agua' por el
      patron '(agua|botell)': un pedido de Botellas se clasificaba como Agua.
   =========================================================================== */

BEGIN;

/* ---------------------------------------------------------------- catalogo */

CREATE OR REPLACE FUNCTION public.notigas_catalogo_categorias()
RETURNS TABLE (codigo text, etiqueta text, grupo text, tipo_solicitud text)
LANGUAGE sql IMMUTABLE AS $$
  SELECT * FROM (VALUES
    ('plastico',     'Plastico',                  'recolector',  'recogida'),
    ('papel',        'Papel / Carton',            'recolector',  'recogida'),
    ('chatarra',     'Chatarra',                  'recolector',  'recogida'),
    ('botellas',     'Botellas Plastico / Vidrio','recolector',  'recogida'),
    ('organico',     'Organico Seleccionado',     'recolector',  'recogida'),
    ('frutas',       'Frutas & Verduras',         'recolector',  'recogida'),
    ('detergentes',  'Detergentes & Limpieza',    'compra',      'compra'),
    ('sal',          'Sal',                       'compra',      'compra'),
    ('afilado',      'Afilado de Cuchillos',      'compra',      'compra'),
    ('agua',         'Agua Purificada 20L',       'distribucion','compra'),
    ('otros',        'Otros Pedidos',             'compra',      'compra')
  ) AS t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

COMMENT ON FUNCTION public.notigas_catalogo_categorias() IS
  'Catalogo canonico NOTIGAS Bolivia. Fuente de verdad del servidor.';

CREATE OR REPLACE FUNCTION public.notigas_categoria_valida(p_categoria text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT lower(trim(COALESCE(p_categoria,''))) IN (SELECT codigo FROM public.notigas_catalogo_categorias());
$$;

/* Tipo de solicitud derivado de la categoria. Reciclaje = la casa ofrece
   material y el repartidor va a recogerlo. El resto = compra. */
CREATE OR REPLACE FUNCTION public.notigas_tipo_de_categoria(p_categoria text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT c.tipo_solicitud FROM public.notigas_catalogo_categorias() c
      WHERE c.codigo = lower(trim(COALESCE(p_categoria,'')))),
    'compra');
$$;

/* ------------------------------------------------- pedidos.tipo_solicitud */

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_solicitud text NOT NULL DEFAULT 'compra';

/* Backfill ANTES de activar las restricciones: los pedidos historicos que
   usaban gas/carbon se remapean a la categoria vigente mas cercana. */
UPDATE public.pedidos SET categoria = 'detergentes'
 WHERE NOT public.notigas_categoria_valida(categoria);

UPDATE public.pedidos p
   SET tipo_solicitud = public.notigas_tipo_de_categoria(p.categoria)
 WHERE p.tipo_solicitud IS DISTINCT FROM public.notigas_tipo_de_categoria(p.categoria);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pedidos_tipo_solicitud_chk'
       AND conrelid = 'public.pedidos'::regclass) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_tipo_solicitud_chk
      CHECK (tipo_solicitud IN ('compra','recogida'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pedidos_categoria_catalogo_chk'
       AND conrelid = 'public.pedidos'::regclass) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_categoria_catalogo_chk
      CHECK (public.notigas_categoria_valida(categoria));
  END IF;
END $$;

/* Indice para el filtro por tipo en el mapa y en la lista del repartidor. */
CREATE INDEX IF NOT EXISTS idx_pedidos_tipo_solicitud
  ON public.pedidos (tipo_solicitud, estado, created_at DESC);

/* ------------------------------------------- guards: catalogo y sin cobros */

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_cat  text;
  v_tipo text;
  v_etq  text;
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR public.is_banned() THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  NEW.user_id    := v_uid;
  NEW.estado     := 'pendiente';
  NEW.driver_id  := NULL;
  NEW.visto      := false;
  NEW.ciudad     := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad,''))), 80);

  v_cat := lower(trim(COALESCE(NEW.categoria,'')));
  IF v_cat = '' THEN
    v_cat := 'plastico';
  END IF;
  IF NOT public.notigas_categoria_valida(v_cat) THEN
    RAISE EXCEPTION 'Categoria fuera del catalogo NOTIGAS Bolivia: %', v_cat;
  END IF;
  NEW.categoria := v_cat;

  -- El tipo de solicitud lo decide el servidor a partir de la categoria.
  v_tipo := public.notigas_tipo_de_categoria(v_cat);
  NEW.tipo_solicitud := v_tipo;

  SELECT c.etiqueta INTO v_etq
    FROM public.notigas_catalogo_categorias() c WHERE c.codigo = v_cat;

  IF NEW.titulo IS NULL OR TRIM(NEW.titulo) = '' THEN
    NEW.titulo := CASE WHEN v_tipo = 'recogida'
                       THEN 'Recogida de ' || v_etq
                       ELSE 'Pedido de ' || v_etq END;
  ELSE
    NEW.titulo := LEFT(REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g'), 120);
  END IF;

  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion,''), '<[^>]*>', '', 'g'), 2000);
  NEW.cantidad    := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad,'1 unidad'), '<[^>]*>', '', 'g'), 60);
  NEW.direccion   := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion,''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono    := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono,''), '[^0-9+ ()-]', '', 'g'), 24);

  -- Contrato Bolivia: NOTIGAS no cobra por generar, asignar ni entregar.
  -- Se anula cualquier monto que llegue del cliente.
  NEW.comision_entrega    := 0;
  NEW.comision_registrada := false;

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

/* El alta de repartidor ya no debe resucitar el modelo de cobros peruano. */
CREATE OR REPLACE FUNCTION public.guard_driver_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_admin_email() OR current_setting('notigas.internal_driver_finance',true)='1' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Ficha de repartidor no autorizada';
  END IF;

  IF TG_OP='INSERT' THEN
    NEW.estado_verificacion:='aprobado'; NEW.es_premium:=false; NEW.premium_vence_at:=NULL;
    NEW.comprobante_pago_url:=NULL; NEW.comprobante_fecha:=NULL; NEW.estado_pago_premium:='ninguno';
    NEW.ocr_monto:=NULL; NEW.ocr_app:=NULL; NEW.ocr_operacion:=NULL; NEW.ocr_valido:=false;
    NEW.ocr_raw_text:=NULL; NEW.bloqueado:=false; NEW.motivo_bloqueo:=NULL;

    -- Sin plan de credito, sin comision, sin promo, sin precio de gas.
    NEW.tipo_plan:='sin_comision';
    NEW.comision_por_pedido:=0;
    NEW.comisiones_pendientes:=0;
    NEW.total_comisiones_pagadas:=0;
    NEW.limite_credito:=0;
    NEW.limite_pedidos_credito:=0;
    NEW.limite_botellones_credito:=0;
    NEW.botellones_credito_ciclo:=0;
    NEW.pedidos_credito_ciclo:=0;
    NEW.promo_pedidos_gratis_total:=0;
    NEW.promo_pedidos_gratis_usados:=0;
    NEW.remesas_confirmadas:=0;
    NEW.precio_balon_10kg:=NULL;
    NEW.estado_servicio:='activo';
    NEW.ultimo_corte_semanal:=NULL;
    NEW.pedidos_entregados_total:=COALESCE(NEW.pedidos_entregados_total,0);
    NEW.botellones_entregados_total:=COALESCE(NEW.botellones_entregados_total,0);

    -- La categoria del repartidor debe pertenecer al catalogo vigente.
    IF NOT public.notigas_categoria_valida(NEW.categoria) THEN
      NEW.categoria := 'plastico';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion
     OR NEW.es_premium IS DISTINCT FROM OLD.es_premium
     OR NEW.premium_vence_at IS DISTINCT FROM OLD.premium_vence_at
     OR NEW.comprobante_pago_url IS DISTINCT FROM OLD.comprobante_pago_url
     OR NEW.comprobante_fecha IS DISTINCT FROM OLD.comprobante_fecha
     OR NEW.estado_pago_premium IS DISTINCT FROM OLD.estado_pago_premium
     OR NEW.ocr_monto IS DISTINCT FROM OLD.ocr_monto
     OR NEW.ocr_app IS DISTINCT FROM OLD.ocr_app
     OR NEW.ocr_operacion IS DISTINCT FROM OLD.ocr_operacion
     OR NEW.ocr_valido IS DISTINCT FROM OLD.ocr_valido
     OR NEW.ocr_raw_text IS DISTINCT FROM OLD.ocr_raw_text
     OR NEW.tipo_plan IS DISTINCT FROM OLD.tipo_plan
     OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado
     OR NEW.motivo_bloqueo IS DISTINCT FROM OLD.motivo_bloqueo
     OR NEW.comisiones_pendientes IS DISTINCT FROM OLD.comisiones_pendientes
     OR NEW.limite_credito IS DISTINCT FROM OLD.limite_credito
     OR NEW.estado_servicio IS DISTINCT FROM OLD.estado_servicio
     OR NEW.ultimo_corte_semanal IS DISTINCT FROM OLD.ultimo_corte_semanal
     OR NEW.total_comisiones_pagadas IS DISTINCT FROM OLD.total_comisiones_pagadas
     OR NEW.promo_pedidos_gratis_total IS DISTINCT FROM OLD.promo_pedidos_gratis_total
     OR NEW.promo_pedidos_gratis_usados IS DISTINCT FROM OLD.promo_pedidos_gratis_usados
     OR NEW.pedidos_credito_ciclo IS DISTINCT FROM OLD.pedidos_credito_ciclo
     OR NEW.pedidos_entregados_total IS DISTINCT FROM OLD.pedidos_entregados_total
     OR NEW.comision_por_pedido IS DISTINCT FROM OLD.comision_por_pedido
     OR NEW.limite_pedidos_credito IS DISTINCT FROM OLD.limite_pedidos_credito
     OR NEW.botellones_credito_ciclo IS DISTINCT FROM OLD.botellones_credito_ciclo
     OR NEW.botellones_entregados_total IS DISTINCT FROM OLD.botellones_entregados_total
     OR NEW.limite_botellones_credito IS DISTINCT FROM OLD.limite_botellones_credito
     OR NEW.remesas_confirmadas IS DISTINCT FROM OLD.remesas_confirmadas
     OR NEW.precio_balon_10kg IS DISTINCT FROM OLD.precio_balon_10kg THEN
    RAISE EXCEPTION 'Campos financieros o de control son administrados por el servidor';
  END IF;
  RETURN NEW;
END;
$$;

/* ------------------------------- habilitacion: sin Puertas de credito S/50 */

CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(
  p_ciudad   text DEFAULT NULL,
  p_categoria text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id=(SELECT auth.uid())::text
      AND lower(trim(coalesce(ch.estado_verificacion,'')))='aprobado'
      AND coalesce(ch.bloqueado,false)=false
      AND coalesce(ch.estado_servicio,'activo')='activo'
      AND (p_ciudad IS NULL OR lower(trim(ch.ciudad))=lower(trim(p_ciudad)))
      AND (p_categoria IS NULL
           OR lower(trim(ch.categoria))=lower(trim(p_categoria))
           OR (lower(trim(ch.categoria))='agua'
               AND lower(trim(p_categoria)) IN ('agua','agua potable','botellon','botellón')))
      AND NOT EXISTS(SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id=ch.user_id)
  );
$$;

/* --------- normalizacion: 'botellas' es una categoria, no sinonimo de agua */

CREATE OR REPLACE FUNCTION public.normalize_delivery_category(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(trim(COALESCE(p_value,''))) IN ('botellas','botella','plastic-botellas','plastico','plástico')
      THEN lower(trim(COALESCE(p_value,'')))
    WHEN lower(trim(COALESCE(p_value,''))) ~ '(agua|botell[oó]n)' THEN 'agua'
    WHEN lower(trim(COALESCE(p_value,''))) ~ '(gas|glp|garrafa|bal[oó]n)' THEN 'detergentes'
    WHEN lower(trim(COALESCE(p_value,''))) ~ '(carbon|carb[oó]n|le[ñn]a)' THEN 'detergentes'
    ELSE lower(trim(COALESCE(p_value,'')))
  END
$$;

/* ----------------------------------------- defaults financieros a cero/BOB */

ALTER TABLE public.choferes_habilitados
  ALTER COLUMN comision_por_pedido       SET DEFAULT 0,
  ALTER COLUMN comisiones_pendientes     SET DEFAULT 0,
  ALTER COLUMN total_comisiones_pagadas  SET DEFAULT 0,
  ALTER COLUMN limite_credito            SET DEFAULT 0,
  ALTER COLUMN limite_pedidos_credito    SET DEFAULT 0,
  ALTER COLUMN limite_botellones_credito SET DEFAULT 0,
  ALTER COLUMN botellones_credito_ciclo  SET DEFAULT 0,
  ALTER COLUMN pedidos_credito_ciclo     SET DEFAULT 0,
  ALTER COLUMN promo_pedidos_gratis_total SET DEFAULT 0,
  ALTER COLUMN promo_pedidos_gratis_usados SET DEFAULT 0,
  ALTER COLUMN remesas_confirmadas       SET DEFAULT 0,
  ALTER COLUMN precio_balon_10kg         SET DEFAULT NULL,
  ALTER COLUMN tipo_plan                 SET DEFAULT 'sin_comision';

ALTER TABLE public.pedidos
  ALTER COLUMN comision_entrega SET DEFAULT 0;

UPDATE public.choferes_habilitados SET
  comision_por_pedido         = 0,
  comisiones_pendientes       = 0,
  total_comisiones_pagadas    = 0,
  limite_credito              = 0,
  limite_pedidos_credito      = 0,
  limite_botellones_credito   = 0,
  botellones_credito_ciclo    = 0,
  pedidos_credito_ciclo       = 0,
  promo_pedidos_gratis_total  = 0,
  promo_pedidos_gratis_usados = 0,
  remesas_confirmadas         = 0,
  precio_balon_10kg           = NULL,
  tipo_plan                   = 'sin_comision'
 WHERE comision_por_pedido IS DISTINCT FROM 0
    OR limite_credito IS DISTINCT FROM 0
    OR promo_pedidos_gratis_total IS DISTINCT FROM 0
    OR tipo_plan IS DISTINCT FROM 'sin_comision'
    OR precio_balon_10kg IS NOT NULL;

UPDATE public.pedidos SET comision_entrega = 0 WHERE comision_entrega IS DISTINCT FROM 0;

/* ------------------------------------------- contrato publico del esquema */

CREATE OR REPLACE FUNCTION public.rpc_public_schema_contract()
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'ok',                    true,
    'pais',                  'BO',
    'ciudad_predeterminada', 'cochabamba',
    'moneda',                'BOB',
    'modelo_de_pago',        'qr_local_entre_las_partes',
    'tablas_de_cobros',      'ninguna',
    'comision_por_pedido',   0,
    'limite_de_credito',     0,
    'pedidos_gratis',        0,
    'precio_de_balon',       NULL,
    'contacto_del_repartidor_visible', true,
    'categorias',            (SELECT jsonb_agg(jsonb_build_object(
                                 'codigo', c.codigo, 'etiqueta', c.etiqueta,
                                 'grupo', c.grupo, 'tipo_solicitud', c.tipo_solicitud)
                                 ORDER BY c.codigo)
                              FROM public.notigas_catalogo_categorias() c),
    'tipos_de_solicitud',    (SELECT jsonb_agg(t ORDER BY t) FROM (VALUES ('compra'),('recogida')) v(t)),
    'version',               '20260926_bolivia_reciclaje_v1'
  ) INTO r;
  RETURN r;
END;
$$;

COMMIT;
