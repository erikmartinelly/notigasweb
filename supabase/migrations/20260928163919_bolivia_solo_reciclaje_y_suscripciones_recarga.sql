-- ============================================================================
-- NOTIGAS Bolivia - Solo reciclaje + suscripciones a recargas
-- ----------------------------------------------------------------------------
-- AVISO: esta migracion se aplico con una errata en la seccion 9.
-- rpc_public_schema_contract() llamaba a notigas_categorias_activas(), que no
-- existe. plpgsql no resuelve los nombres de funcion al crear el cuerpo, asi que
-- la migracion quedo registrada y el fallo solo aparecia al invocar el
-- contrato. La corrige la migracion inmediatamente posterior
-- 20260928163945_fix_contract_catalog_function_name.sql.
-- El resto del cuerpo (catalogo, validadores, guards y tabla de
-- suscripciones) se aplico correctamente y no se modifica aqui.
-- ----------------------------------------------------------------------------
-- 1. NOTIGAS deja de vender y entregar productos. Se retiran del catalogo
--    vigente seis categorias: 'frutas' (que era de recogida), 'detergentes',
--    'sal', 'afilado', 'agua' y 'otros'. Quedan cinco, todas de reciclaje:
--    plastico, papel, chatarra, botellas y organico.
-- 2. La recarga de detergentes NO es un pedido: es una suscripcion en la que
--    la vecindad se apunta para que la repansen cuando toque. Se registra en
--    su propia tabla y no entra por el flujo de pedidos ni por el mapa.
--
-- Los pedidos ya creados con las categorias retiradas NO se borran ni se
-- reescriben: siguen visibles en el historico y en las liquidaciones. Para eso
-- el catalogo se parte en dos:
--   - notigas_catalogo_categorias()        -> vigente, solo reciclaje.
--                                            Es la que ve la app y la que
--                                            restringe los pedidos nuevos.
--   - notigas_catalogo_categorias_historico() -> las once, incluidas las ya
--                                            retiradas. Mantiene válidas las
--                                            filas viejas, porque el CHECK
--                                            pedidos_categoria_catalogo_chk
--                                            se apoya en el validador
--                                            historico.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalogo vigente: unicamente reciclaje
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notigas_catalogo_categorias()
RETURNS TABLE (codigo text, etiqueta text, grupo text, tipo_solicitud text)
  LANGUAGE sql IMMUTABLE AS $$
    SELECT * FROM (VALUES
      ('plastico',     'Plastico',                  'recolector',  'recogida'),
      ('papel',        'Papel / Carton',            'recolector',  'recogida'),
      ('chatarra',     'Chatarra',                  'recolector',  'recogida'),
      ('botellas',     'Botellas Plastico / Vidrio','recolector',  'recogida'),
      ('organico',     'Organico Seleccionado',     'recolector',  'recogida')
    ) AS t(codigo, etiqueta, grupo, tipo_solicitud);
  $$;

COMMENT ON FUNCTION public.notigas_catalogo_categorias() IS
  'Catalogo vigente NOTIGAS Bolivia: solo reciclaje. Fuente de verdad del servidor.';

-- -----------------------------------------------------------------------------
-- 2. Catalogo historico: las once categorias, incluidas las retiradas
-- -----------------------------------------------------------------------------
-- Solo lectura de consulta. No la usa el front ni ninguna ruta de escritura:
-- sirve para que los pedidos antiguos sigan siendo validos y legibles.

CREATE OR REPLACE FUNCTION public.notigas_catalogo_categorias_historico()
RETURNS TABLE (codigo text, etiqueta text, grupo text, tipo_solicitud text)
  LANGUAGE sql IMMUTABLE AS $$
    SELECT * FROM (VALUES
      ('plastico',     'Plastico',                  'recolector',   'recogida'),
      ('papel',        'Papel / Carton',            'recolector',   'recogida'),
      ('chatarra',     'Chatarra',                  'recolector',   'recogida'),
      ('botellas',     'Botellas Plastico / Vidrio','recolector',   'recogida'),
      ('organico',     'Organico Seleccionado',     'recolector',   'recogida'),
      ('frutas',       'Frutas & Verduras',         'recolector',   'recogida'),
      ('detergentes',  'Detergentes & Limpieza',    'compra',       'compra'),
      ('sal',          'Sal',                       'compra',       'compra'),
      ('afilado',      'Afilado de Cuchillos',      'compra',       'compra'),
      ('agua',         'Agua Purificada 20L',       'distribucion', 'compra'),
      ('otros',        'Otros Pedidos',             'compra',       'compra')
    ) AS t(codigo, etiqueta, grupo, tipo_solicitud);
  $$;

