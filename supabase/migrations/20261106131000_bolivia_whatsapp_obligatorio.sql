-- =============================================================================
-- Bolivia: el WhatsApp del vecino es obligatorio para publicar una recogida
-- =============================================================================
-- El recolector necesita un numero para coordinar la llegada al domicilio. La
-- interfaz ya marca el campo como obligatorio; este guard lo impone tambien en
-- el servidor para que no se pueda saltar por API.
--
-- Se conserva intacta toda la logica previa:
--   - ciudad del pedido = ciudad registrada del perfil,
--   - categoria dentro del catalogo activo,
--   - tipo_solicitud derivado de la categoria,
--   - titulo automatico y saneamiento de HTML,
--   - rate limit de creacion,
--   - comision en cero (NOTIGAS Bolivia no cobra).
--
-- Un telefono boliviano valido tiene 8 digitos locales; si el usuario escribe
-- +591 o espacios/guiones se normaliza y se aceptan entre 8 y 15 digitos.

create or replace function public.guard_optional_order_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_cat text;
  v_tipo text;
  v_etq text;
  v_perfil_ciudad text;
  v_telefono_digitos text;
begin
  if v_uid is null
     or v_uid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or not exists (select 1 from public.profiles p where p.id = v_uid::uuid) then
    raise exception 'Cuenta no autorizada para publicar';
  end if;

  if new.user_id is distinct from v_uid then
    raise exception 'No se puede publicar en nombre de otra cuenta';
  end if;

  -- Ciudad registrada del perfil: la unica fuente de verdad.
  select public.notigas_ciudad_canonica(p.ciudad) into v_perfil_ciudad
    from public.profiles p
   where p.id = v_uid::uuid;

  if v_perfil_ciudad is null then
    raise exception 'Tu cuenta no tiene una ciudad de registro valida. Actualiza tu perfil para poder publicar.';
  end if;

  new.estado := 'pendiente';
  new.driver_id := null;
  new.visto := false;
  new.ciudad := v_perfil_ciudad;

  select string_agg(distinct lower(btrim(tok)), ', ') into v_cat
    from unnest(string_to_array(coalesce(new.categoria, ''), ',')) as tok
   where btrim(tok) <> '';

  if v_cat is null or v_cat = '' then
    v_cat := 'plastico';
  end if;

  if not public.notigas_categoria_activa(v_cat) then
    raise exception 'Categoria fuera del catalogo NOTIGAS Bolivia: %', v_cat;
  end if;
  new.categoria := v_cat;

  v_tipo := public.notigas_tipo_de_categoria(v_cat);
  new.tipo_solicitud := v_tipo;

  select string_agg(c.etiqueta, ' / ') into v_etq
    from public.notigas_catalogo_categorias() c
   where c.codigo in (
     select lower(btrim(tok)) from unnest(string_to_array(v_cat, ',')) tok
   );

  if new.titulo is null or trim(new.titulo) = '' then
    new.titulo := case when v_tipo = 'recogida'
                       then 'Recogida de ' || coalesce(v_etq, v_cat)
                       else 'Pedido de ' || coalesce(v_etq, v_cat) end;
  else
    new.titulo := left(regexp_replace(new.titulo, '<[^>]*>', '', 'g'), 120);
  end if;

  new.descripcion := left(regexp_replace(coalesce(new.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  new.cantidad := left(regexp_replace(coalesce(new.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
  new.direccion := left(regexp_replace(coalesce(new.direccion, ''), '<[^>]*>', '', 'g'), 240);
  new.telefono := left(regexp_replace(coalesce(new.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);

  v_telefono_digitos := regexp_replace(coalesce(new.telefono, ''), '[^0-9]', '', 'g');

  if v_telefono_digitos = '' or length(v_telefono_digitos) < 8 or length(v_telefono_digitos) > 15 then
    raise exception 'El telefono o WhatsApp de contacto es obligatorio (8 digitos en Bolivia)';
  end if;

  new.comision_entrega := 0;
  new.comision_registrada := false;

  if new.titulo = ''
     or new.latitude not between -90 and 90
     or new.longitude not between -180 and 180 then
    raise exception 'Datos del pedido invalidos o incompletos';
  end if;

  perform public.enforce_action_rate_limit('create_order', 8, 300);
  return new;
end;
$function$;

revoke all on function public.guard_optional_order_insert() from public;
revoke all on function public.guard_optional_order_insert() from anon;
grant execute on function public.guard_optional_order_insert() to service_role;

comment on function public.guard_optional_order_insert() is
  'Valida y normaliza pedidos de Bolivia. Exige WhatsApp (8 digitos), ciudad registrada y catalogo activo; comision en cero.';

do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'guard_optional_order_insert'
  ) then
    raise exception 'guard_optional_order_insert no quedo definida tras la migracion';
  end if;
end $$;
