-- Bolivia: el RECOLECTOR marca VARIOS materiales y 'frutas' sale del catalogo.
--
-- Tres problemas reales que esta migracion corrige:
--
-- 1. private.can_view_order_contact / can_view_order_radar comparaban la
--    categoria del pedido con la del recolector por IGUALDAD (oc = dc). Con la
--    columna categoria guardando una lista ("plastico, papel") el recolector
--    quedaba marcado como no-coincidente y RLS le ocultaba el pedido y el
--    contacto, aunque el cliente se lo mostrara en pantalla.
--
-- 2. normalize_delivery_category convivia gas/glp/garrafa/balon y carbon/leña
--    en 'detergentes', y convertia 'botellas' en 'agua'. Eso hacia que un
--    recolector de detergentes viera pedidos de gas y que un pedido de
--    botellas se tratara como agua. Las categorias retiradas ahora devuelven
--    un marcador que NO es ningun material, asi que nunca casan de mas.
--
-- 3. 'frutas' se quita del catalogo ACTIVO (6 categorias). Se conserva en el
--    historico, que es lo que valida el CHECK de pedidos, asi que las filas
--    viejas siguen siendo validas y no hay que reescribir historial.

-- ---------------------------------------------------------------------------
-- 1. Catalogo activo: 6 categorias (5 materiales reciclables + detergentes).
--    'frutas' queda solo en el historico.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notigas_catalogo_categorias()
 RETURNS TABLE(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('plastico',     'Plastico',                  'recolector',  'recogida'),
    ('papel',        'Papel / Carton',            'recolector',  'recogida'),
    ('chatarra',     'Chatarra',                  'recolector',  'recogida'),
    ('botellas',     'Botellas Plastico / Vidrio','recolector',  'recogida'),
    ('organico',     'Organico Seleccionado',     'recolector',  'recogida'),
    ('detergentes',  'Detergentes & Limpieza',    'compra',      'compra')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$function$;

COMMENT ON FUNCTION public.notigas_catalogo_categorias() IS
  'Catalogo activo de Bolivia. Sin frutas. El historico (con frutas, sal, afilado, agua) vive en notigas_catalogo_categorias_historico().';

-- ---------------------------------------------------------------------------
-- 2. Normalizador: cada alias apunta SOLO a su material real. Las categorias
--    retiradas devuelven '__retirada__', que no esta en el catalogo activo y
--    por lo tanto no coincide con ningun pedido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_delivery_category(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  WITH v AS (
    SELECT lower(btrim(COALESCE(p_value, ''))) AS c
  )
  SELECT CASE
    -- Codigos exactos del catalogo activo.
    WHEN v.c IN ('plastico','papel','chatarra','botellas','organico','detergentes')
      THEN v.c
    -- Sinonimos que si corresponden a un material vigente.
    WHEN v.c ~ '(papel|carton|cart[oó]n)'            THEN 'papel'
    WHEN v.c ~ '(chatarra|metal)'                   THEN 'chatarra'
    WHEN v.c ~ '(organico|org[aá]nico)'             THEN 'organico'
    WHEN v.c ~ '(botell|vidrio)'                    THEN 'botellas'
    WHEN v.c ~ '(plast|pl[aá]stic)'                 THEN 'plastico'
    WHEN v.c ~ '(deterg|limpieza)'                  THEN 'detergentes'
    -- Todo lo demas (frutas, gas, sal, afilado, agua, carbon, lena) ya no es
    -- un material de NOTIGAS. Se marca como retirado en vez de caer en otro.
    ELSE '__retirada__'
  END
  FROM v;
$function$;

REVOKE EXECUTE ON FUNCTION public.normalize_delivery_category(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_delivery_category(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Match multi-material: basta con que UNO de los materiales del recolector
--    sea el material del pedido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.driver_matches_order_category(
  p_order_categoria text,
  p_driver_categoria text
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH orden AS (
    SELECT public.normalize_delivery_category(btrim(tok)) AS codigo
    FROM unnest(string_to_array(COALESCE(p_order_categoria, ''), ',')) AS tok
  ),
  colector AS (
    SELECT public.normalize_delivery_category(btrim(tok)) AS codigo
    FROM unnest(string_to_array(COALESCE(p_driver_categoria, ''), ',')) AS tok
  )
  SELECT EXISTS (
    SELECT 1
    FROM orden o
    JOIN colector d ON d.codigo = o.codigo
    WHERE o.codigo IN (SELECT codigo FROM public.notigas_catalogo_categorias())
  );
$function$;

REVOKE ALL ON FUNCTION private.driver_matches_order_category(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.driver_matches_order_category(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION private.driver_matches_order_category(text, text) IS
  'True si el pedido es de un material que el recolector marco. Ambos lados pueden ser listas separadas por coma; basta una coincidencia.';

-- ---------------------------------------------------------------------------
-- 4. Radar: match por lista de materiales en vez de igualdad.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_view_order_radar(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private', 'pg_temp'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
  d record;
  p record;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RETURN false; END IF;

  SELECT id, user_id, categoria, ciudad, estado, driver_id, requested_driver_id, driver_request_status
    INTO p FROM public.pedidos WHERE id = p_order_id;
  IF NOT FOUND OR p.user_id = v_uid OR p.driver_id IS NOT NULL OR p.estado NOT IN ('pendiente','visto') THEN RETURN false; END IF;

  -- Una solicitud dirigida es invisible para cualquier otro recolector.
  IF p.requested_driver_id IS NOT NULL
     AND (p.driver_request_status <> 'requested' OR p.requested_driver_id <> v_uid) THEN
    RETURN false;
  END IF;

  SELECT categoria, ciudad, estado_verificacion, bloqueado, estado_servicio
    INTO d FROM public.choferes_habilitados WHERE user_id = v_uid LIMIT 1;
  IF NOT FOUND OR lower(trim(coalesce(d.estado_verificacion,''))) <> 'aprobado'
     OR coalesce(d.bloqueado,false) OR coalesce(d.estado_servicio,'activo') <> 'activo'
     OR lower(trim(coalesce(d.ciudad,''))) <> lower(trim(coalesce(p.ciudad,''))) THEN RETURN false; END IF;

  RETURN private.driver_matches_order_category(p.categoria, d.categoria);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Contacto: mismo match por lista. El resto de las compuertas (ciudad,
--    baneado, estado, solicitud dirigida) queda igual.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_view_order_contact(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private', 'pg_temp'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
  d record;
  p record;
BEGIN
  IF v_uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN
    RETURN false;
  END IF;

  SELECT id, user_id, categoria, ciudad, estado, driver_id,
         requested_driver_id, driver_request_status
    INTO p FROM public.pedidos WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p.user_id = v_uid OR p.driver_id IS NOT NULL THEN RETURN false; END IF;
  IF p.estado NOT IN ('pendiente','visto') THEN RETURN false; END IF;

  IF p.requested_driver_id IS NOT NULL
     AND (p.driver_request_status <> 'requested' OR p.requested_driver_id <> v_uid) THEN
    RETURN false;
  END IF;

  SELECT categoria, ciudad, estado_verificacion, bloqueado, estado_servicio
    INTO d FROM public.choferes_habilitados WHERE user_id = v_uid LIMIT 1;
  IF NOT FOUND
     OR lower(trim(coalesce(d.estado_verificacion,''))) <> 'aprobado'
     OR coalesce(d.bloqueado, false)
     OR coalesce(d.estado_servicio,'activo') <> 'activo'
     OR lower(trim(coalesce(d.ciudad,''))) <> lower(trim(coalesce(p.ciudad,''))) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = v_uid) THEN
    RETURN false;
  END IF;

  RETURN private.driver_matches_order_category(p.categoria, d.categoria);
END;
$function$;

GRANT EXECUTE ON FUNCTION private.can_view_order_radar(uuid) TO authenticated, service_role;