COMMENT ON FUNCTION public.notigas_catalogo_categorias_historico() IS
  'Las 11 categorias originales. Solo para leer pedidos historicos ya publicados.';

-- -----------------------------------------------------------------------------
-- 3. Validadores
-- -----------------------------------------------------------------------------
-- notigas_categoria_valida(): el historico. Lo consulta el CHECK
--   pedidos_categoria_catalogo_chk, asi que DEBE seguir aceptando las categorias
--   retiradas o cualquier UPDATE sobre un pedido viejo (por ejemplo, cuando un
--   repartidor lo marca como entregado) fallaria la restriccion.
CREATE OR REPLACE FUNCTION public.notigas_categoria_valida(p_categoria text)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT lower(trim(COALESCE(p_categoria,''))) IN
      (SELECT codigo FROM public.notigas_catalogo_categorias_historico());
  $$;

-- notigas_categoria_activa(): el vigente. Lo usan los triggers de escritura, de
--   modo que un pedido nuevo no puede nascent con una categoria retirada.
CREATE OR REPLACE FUNCTION public.notigas_categoria_activa(p_categoria text)
  RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT lower(trim(COALESCE(p_categoria,''))) IN
      (SELECT codigo FROM public.notigas_catalogo_categorias());
  $$;

-- Tipo derivado de la categoria. En el catalogo vigente todo es 'recogida'; las
--   categorias retiradas conservan el tipo que tenian para no reescribir la
--   historia de los pedidos viejos.
CREATE OR REPLACE FUNCTION public.notigas_tipo_de_categoria(p_categoria text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT c.tipo_solicitud FROM public.notigas_catalogo_categorias_historico() c
      WHERE c.codigo = lower(trim(COALESCE(p_categoria,'')))),
    'recogida');
$$;

-- search_path explicito, como en la migracion anterior del catalogo.
alter function public.notigas_catalogo_categorias()          set search_path = '';
alter function public.notigas_catalogo_categorias_historico() set search_path = '';
alter function public.notigas_categoria_valida(text)          set search_path = '';
alter function public.notigas_categoria_activa(text)          set search_path = '';
alter function public.notigas_tipo_de_categoria(text)         set search_path = '';

REVOKE ALL ON FUNCTION public.notigas_catalogo_categorias_historico() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notigas_categoria_activa(text) FROM PUBLIC, anon;

-- -----------------------------------------------------------------------------
-- 4. pedidos.tipo_solicitud
-- -----------------------------------------------------------------------------
-- El CHECK sigue admitiendo 'compra' a proposito: quedan pedidos historicos con
-- ese valor y mientras siga admitido no hay que reescribirlos.

ALTER TABLE public.pedidos
  ALTER COLUMN tipo_solicitud SET DEFAULT 'recogida';

-- Los pedidos que siguen en curso con una categoria retirada se cierran: dejarlos
-- pendientes seria prometer una entrega que NOTIGAS ya no ofrece. Los cerrados se
-- conservan para el historico y las liquidaciones. En pedidos.estado solo
-- 'entregado' y 'cancelado' son terminales (pedidos_estado_check).
DO $$
DECLARE
  v_pendientes integer;
