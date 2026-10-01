-- ============================================================================
-- CORRECCION: operator does not exist: uuid == text al publicar un pedido
-- ============================================================================
-- Al insertar en public.pedidos se dispara trg_050_limit_pedidos ->
-- public.guard_optional_order_insert(). Esa funcion declara el uid como text
-- (v_uid text := auth.uid()::text) y luego lo compara contra
-- public.profiles.id, que es uuid:
--
--   SELECT 1 FROM public.profiles WHERE id = v_uid AND activo IS NOT FALSE
--
-- Postgres no resuelve uuid = text y aborta el INSERT con
-- "operator does not exist: uuid == text", dejando al usuario sin poder
-- publicar ningun pedido (ni de compra ni de recogida).
--
-- La correccion castea v_uid a uuid, pero antes valida el formato para que un
-- valor no-uuid provoque el mismo "Cuenta no autorizada" en vez de un
-- "invalid input syntax for type uuid" mas dificil de entender.
--
-- public.pedidos.user_id y public.pedidos.driver_id SI son text, por eso la
-- comparacion NEW.user_id IS DISTINCT FROM v_uid se mantiene sin cambios.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_cat text;
  v_tipo text;
  v_etq text;
BEGIN
  IF v_uid IS NULL
     OR v_uid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
        WHERE id = v_uid::uuid AND activo IS NOT FALSE
     ) THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No se puede publicar en nombre de otra cuenta';
  END IF;

  NEW.estado     := 'pendiente';
  NEW.driver_id  := NULL;
  NEW.visto      := false;
  NEW.ciudad     := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad,''))), 80);

  SELECT string_agg(codigo, ', ') INTO v_cat
  FROM (
    SELECT DISTINCT lower(btrim(tok)) AS codigo
    FROM unnest(string_to_array(COALESCE(NEW.categoria,''), ',')) AS tok
    WHERE btrim(tok) <> ''
  ) s;

  IF v_cat IS NULL OR v_cat = '' THEN
    v_cat := 'plastico';
  END IF;

  IF NOT public.notigas_categoria_activa(v_cat) THEN
    RAISE EXCEPTION 'Categoria fuera del catalogo NOTIGAS Bolivia: %', v_cat;
  END IF;
  NEW.categoria := v_cat;

  v_tipo := public.notigas_tipo_de_categoria(v_cat);
  NEW.tipo_solicitud := v_tipo;

  SELECT string_agg(c.etiqueta, ' / ') INTO v_etq
    FROM public.notigas_catalogo_categorias() c
   WHERE c.codigo IN (
     SELECT lower(btrim(tok)) FROM unnest(string_to_array(v_cat, ',')) tok
   );

  IF NEW.titulo IS NULL OR TRIM(NEW.titulo) = '' THEN
    NEW.titulo := CASE WHEN v_tipo = 'recogida'
                       THEN 'Recogida de ' || COALESCE(v_etq, v_cat)
                       ELSE 'Pedido de ' || COALESCE(v_etq, v_cat) END;
  ELSE
    NEW.titulo := LEFT(REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g'), 120);
  END IF;

  -- El detalle del pedido es OPCIONAL: si viene vacio o nulo se guarda como ''
  -- y el pedido se publica igual.
  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion,''), '<[^>]*>', '', 'g'), 2000);
  NEW.cantidad    := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad,'1 unidad'), '<[^>]*>', '', 'g'), 60);
  NEW.direccion   := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion,''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono    := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono,''), '[^0-9+ ()-]', '', 'g'), 24);

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