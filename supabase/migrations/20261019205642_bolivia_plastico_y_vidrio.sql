-- Bolivia: separa "Botellas Plastico / Vidrio" en dos materiales.
--
-- Antes una sola categoria 'botellas' ('Botellas Plastico / Vidrio') mezclaba
-- el plastico (botellas PET) con el vidrio, y un recolector no podia declarar
-- que recoge solo uno de los dos. Ahora:
--   - 'plastico' sigue siendo el material plastico (incluye botellas PET);
--   - se agrega 'vidrio' como material de recogida propio.
--
-- No hay datos que migrar: ninguna fila de pedidos, pedidos_archivo,
-- choferes_habilitados, driver_public_profiles, driver_public_presence, avisos
-- ni rutas_repartidores usa la categoria 'botellas'. El catalogo historico
-- conserva 'botellas' para que cualquier fila o cliente antiguo siga valido.
--
-- Efecto sobre el CHECK pedidos_categoria_catalogo_chk: como se respalda en
-- notigas_categoria_valida() (que valida contra el historico), 'vidrio' pasa a
-- ser valido y 'botellas' sigue aceptandose como legado.

-- -----------------------------------------------------------------------------
-- 1. Catalogo activo: 'botellas' -> 'vidrio' (sigue con 8 categorias)
-- -----------------------------------------------------------------------------
create or replace function public.notigas_catalogo_categorias()
 returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 language sql
 immutable
 set search_path to ''
as $$
  select * from (values
    ('plastico',     'Plastico',                    'recolector',  'recogida'),
    ('papel',        'Papel / Carton',              'recolector',  'recogida'),
    ('chatarra',     'Chatarra',                    'recolector',  'recogida'),
    ('vidrio',       'Vidrio',                      'recolector',  'recogida'),
    ('organico',     'Organico Seleccionado',       'recolector',  'recogida'),
    ('aceite',       'Aceite de cocina usado',      'recolector',  'recogida'),
    ('otros',        'Otros (a especificar)',       'recolector',  'recogida'),
    ('detergentes',  'Detergentes & Limpieza',      'compra',      'compra')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias() is
  'Catalogo activo de Bolivia: reciclaje con vidrio separado del plastico, aceite usado, otros y detergentes.';

-- -----------------------------------------------------------------------------
-- 2. Catalogo historico: aprende 'vidrio' y conserva 'botellas' como legado
-- -----------------------------------------------------------------------------
create or replace function public.notigas_catalogo_categorias_historico()
 returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 language sql
 immutable
 set search_path to ''
as $$
  select * from (values
    ('plastico',     'Plastico',                    'recolector',   'recogida'),
    ('papel',        'Papel / Carton',              'recolector',   'recogida'),
    ('chatarra',     'Chatarra',                    'recolector',   'recogida'),
    ('vidrio',       'Vidrio',                      'recolector',   'recogida'),
    ('botellas',     'Botellas Plastico / Vidrio',  'recolector',   'recogida'),
    ('organico',     'Organico Seleccionado',       'recolector',   'recogida'),
    ('aceite',       'Aceite de cocina usado',      'recolector',   'recogida'),
    ('frutas',       'Frutas & Verduras',           'recolector',   'recogida'),
    ('detergentes',  'Detergentes & Limpieza',      'compra',       'compra'),
    ('sal',          'Sal',                         'compra',       'compra'),
    ('afilado',      'Afilado de Cuchillos',        'compra',       'compra'),
    ('agua',         'Agua Purificada 20L',         'distribucion', 'compra'),
    ('otros',        'Otros (a especificar)',       'recolector',   'recogida')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias_historico() is
  'Catalogo historico: incluye vidrio y conserva botellas (legado). Solo lectura.';

-- -----------------------------------------------------------------------------
-- 3. Normalizador: 'vidrio' como codigo real; 'botellas' -> plastico
-- -----------------------------------------------------------------------------
create or replace function public.normalize_delivery_category(p_value text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  WITH v AS (
    SELECT lower(btrim(COALESCE(p_value, ''))) AS c
  )
  SELECT CASE
    -- Comodin: solo del lado del recolector.
    WHEN v.c = 'todos' THEN 'todos'
    -- Codigos exactos del catalogo activo.
    WHEN v.c IN ('plastico','papel','chatarra','vidrio','organico','aceite','otros','detergentes')
      THEN v.c
    -- Sinonimos que si corresponden a un material vigente. El vidrio va antes
    -- que 'botell' para que "botella de vidrio" no caiga en plastico.
    WHEN v.c ~ '(vidrio|glass)'            THEN 'vidrio'
    WHEN v.c ~ '(papel|carton|cart[oó]n)'  THEN 'papel'
    WHEN v.c ~ '(chatarra|metal)'          THEN 'chatarra'
    WHEN v.c ~ '(organico|org[aá]nico)'    THEN 'organico'
    WHEN v.c ~ '(botell)'                  THEN 'plastico'
    WHEN v.c ~ '(aceit|grasa|oil)'         THEN 'aceite'
    WHEN v.c ~ '(plast|pl[aá]stic)'        THEN 'plastico'
    WHEN v.c ~ '(deterg|limpieza)'         THEN 'detergentes'
    -- Todo lo demas (frutas, gas, sal, afilado, agua, carbon, lena) ya no es un
    -- material de NOTIGAS. Se marca como retirado en vez de caer en otro.
    ELSE '__retirada__'
  END
  FROM v;
$function$;

revoke execute on function public.normalize_delivery_category(text) from public, anon, authenticated;
grant execute on function public.normalize_delivery_category(text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Contrato publico: nueva version
-- -----------------------------------------------------------------------------
create or replace function public.rpc_public_schema_contract()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'categorias', (SELECT jsonb_agg(jsonb_build_object(
                     'codigo', c.codigo, 'etiqueta', c.etiqueta,
                     'grupo', c.grupo, 'tipo_solicitud', c.tipo_solicitud)
                     ORDER BY c.codigo)
                   FROM public.notigas_catalogo_categorias() c),
    'tipos_de_solicitud', jsonb_build_array('recogida'),
    'suscripciones_recarga', true,
    'version', '20261019_plastico_y_vidrio_v1'
  ) INTO r;
  RETURN r;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Comprobacion
-- -----------------------------------------------------------------------------
do $$
declare
  v_activas integer;
begin
  select count(*) into v_activas from public.notigas_catalogo_categorias();
  if v_activas <> 8 then
    raise exception 'el catalogo activo tiene % categorias, se esperaban 8', v_activas;
  end if;

  if not public.notigas_categoria_activa('vidrio') then
    raise exception 'vidrio no quedo en el catalogo activo';
  end if;

  if public.notigas_categoria_activa('botellas') then
    raise exception 'botellas no deberia seguir en el catalogo activo';
  end if;

  if not public.notigas_categoria_valida('vidrio') then
    raise exception 'el CHECK de catalogo no aceptaria vidrio';
  end if;

  if public.notigas_categoria_valida('botellas') is not true then
    raise exception 'botellas deberia seguir siendo valido como legado';
  end if;

  if public.normalize_delivery_category('vidrio') <> 'vidrio' then
    raise exception 'normalize_delivery_category(vidrio) no devolvio vidrio';
  end if;

  if public.normalize_delivery_category('botellas') <> 'plastico' then
    raise exception 'normalize_delivery_category(botellas) no devolvio plastico';
  end if;
end $$;