BEGIN
  SELECT count(*) INTO v_pendientes
    FROM public.pedidos
   WHERE categoria IN ('frutas','detergentes','sal','afilado','agua','otros')
     AND estado NOT IN ('entregado','cancelado');

  IF v_pendientes > 0 THEN
    -- guard_pedido_mutation aborta toda actualizacion sin sesion, asi que hay que
    -- abrir la valvula interna que el propio trigger reconoce. Es la misma que
    -- usan las demas migraciones de mantenimiento del repositorio.
    PERFORM set_config('notigas.internal_order_mutation', '1', true);

    UPDATE public.pedidos
       SET estado = 'cancelado'
     WHERE categoria IN ('frutas','detergentes','sal','afilado','agua','otros')
       AND estado NOT IN ('entregado','cancelado');
  END IF;

  RAISE NOTICE 'notigas: % pedido(s) con categoria retirada se cerraron por retiro del servicio',
    COALESCE(v_pendientes, 0);
END $$;

-- -----------------------------------------------------------------------------
-- 5. guard_optional_order_insert: valida contra el catalogo vigente
-- -----------------------------------------------------------------------------
-- El trigger sigue montado en public.pedidos (lo creo la migracion 054); aqui
-- solo se reemplaza el cuerpo, igual que hizo la migracion del catalogo.

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_cat text;
  v_tipo text;
  v_etq text;
BEGIN
  -- Publicar material exige cuenta verificada: no se admite material anonimo.
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_uid AND activo IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  -- El autor lo pone el servidor, nunca el cliente: asi nadie publica en nombre
  -- de otro ni reutiliza un pedido ya cobrado.
  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No se puede publicar en nombre de otra cuenta';
  END IF;

  NEW.estado     := 'pendiente';
  NEW.driver_id  := NULL;
  NEW.visto      := false;
  NEW.ciudad     := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad,''))), 80);

  v_cat := lower(trim(COALESCE(NEW.categoria,'')));
  IF v_cat = '' THEN
    v_cat := 'plastico';
  END IF;
  IF NOT public.notigas_categoria_activa(v_cat) THEN
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
                       THEN 'Recogida de ' || COALESCE(v_etq, v_cat)
                       ELSE 'Pedido de ' || COALESCE(v_etq, v_cat) END;
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

  -- Freno de publishes: sin esto, un mismo vecino podria inundar el mapa.
  PERFORM public.enforce_action_rate_limit('create_order', 8, 300);
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. El repartidor solo recoge material: su categoria debe ser de reciclaje
-- -----------------------------------------------------------------------------
-- Copia integra de la funcion, sin cambios salvo la linea del catalogo: ahora
-- valida contra las categorias vigentes, no contra las once. A los repartidores
-- ya registrados con una categoria retirada se les deja la que tienen, para no
-- alterar su historial; la app los muestra igual porque su ficha cae en "Todos".
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
    IF NOT public.notigas_categoria_activa(NEW.categoria) THEN
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


-- -----------------------------------------------------------------------------
-- 7. Suscripciones a recargas
-- -----------------------------------------------------------------------------
-- A diferencia de un pedido, esto no genera una entrega ni un cobro: es una
-- lista de vecindad interesada en que le repongan detergente (y, mas adelante,
-- otros productos de limpieza). Se guarda aparte para que la app no la mezcle
-- con el mapa ni con el trabajo de los repartidores.

