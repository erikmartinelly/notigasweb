-- =============================================================================
-- Bolivia: retira "Organico Seleccionado" y "Aceite de cocina usado"
-- =============================================================================
-- Producto: esas dos opciones ya no se ofrecen ni en la ficha del recolector
-- ni en la ficha de pedido del vecino. El catalogo activo pasa de 8 a 6
-- categorias:
--
--   plastico, papel, chatarra, vidrio, otros, detergentes
--
-- Que NO se toca:
--   - notigas_catalogo_categorias_historico() sigue incluyendo 'organico' y
--     'aceite'. Es lo que respalda pedidos_categoria_catalogo_chk, asi que los
--     pedidos ya publicados con esos materiales siguen siendo validos como
--     registro historico.
--   - normalize_delivery_category() conserva sus alias. Al no estar en el
--     catalogo activo, driver_matches_order_category() ya no los empareja
--     porque exige que el codigo pertenezca al catalogo vigente.
--   - La validacion de escritura (guard_optional_order_insert) usa
--     notigas_categoria_activa(): desde esta migracion rechaza pedidos nuevos
--     con 'organico' o 'aceite'.
--
-- Los pedidos EN CURSO que solo contienen materiales retirados se cancelan,
-- igual que hizo la migracion del retiro anterior: dejarlos pendientes seria
-- prometer una recogida que NOTIGAS ya no ofrece. Los pedidos mixtos (por
-- ejemplo 'plastico, aceite') se conservan porque el recolector si puede
-- cumplir la parte vigente.

-- -----------------------------------------------------------------------------
-- 1. Catalogo activo: 8 -> 6 categorias
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
    ('otros',        'Otros (a especificar)',       'recolector',  'recogida'),
    ('detergentes',  'Detergentes & Limpieza',      'compra',      'compra')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias() is
  'Catalogo activo de Bolivia: reciclaje con vidrio separado del plastico, otros y detergentes. Sin organico ni aceite usado.';

-- -----------------------------------------------------------------------------
-- 2. Cierre de pedidos en curso que solo piden materiales retirados
-- -----------------------------------------------------------------------------
do $$
declare
  v_pendientes integer;
begin
  select count(*) into v_pendientes
    from public.pedidos p
   where p.estado not in ('entregado', 'cancelado')
     and exists (
       select 1
         from unnest(string_to_array(coalesce(p.categoria, ''), ',')) as tok
        where lower(btrim(tok)) in ('organico', 'aceite')
     )
     -- Solo si NINGUN material del pedido sigue vigente.
     and not exists (
       select 1
         from unnest(string_to_array(coalesce(p.categoria, ''), ',')) as tok
        where lower(btrim(tok)) in (select codigo from public.notigas_catalogo_categorias())
     );

  if v_pendientes > 0 then
    -- guard_pedido_mutation aborta toda actualizacion sin sesion: se abre la
    -- misma valvula interna que usan las demas migraciones de mantenimiento.
    perform set_config('notigas.internal_order_mutation', '1', true);

    update public.pedidos p
       set estado = 'cancelado'
     where p.estado not in ('entregado', 'cancelado')
       and exists (
         select 1
           from unnest(string_to_array(coalesce(p.categoria, ''), ',')) as tok
          where lower(btrim(tok)) in ('organico', 'aceite')
       )
       and not exists (
         select 1
           from unnest(string_to_array(coalesce(p.categoria, ''), ',')) as tok
          where lower(btrim(tok)) in (select codigo from public.notigas_catalogo_categorias())
       );
  end if;

  raise notice 'notigas: % pedido(s) de materiales retirados se cancelaron',
    coalesce(v_pendientes, 0);
end $$;

-- -----------------------------------------------------------------------------
-- 3. Contrato publico: nueva version
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
    'version', '20261105_retira_organico_y_aceite_v1'
  ) INTO r;
  RETURN r;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Comprobacion
-- -----------------------------------------------------------------------------
do $$
declare
  v_activas integer;
begin
  select count(*) into v_activas from public.notigas_catalogo_categorias();
  if v_activas <> 6 then
    raise exception 'el catalogo activo tiene % categorias, se esperaban 6', v_activas;
  end if;

  if public.notigas_categoria_activa('organico') then
    raise exception 'organico no deberia seguir en el catalogo activo';
  end if;

  if public.notigas_categoria_activa('aceite') then
    raise exception 'aceite no deberia seguir en el catalogo activo';
  end if;

  -- El historico tiene que seguir aceptando los pedidos antiguos.
  if not public.notigas_categoria_valida('organico') then
    raise exception 'el catalogo historico debe conservar organico';
  end if;

  if not public.notigas_categoria_valida('aceite') then
    raise exception 'el catalogo historico debe conservar aceite';
  end if;

  if not public.notigas_categoria_activa('vidrio')
     or not public.notigas_categoria_activa('detergentes') then
    raise exception 'las categorias vigentes no quedaron activas';
  end if;
end $$;
