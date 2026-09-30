-- El cliente (js/map.js normalizeCategoryList) trata 'todos' como comodin: un
-- recolector con esa categoria ve cualquier pedido. El servidor no lo tenia y
-- por eso un perfil legacy con 'todos' se quedaba sin pedidos, aunque la app
-- se los mostrara. Se alinea el contrato.
--
-- 'todos' solo tiene sentido en la categoria del RECOLECTOR: la de un pedido es
-- siempre un material unico y el CHECK no admite 'todos'.

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
    -- Comodin: solo del lado del recolector.
    WHEN v.c = 'todos' THEN 'todos'
    -- Codigos exactos del catalogo activo.
    WHEN v.c IN ('plastico','papel','chatarra','botellas','organico','detergentes')
      THEN v.c
    -- Sinonimos que si corresponden a un material vigente.
    WHEN v.c ~ '(papel|carton|cart[oó]n)'  THEN 'papel'
    WHEN v.c ~ '(chatarra|metal)'         THEN 'chatarra'
    WHEN v.c ~ '(organico|org[aá]nico)'   THEN 'organico'
    WHEN v.c ~ '(botell|vidrio)'          THEN 'botellas'
    WHEN v.c ~ '(plast|pl[aá]stic)'       THEN 'plastico'
    WHEN v.c ~ '(deterg|limpieza)'        THEN 'detergentes'
    -- Todo lo demas (frutas, gas, sal, afilado, agua, carbon, lena) ya no es
    -- un material de NOTIGAS. Se marca como retirado en vez de caer en otro.
    ELSE '__retirada__'
  END
  FROM v;
$function$;

REVOKE EXECUTE ON FUNCTION public.normalize_delivery_category(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_delivery_category(text) TO service_role;

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
  SELECT
    -- El recolector marco 'todos': le sirve cualquier material del catalogo.
    coalesce((SELECT bool_or(codigo = 'todos') FROM colector), false)
    OR EXISTS (
      SELECT 1
      FROM orden o
      JOIN colector d ON d.codigo = o.codigo
      WHERE o.codigo IN (SELECT codigo FROM public.notigas_catalogo_categorias())
    );
$function$;

REVOKE ALL ON FUNCTION private.driver_matches_order_category(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.driver_matches_order_category(text, text) TO authenticated, service_role;
