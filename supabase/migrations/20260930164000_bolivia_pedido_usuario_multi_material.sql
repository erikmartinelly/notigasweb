-- Bolivia: Soporte de seleccion multiple de materiales en pedidos de usuario.
--
-- Permite que los pedidos creados por usuarios contengan varios materiales a
-- recolectar separados por coma (ej: 'plastico, papel, botellas').
--
-- 1. notigas_categoria_activa y notigas_categoria_valida ahora validan que todos
--    los elementos de la lista pertenezcan al catalogo.
-- 2. notigas_tipo_de_categoria determina el tipo de solicitud para listas.
-- 3. guard_optional_order_insert normaliza y concatena los codigos seleccionados.

CREATE OR REPLACE FUNCTION public.notigas_categoria_activa(p_categoria text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH tokens AS (
    SELECT lower(btrim(tok)) AS codigo
    FROM unnest(string_to_array(COALESCE(p_categoria, ''), ',')) AS tok
    WHERE btrim(tok) <> ''
  )
  SELECT EXISTS (SELECT 1 FROM tokens)
     AND NOT EXISTS (
       SELECT 1 FROM tokens t
       WHERE t.codigo NOT IN (SELECT codigo FROM public.notigas_catalogo_categorias())
     );
$$;

CREATE OR REPLACE FUNCTION public.notigas_categoria_valida(p_categoria text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH tokens AS (
    SELECT lower(btrim(tok)) AS codigo
    FROM unnest(string_to_array(COALESCE(p_categoria, ''), ',')) AS tok
    WHERE btrim(tok) <> ''
  )
  SELECT EXISTS (SELECT 1 FROM tokens)
     AND NOT EXISTS (
       SELECT 1 FROM tokens t
       WHERE t.codigo NOT IN (SELECT codigo FROM public.notigas_catalogo_categorias_historico())
     );
$$;

CREATE OR REPLACE FUNCTION public.notigas_tipo_de_categoria(p_categoria text)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH tokens AS (
    SELECT lower(btrim(tok)) AS codigo
    FROM unnest(string_to_array(COALESCE(p_categoria, ''), ',')) AS tok
    WHERE btrim(tok) <> ''
  ),
  tipos AS (
    SELECT COALESCE(c.tipo_solicitud, 'recogida') AS tipo
    FROM tokens t
    LEFT JOIN public.notigas_catalogo_categorias_historico() c ON c.codigo = t.codigo
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM tipos WHERE tipo = 'recogida') THEN 'recogida'
    ELSE 'compra'
  END;
$$;

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid text := auth.uid()::text;
  v_cat text;
  v_tipo text;
  v_etq text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_uid AND activo IS NOT FALSE
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
