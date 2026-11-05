-- =============================================================================
-- Bolivia: retira "Vidrio" y "Recarga de Detergentes"
-- =============================================================================
-- Producto: el catalogo queda solo con recogida de reciclables:
--
--   plastico, papel, chatarra, otros
--
-- 'otros' sigue siendo un pedido real de recogida con descripcion libre. Al
-- retirarse detergentes ya no queda ninguna categoria de compra.
--
-- Que NO se toca:
--   - notigas_catalogo_categorias_historico() conserva 'vidrio' y
--     'detergentes' (ademas de organico, aceite y botellas). Es lo que respalda
--     pedidos_categoria_catalogo_chk, asi que los pedidos ya publicados siguen
--     siendo validos como registro historico.
--   - normalize_delivery_category() y notigas_tipo_de_categoria() siguen
--     resolviendo las categorias historicas para no romper filas antiguas.
--   - La validacion de escritura (guard_optional_order_insert) usa
--     notigas_categoria_activa(): desde esta migracion rechaza pedidos nuevos
--     con 'vidrio' o 'detergentes'.
--
-- Los pedidos EN CURSO compuestos solo de materiales retirados se cancelan,
-- igual que en los retiros anteriores: dejarlos pendientes seria prometer una
-- recogida que NOTIGAS ya no ofrece. Los pedidos mixtos (por ejemplo
-- 'plastico, vidrio') se conservan porque el recolector si puede cumplir la
-- parte vigente.

-- -----------------------------------------------------------------------------
-- 1. Catalogo activo: 6 -> 4 categorias
-- -----------------------------------------------------------------------------
create or replace function public.notigas_catalogo_categorias()
 returns table(codigo text, etiqueta text, grupo text, tipo_solicitud text)
 language sql
 immutable
 set search_path to ''
as $$
  select * from (values
    ('plastico',  'Plastico',               'recolector', 'recogida'),
    ('papel',     'Papel / Carton',         'recolector', 'recogida'),
    ('chatarra',  'Chatarra',               'recolector', 'recogida'),
    ('otros',     'Otros (a especificar)',  'recolector', 'recogida')
  ) as t(codigo, etiqueta, grupo, tipo_solicitud);
$$;

comment on function public.notigas_catalogo_categorias() is
  'Catalogo activo de Bolivia: solo recogida de reciclables (plastico, papel, chatarra y otros). Sin vidrio ni detergentes.';

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
        where lower(btrim(tok)) in ('organico', 'aceite', 'vidrio', 'detergentes')
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
          where lower(btrim(tok)) in ('organico', 'aceite', 'vidrio', 'detergentes')
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
    'suscripciones_recarga', false,
    'version', '20261105_retira_vidrio_y_detergentes_v1'
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
  if v_activas <> 4 then
    raise exception 'el catalogo activo tiene % categorias, se esperaban 4', v_activas;
  end if;

  if public.notigas_categoria_activa('vidrio') then
    raise exception 'vidrio no deberia seguir en el catalogo activo';
  end if;

  if public.notigas_categoria_activa('detergentes') then
    raise exception 'detergentes no deberia seguir en el catalogo activo';
  end if;

  -- El historico tiene que seguir aceptando los pedidos antiguos.
  if not public.notigas_categoria_valida('vidrio') then
    raise exception 'el catalogo historico debe conservar vidrio';
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
