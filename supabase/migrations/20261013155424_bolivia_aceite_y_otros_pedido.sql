-- Bolivia: dos cambios de catalogo pedidos por producto.
--
-- 1. Nueva categoria de RECOGIDA 'aceite' ("Aceite de cocina usado"): el vecino
--    publica su aceite usado y el recolector lo recoge, igual que plastico o
--    papel.
-- 2. 'otros' deja de ser una peticion que solo alimentaba estadisticas
--    (public.solicitudes_otros) y pasa a ser una categoria de pedido REAL, de
--    recogida: el vecino escribe que quiere que le recojan y se publica como un
--    pedido normal en el mapa. La tabla solicitudes_otros y su panel de
--    estadisticas se conservan solo como historico; el cliente ya no escribe en
--    ella.
--
-- El catalogo activo pasa de 6 a 8 categorias. El historico tambien aprende
-- 'aceite' y deja 'otros' como recogida, porque:
--   - notigas_categoria_valida() (que respalda el CHECK
--     pedidos_categoria_catalogo_chk) valida contra el historico;
--   - notigas_categoria_activa() (que usan los triggers de escritura) valida
--     contra el activo;
--   - notigas_tipo_de_categoria('otros') debe devolver 'recogida' (deriva del
--     historico), o un pedido de otros quedaria marcado como compra.

-- -----------------------------------------------------------------------------
-- 1. Catalogo activo: 8 categorias (seis reciclables + otros + detergentes)
-- -----------------------------------------------------------------------------
create or replace function public.notigas_catalogo_categorias()
 returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 language sql
 immutable
 set search_path to ''
as $$
  select * from (values
    ('plastico',     'Plastico',                   'recolector',  'recogida'),
    ('papel',        'Papel / Carton',             'recolector',  'recogida'),
    ('chatarra',     'Chatarra',                   'recolector',  'recogida'),
    ('botellas',     'Botellas Plastico / Vidrio', 'recolector',  'recogida'),
    ('organico',     'Organico Seleccionado',      'recolector',  'recogida'),
    ('aceite',       'Aceite de cocina usado',     'recolector',  'recogida'),
    ('otros',        'Otros (a especificar)',      'recolector',  'recogida'),
    ('detergentes',  'Detergentes & Limpieza',     'compra',      'compra')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias() is
  'Catalogo activo de Bolivia: reciclaje con aceite usado, otros como pedido real y detergentes.';

-- -----------------------------------------------------------------------------
-- 2. Catalogo historico: aprende 'aceite' y pasa 'otros' a recogida
-- -----------------------------------------------------------------------------
create or replace function public.notigas_catalogo_categorias_historico()
 returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 language sql
 immutable
 set search_path to ''
as $$
  select * from (values
    ('plastico',     'Plastico',                   'recolector',   'recogida'),
    ('papel',        'Papel / Carton',             'recolector',   'recogida'),
    ('chatarra',     'Chatarra',                   'recolector',   'recogida'),
    ('botellas',     'Botellas Plastico / Vidrio', 'recolector',   'recogida'),
    ('organico',     'Organico Seleccionado',      'recolector',   'recogida'),
    ('aceite',       'Aceite de cocina usado',     'recolector',   'recogida'),
    ('frutas',       'Frutas & Verduras',          'recolector',   'recogida'),
    ('detergentes',  'Detergentes & Limpieza',     'compra',       'compra'),
    ('sal',          'Sal',                        'compra',       'compra'),
    ('afilado',      'Afilado de Cuchillos',       'compra',       'compra'),
    ('agua',         'Agua Purificada 20L',        'distribucion', 'compra'),
    ('otros',        'Otros (a especificar)',      'recolector',   'recogida')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias_historico() is
  'Catalogo historico: las retiradas mas aceite y otros (ahora de recogida). Solo lectura.';

-- -----------------------------------------------------------------------------
-- 3. Normalizador: 'aceite' y 'otros' como codigos reales; alias de aceite
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
    WHEN v.c IN ('plastico','papel','chatarra','botellas','organico','aceite','otros','detergentes')
      THEN v.c
    -- Sinonimos que si corresponden a un material vigente.
    WHEN v.c ~ '(papel|carton|cart[oó]n)'  THEN 'papel'
    WHEN v.c ~ '(chatarra|metal)'          THEN 'chatarra'
    WHEN v.c ~ '(organico|org[aá]nico)'    THEN 'organico'
    WHEN v.c ~ '(botell|vidrio)'           THEN 'botellas'
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
    'version', '20261013_aceite_y_otros_v1'
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
  v_tipo_otros text;
begin
  select count(*) into v_activas from public.notigas_catalogo_categorias();
  if v_activas <> 8 then
    raise exception 'el catalogo activo tiene % categorias, se esperaban 8', v_activas;
  end if;

  v_tipo_otros := public.notigas_tipo_de_categoria('otros');
  if v_tipo_otros <> 'recogida' then
    raise exception 'otros debe derivar como recogida, derivo %', v_tipo_otros;
  end if;

  if not public.notigas_categoria_activa('aceite') then
    raise exception 'aceite no quedo en el catalogo activo';
  end if;

  if not public.notigas_categoria_valida('aceite') or not public.notigas_categoria_valida('otros') then
    raise exception 'el CHECK de catalogo no aceptaria aceite y otros';
  end if;
end $$;
