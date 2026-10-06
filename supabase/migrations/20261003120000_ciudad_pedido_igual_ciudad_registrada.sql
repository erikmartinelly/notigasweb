/* ==========================================================================
   CIUDAD DE PEDIDO = CIUDAD REGISTRADA  +  CATALOGO DE 9 CAPITALES Y EL ALTO
   ==========================================================================

   PARTE A) El usuario solo puede pedir recojo en la ciudad donde esta
   registrado. Antes js/orders.js mandaba AppState.get('city'), que es la
   ciudad que el usuario esta MIRANDO en el selector, no la de su perfil: un
   vecino registrado en Cochabamba podia publicar en La Paz. Ahora el servidor
   sobrescribe NEW.ciudad con profiles.ciudad e ignora lo que mande el cliente,
   asi que no se esquiva por API.

   PARTE B) El Alto pasa a ser ciudad propia con su clave 'elalto'. Antes vivia
   dentro de "La Paz / El Alto" y getCityMetroKeys() lo agrupaba con La Paz,
   asi que un recolector de una ciudad aparecia en las listas de la otra.
   ========================================================================== */


/* --- 1) Catalogo de ciudades: 9 capitales + El Alto ----------------------
   Debe crearse ANTES de guard_optional_order_insert para que la referencia
   sea inequívoca. IMMUTABLE: Postgres puede evaluarla dentro de los CHECK. */

