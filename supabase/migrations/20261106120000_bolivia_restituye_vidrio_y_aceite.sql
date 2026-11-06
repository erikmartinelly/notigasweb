-- =============================================================================
-- Bolivia: restituye "Vidrio" y "Aceite de cocina usado"
-- =============================================================================
-- Producto: vuelven al catalogo las dos recogidas que se habian retirado en
-- 2026-11. El catalogo activo pasa de 4 a 6 categorias:
--
--   plastico, papel, chatarra, vidrio, aceite, otros
--
-- Las seis son de recogida. 'detergentes' (recarga) sigue retirada y por eso no
-- queda ninguna categoria de compra. 'organico' tambien sigue retirada.
--
-- Que NO se toca:
--   - notigas_catalogo_categorias_historico() ya conserva 'vidrio', 'aceite',
--     'organico' y 'detergentes'. Es lo que respalda pedidos_categoria_catalogo_chk,
--     asi que los pedidos ya publicados siguen siendo validos como historico.
--   - normalize_delivery_category() y notigas_tipo_de_categoria() ya resuelven
--     'vidrio' y 'aceite' desde el catalogo historico.
--   - Los pedidos que las migraciones anteriores cancelaron por pedir solo
--     materiales retirados siguen cancelados: esta migracion no reabre pedidos,
--     solo vuelve a ofrecer los materiales.
--
-- La validacion de escritura (guard_optional_order_insert) usa
-- notigas_categoria_activa(): desde esta migracion vuelve a aceptar pedidos
-- nuevos con 'vidrio' o 'aceite'.

-- -----------------------------------------------------------------------------
-- 1. Catalogo activo: 4 -> 6 categorias
-- -----------------------------------------------------------------------------
create or replace function public.notigas_catalogo_categorias()
 returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 language sql
 immutable
 set search_path to ''
as $$
  select * from (values
    ('plastico',  'Plastico',                    'recolector', 'recogida'),
    ('papel',     'Papel / Carton',              'recolector', 'recogida'),
    ('chatarra',  'Chatarra',                    'recolector', 'recogida'),
    ('vidrio',    'Vidrio',                      'recolector', 'recogida'),
    ('aceite',    'Aceite de cocina usado',      'recolector', 'recogida'),
    ('otros',     'Otros (a especificar)',       'recolector', 'recogida')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias() is
  'Catalogo activo de Bolivia: recogida de plastico, papel, chatarra, vidrio, aceite usado y otros. Sin organico ni detergentes.';

-- -----------------------------------------------------------------------------
-- 2. Contrato publico: nueva version
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
    'suscripciones_recarga', false,
    'version', '20261106_restituye_vidrio_y_aceite_v1'
  ) INTO r;
  RETURN r;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Comprobacion
-- -----------------------------------------------------------------------------
do $$
declare
  v_activas integer;
begin
  select count(*) into v_activas from public.notigas_catalogo_categorias();
  if v_activas <> 6 then
    raise exception 'el catalogo activo tiene % categorias, se esperaban 6', v_activas;
  end if;

  if not public.notigas_categoria_activa('vidrio') then
    raise exception 'vidrio deberia volver al catalogo activo';
  end if;

  if not public.notigas_categoria_activa('aceite') then
    raise exception 'aceite deberia volver al catalogo activo';
  end if;

  if public.notigas_categoria_activa('organico') then
    raise exception 'organico no deberia seguir en el catalogo activo';
  end if;

  if public.notigas_categoria_activa('detergentes') then
    raise exception 'detergentes no deberia seguir en el catalogo activo';
  end if;

  -- El historico tiene que seguir aceptando los pedidos antiguos.
  if not public.notigas_categoria_valida('organico') then
    raise exception 'el catalogo historico debe conservar organico';
  end if;

  if not public.notigas_categoria_valida('detergentes') then
    raise exception 'el catalogo historico debe conservar detergentes';
  end if;

  if not public.notigas_categoria_activa('plastico')
     or not public.notigas_categoria_activa('papel')
     or not public.notigas_categoria_activa('chatarra')
     or not public.notigas_categoria_activa('otros') then
    raise exception 'las categorias vigentes no quedaron activas';
  end if;
end $$;