CREATE TABLE IF NOT EXISTS public.suscripciones_recarga (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- uuid y no text: hace falta el mismo tipo que auth.users.id para que el
  -- ON DELETE CASCADE sea valido. Las tablas antiguas usan text porque nunca
  -- llevaron clave foranea; aqui si se quiere la cascada al borrar la cuenta.
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  producto      text NOT NULL DEFAULT 'detergente',
  zona          text,
  direccion     text,
  telefono      text,
  frecuencia    text NOT NULL DEFAULT 'quincenal'
                CHECK (frecuencia IN ('semanal','quincenal','mensual')),
  notas         text,
  estado        text NOT NULL DEFAULT 'activo'
                CHECK (estado IN ('activo','pausado','cancelado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suscripciones_recarga IS
  'Vecindad inscrita a recargas de detergente y limpieza. No es un pedido ni genera cobro.';

-- Una sola fila por persona y producto. Es una restriccion completa, no un indice
-- parcial: el alta desde la app es un upsert y PostgREST solo resuelve el
-- conflicto si encuentra un constraint UNIQUE, no un indice WHERE. Al reinscribirse
-- se reactiva la fila en vez de acumular historial de bajas.
ALTER TABLE public.suscripciones_recarga
  DROP CONSTRAINT IF EXISTS suscripciones_recarga_unica;
ALTER TABLE public.suscripciones_recarga
  DROP CONSTRAINT IF EXISTS suscripciones_recarga_user_producto_uniq;
ALTER TABLE public.suscripciones_recarga
  ADD CONSTRAINT suscripciones_recarga_user_producto_uniq
  UNIQUE (user_id, producto);

-- Indice parcial solo para el listado operativo de los vecinos que estan activos.
CREATE INDEX IF NOT EXISTS suscripciones_recarga_zona_activos
  ON public.suscripciones_recarga (zona, frecuencia)
  WHERE estado = 'activo';

CREATE OR REPLACE FUNCTION public.set_suscripciones_recarga_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suscripciones_recarga_updated_at ON public.suscripciones_recarga;
CREATE TRIGGER trg_suscripciones_recarga_updated_at
  BEFORE UPDATE ON public.suscripciones_recarga
  FOR EACH ROW EXECUTE FUNCTION public.set_suscripciones_recarga_updated_at();

-- El producto queda acotado a los que tienen sentido como recarga de limpieza.
ALTER TABLE public.suscripciones_recarga
  DROP CONSTRAINT IF EXISTS suscripciones_recarga_producto_chk;
ALTER TABLE public.suscripciones_recarga
  ADD CONSTRAINT suscripciones_recarga_producto_chk
  CHECK (producto IN ('detergente','lejia','suavizante','desinfectante','otro'));

-- -----------------------------------------------------------------------------
-- 8. RLS de las suscripciones
-- -----------------------------------------------------------------------------
-- Cada vecino ve y gestiona solo su propia suscripcion. El admin no tiene via
-- directa: el listado se hace por una funcion de servicio cuando corresponda.

ALTER TABLE public.suscripciones_recarga ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suscripciones_recarga_select_own ON public.suscripciones_recarga;
CREATE POLICY suscripciones_recarga_select_own ON public.suscripciones_recarga
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS suscripciones_recarga_insert_own ON public.suscripciones_recarga;
CREATE POLICY suscripciones_recarga_insert_own ON public.suscripciones_recarga
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS suscripciones_recarga_update_own ON public.suscripciones_recarga;
CREATE POLICY suscripciones_recarga_update_own ON public.suscripciones_recarga
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS suscripciones_recarga_delete_own ON public.suscripciones_recarga;
CREATE POLICY suscripciones_recarga_delete_own ON public.suscripciones_recarga
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 9. Contrato publico: el catalogo ya no anuncia compra
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_public_schema_contract()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'categorias',            (SELECT jsonb_agg(jsonb_build_object(
                                 'codigo', c.codigo, 'etiqueta', c.etiqueta,
                                 'grupo', c.grupo, 'tipo_solicitud', c.tipo_solicitud)
                                 ORDER BY c.codigo)
                               FROM public.notigas_catalogo_categorias() c),
    'tipos_de_solicitud',    jsonb_build_array('recogida'),
    'suscripciones_recarga', true,
    'version',               '20260927_bolivia_solo_reciclaje_v1'
  ) INTO r;
  RETURN r;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. Comprobacion
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_activas integer;
  v_obsoletas integer;
BEGIN
  SELECT count(*) INTO v_activas
    FROM public.notigas_catalogo_categorias() c
   WHERE NOT public.notigas_categoria_activa(c.codigo);
  IF v_activas <> 0 THEN
    RAISE EXCEPTION 'el catalogo vigente incluye categorias no activas: %', v_activas;
  END IF;

  SELECT count(*) INTO v_obsoletas
    FROM public.pedidos
   WHERE NOT public.notigas_categoria_activa(categoria)
     AND categoria NOT IN (SELECT codigo FROM public.notigas_catalogo_categorias_historico());
  IF v_obsoletas <> 0 THEN
    RAISE EXCEPTION 'quedan % pedidos con una categoria fuera de todo catalogo', v_obsoletas;
  END IF;

  RAISE NOTICE 'notigas: % categorias vigentes, solo reciclaje',
    (SELECT count(*) FROM public.notigas_catalogo_categorias());
END $$;