CREATE OR REPLACE FUNCTION public.notigas_ciudad_canonica(p_ciudad text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $function$
  -- Se colapsan espacios internos para que 'El  Alto' y 'el alto' sean lo mismo.
  SELECT CASE lower(btrim(regexp_replace(p_ciudad, '\s+', ' ', 'g')))
    WHEN 'el alto'                        THEN 'elalto'
    WHEN 'elalto'                          THEN 'elalto'
    WHEN 'la paz / el alto'                THEN 'lapaz'
    WHEN 'lapaz/el alto'                   THEN 'lapaz'
    WHEN 'santa cruz de la sierra'         THEN 'santacruz'
    WHEN 'santa cruz'                      THEN 'santacruz'
    WHEN 'santacruz'                       THEN 'santacruz'
    WHEN 'sbc'                             THEN 'santacruz'
    WHEN 'cbba'                            THEN 'cochabamba'
    WHEN 'cbi'                             THEN 'cochabamba'
    WHEN 'cochabamba'                      THEN 'cochabamba'
    WHEN 'potosí'                          THEN 'potosi'
    WHEN 'potosi'                          THEN 'potosi'
    WHEN 'trinidad (beni)'                 THEN 'trinidad'
    WHEN 'trinidad'                        THEN 'trinidad'
    WHEN 'cobija (pando)'                  THEN 'cobija'
    WHEN 'cobija'                          THEN 'cobija'
    WHEN 'la paz'                          THEN 'lapaz'
    WHEN 'lp'                              THEN 'lapaz'
    WHEN 'lapaz'                           THEN 'lapaz'
    WHEN 'sucre'                           THEN 'sucre'
    WHEN 'oruro'                           THEN 'oruro'
    WHEN 'tarija'                          THEN 'tarija'
    ELSE NULL
  END;
$function$;

COMMENT ON FUNCTION public.notigas_ciudad_canonica(text) IS
  'Las 9 capitales de Bolivia mas El Alto. Devuelve NULL si la ciudad no pertenece al catalogo.';

REVOKE ALL ON FUNCTION public.notigas_ciudad_canonica(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notigas_ciudad_canonica(text) TO anon, authenticated, service_role;


/* --- 2) El pedido siempre se publica en la ciudad del perfil -------------
   La ciudad del selector (AppState.get('city')) queda descartada aqui. */

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_uid text := auth.uid()::text;
  v_cat text;
  v_tipo text;
  v_etq text;
  v_perfil_ciudad text;
BEGIN
  IF v_uid IS NULL
     OR v_uid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid::uuid) THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No se puede publicar en nombre de otra cuenta';
  END IF;

  -- Ciudad registrada del perfil: la unica fuente de verdad.
  SELECT public.notigas_ciudad_canonica(p.ciudad) INTO v_perfil_ciudad
    FROM public.profiles p
   WHERE p.id = v_uid::uuid;

  IF v_perfil_ciudad IS NULL THEN
    RAISE EXCEPTION 'Tu cuenta no tiene una ciudad de registro valida. Actualiza tu perfil para poder publicar.';
  END IF;

  NEW.estado    := 'pendiente';
  NEW.driver_id := NULL;
  NEW.visto     := false;
  NEW.ciudad    := v_perfil_ciudad;

  SELECT string_agg(DISTINCT lower(btrim(tok)), ', ') INTO v_cat
    FROM unnest(string_to_array(COALESCE(NEW.categoria, ''), ',')) AS tok
   WHERE btrim(tok) <> '';

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
                       ELSE 'Pedido de '  || COALESCE(v_etq, v_cat) END;
  ELSE
    NEW.titulo := LEFT(REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g'), 120);
  END IF;

  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.cantidad    := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
  NEW.direccion   := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono    := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);

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
$function$;

REVOKE ALL ON FUNCTION public.guard_optional_order_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_optional_order_insert() FROM anon;
GRANT EXECUTE ON FUNCTION public.guard_optional_order_insert() TO service_role;


/* --- 3) Normalizar datos existentes -------------------------------------
   NOTA: no se tocan driver_public_profiles ni driver_public_presence a mano.
   El trigger trg_sync_driver_public_profile (AFTER INSERT OR DELETE OR UPDATE
   ON choferes_habilitados) ya las resincroniza al actualizar la ficha base,
   y claves suyas son driver_profile_id = choferes_habilitados.id y
   route_id = rutas_repartidores.id, no son enlazables entre si.
   Si el catalogo no reconoce la ciudad, el registro se deja intacto para no
   perder datos: el CHECK de arriba lo impedira en escrituras futuras. */

UPDATE public.profiles p
   SET ciudad = public.notigas_ciudad_canonica(p.ciudad)
 WHERE public.notigas_ciudad_canonica(p.ciudad) IS NOT NULL
   AND p.ciudad IS DISTINCT FROM public.notigas_ciudad_canonica(p.ciudad);

UPDATE public.choferes_habilitados ch
   SET ciudad = public.notigas_ciudad_canonica(ch.ciudad)
 WHERE public.notigas_ciudad_canonica(ch.ciudad) IS NOT NULL
   AND ch.ciudad IS DISTINCT FROM public.notigas_ciudad_canonica(ch.ciudad);

UPDATE public.pedidos pd
   SET ciudad = public.notigas_ciudad_canonica(pd.ciudad)
 WHERE public.notigas_ciudad_canonica(pd.ciudad) IS NOT NULL
   AND pd.ciudad IS DISTINCT FROM public.notigas_ciudad_canonica(pd.ciudad);

UPDATE public.avisos av
   SET ciudad = public.notigas_ciudad_canonica(av.ciudad)
 WHERE public.notigas_ciudad_canonica(av.ciudad) IS NOT NULL
   AND av.ciudad IS DISTINCT FROM public.notigas_ciudad_canonica(av.ciudad);


/* --- 4) CHECK: la ciudad debe pertenecer al catalogo ---------------------
   No se anade a profiles: ahi el usuario aun puede tener el valor crudo que
   escribio el formulario, y el trigger de alta lo canonicaliza al guardar. */

ALTER TABLE public.choferes_habilitados
  DROP CONSTRAINT IF EXISTS choferes_habilitados_ciudad_catalogo_chk;
ALTER TABLE public.choferes_habilitados
  ADD CONSTRAINT choferes_habilitados_ciudad_catalogo_chk
  CHECK (public.notigas_ciudad_canonica(ciudad) IS NOT NULL);

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_ciudad_catalogo_chk;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_ciudad_catalogo_chk
  CHECK (public.notigas_ciudad_canonica(ciudad) IS NOT NULL);
