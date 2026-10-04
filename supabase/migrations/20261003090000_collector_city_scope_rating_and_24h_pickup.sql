-- ============================================================================
-- Alcance de recolectores por ciudad + ranking 5 estrellas + vencimiento 24h
-- ============================================================================
-- 1) P0: private.sync_driver_public_profile() leia new.precio_balon_10kg, pero
--    esa columna NO existe en choferes_habilitados ni en driver_public_profiles.
--    El trigger trg_sync_driver_public_profile reventaba en cada alta/edicion de
--    recolector. Se reescribe sin esa columna y se agrega rating.
-- 2) Recolectores: solo pueden ver recolectores de su ciudad registrada.
--    Vecinos (y anonimos) siguen pudiendo curiosear cualquier ciudad.
-- 3) pedidos_publicos: se elimina la rama muerta de anonimo, se enmascara el
--    contacto y un tercero solo ve pedidos abiertos (no los ya tomados).
-- 4) rating: 5 estrellas iniciales, -1 por recoleccion comprometida no
--    confirmada en 24h, con piso en 0 y bitacora driver_rating_events.
-- 5) Vencimiento: driver_assigned_at + rpc_sweep_expired_pickups() + pg_cron.

-- ---------------------------------------------------------------------------
-- 1) P0: repairing broken sync trigger + exposing rating
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.sync_driver_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_user_id text;
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.driver_public_profiles where driver_profile_id = old.id;
    delete from public.driver_public_presence where route_id in (
      select r.id from public.rutas_repartidores r where r.user_id = old.user_id
    );
    return old;
  end if;

  v_user_id := new.user_id;
  v_id := new.id;

  if lower(trim(coalesce(new.estado_verificacion,''))) <> 'aprobado'
     or coalesce(new.bloqueado,false)
     or coalesce(new.estado_servicio,'activo') <> 'activo' then
    delete from public.driver_public_profiles where driver_profile_id = v_id;
    delete from public.driver_public_presence where route_id in (
      select r.id from public.rutas_repartidores r where r.user_id = v_user_id
    );
    return new;
  end if;

  insert into public.driver_public_profiles(
    driver_profile_id,nombre_completo,categoria,ciudad,zonas,schedule,productos,
    color_camion,estado_verificacion,created_at,rating
  ) values (
    new.id,new.nombre_completo,new.categoria,new.ciudad,new.zonas,new.schedule,new.productos,
    new.color_camion,new.estado_verificacion,new.created_at,
    round(greatest(0,least(5,coalesce(new.rating,5.00))),2)
  )
  on conflict (driver_profile_id) do update set
    nombre_completo=excluded.nombre_completo,
    categoria=excluded.categoria,
    ciudad=excluded.ciudad,
    zonas=excluded.zonas,
    schedule=excluded.schedule,
    productos=excluded.productos,
    color_camion=excluded.color_camion,
    estado_verificacion=excluded.estado_verificacion,
    rating=excluded.rating,
    created_at=excluded.created_at;

  -- Si ya existe ruta activa, refrescar su superficie publica.
  insert into public.driver_public_presence(
    route_id,distribuidor_nombre,categoria,titulo,ciudad,latitude,longitude,
    garrafas_agotadas,last_active,productos,color_camion,route_created_at
  )
  select r.id,
         coalesce(nullif(trim(r.distribuidor_nombre),''),new.nombre_completo,'Repartidor NOTIGAS'),
         coalesce(r.categoria,new.categoria),
         coalesce(r.titulo,'En ruta de distribucion'),
         r.ciudad,r.latitude,r.longitude,coalesce(r.garrafas_agotadas,false),r.last_active,
         new.productos,coalesce(nullif(trim(r.color_camion),''),new.color_camion),
         r.created_at
    from public.rutas_repartidores r
   where r.user_id=v_user_id
     and r.last_active >= now()-interval '10 minutes'
  on conflict (route_id) do update set
    distribuidor_nombre=excluded.distribuidor_nombre,
    categoria=excluded.categoria,
    titulo=excluded.titulo,
    ciudad=excluded.ciudad,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    garrafas_agotadas=excluded.garrafas_agotadas,
    last_active=excluded.last_active,
    productos=excluded.productos,
    color_camion=excluded.color_camion,
    route_created_at=excluded.route_created_at;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Rating de cumplimiento (0 a 5 estrellas)
-- ---------------------------------------------------------------------------
alter table public.choferes_habilitados
  add column if not exists rating numeric(3,2),
  add column if not exists rating_incumplimientos integer,
  add column if not exists rating_actualizado_at timestamptz;

update public.choferes_habilitados
   set rating = 5.00
 where rating is null;

update public.choferes_habilitados
   set rating_incumplimientos = 0
 where rating_incumplimientos is null;

alter table public.choferes_habilitados
  alter column rating set default 5.00,
  alter column rating set not null,
  alter column rating_incumplimientos set default 0,
  alter column rating_incumplimientos set not null,
  alter column rating_actualizado_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.choferes_habilitados'::regclass
       and conname = 'choferes_rating_range_check'
  ) then
    alter table public.choferes_habilitados
      add constraint choferes_rating_range_check
      check (rating >= 0 and rating <= 5);
  end if;
end;
$$;

alter table public.driver_public_profiles
  add column if not exists rating numeric(3,2);

create table if not exists public.driver_rating_events (
  id bigint generated always as identity primary key,
  driver_id uuid,
  driver_user_id text not null,
  order_id uuid,
  motivo text not null,
  delta numeric(3,2) not null,
  rating_anterior numeric(3,2) not null,
  rating_nuevo numeric(3,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_rating_events_driver
  on public.driver_rating_events (driver_id, created_at desc);

create index if not exists idx_driver_rating_events_order
  on public.driver_rating_events (order_id);

alter table public.driver_rating_events enable row level security;

revoke all on public.driver_rating_events from anon, authenticated;
grant select on public.driver_rating_events to service_role;

comment on table public.driver_rating_events is
  'Bitacora de penalizaciones al rating del recolector por recolecciones comprometidas no confirmadas en 24h.';

-- ---------------------------------------------------------------------------
-- 3) Vencimiento de 24h desde que el recolector toma el pedido
-- ---------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists driver_assigned_at timestamptz;

create index if not exists idx_pedidos_pickup_deadline
  on public.pedidos (driver_assigned_at)
  where estado = 'asignado' and driver_id is not null;

comment on column public.pedidos.driver_assigned_at is
  'Momento en que el recolector tomo el pedido. Plazo de 24h para confirmar la recoleccion.';

-- ---------------------------------------------------------------------------
-- 4) Recolectores acotados a su ciudad; vecinos y anonimos pueden curiosear
-- ---------------------------------------------------------------------------
create or replace function public.driver_registered_city(p_uid text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(btrim(coalesce(c.ciudad,'')))
    from public.choferes_habilitados c
   where c.user_id = p_uid
   limit 1;
$$;

revoke all on function public.driver_registered_city(text) from public;
grant execute on function public.driver_registered_city(text) to anon, authenticated, service_role;

drop policy if exists driver_public_profiles_public_read on public.driver_public_profiles;

create policy driver_public_profiles_public_read
  on public.driver_public_profiles
  for select
  to anon, authenticated
  using (
    public.driver_registered_city(auth.uid()::text) is null
    or lower(btrim(coalesce(ciudad,''))) = public.driver_registered_city(auth.uid()::text)
  );

comment on policy driver_public_profiles_public_read on public.driver_public_profiles is
  'Los recolectores solo ven su ciudad registrada. Los vecinos pueden curiosear cualquier ciudad.';

-- ---------------------------------------------------------------------------
-- 5) Vista publica de recolectores con rating
-- ---------------------------------------------------------------------------
create or replace view public.choferes_publicos as
select
  driver_profile_id as id,
  nombre_completo,
  categoria,
  ciudad,
  null::text as telefono,
  null::text as descripcion,
  null::text as foto_url,
  estado_verificacion,
  created_at,
  color_camion,
  false as es_premium,
  zonas,
  schedule,
  productos,
  round(greatest(0, least(5, coalesce(rating, 5.00))), 2) as rating
from driver_public_profiles;

alter view public.choferes_publicos set (security_invoker = true);
grant select on public.choferes_publicos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) pedidos_publicos: contacto solo para Dueño/Recolector asignado/Admin
--    Un tercero ve unicamente pedidos abiertos (aun no tomados).
-- ---------------------------------------------------------------------------
create or replace view public.pedidos_publicos as
select
  p.id,
  case
    when p.user_id = auth.uid()::text or p.driver_id = auth.uid()::text
      or p.requested_driver_id = auth.uid()::text
      or is_admin_email()
      or private.can_view_order_contact(p.id)
    then p.user_id
    else null::text
  end as user_id,
  p.categoria,
  p.titulo,
  case
    when p.user_id = auth.uid()::text or p.driver_id = auth.uid()::text
      or p.requested_driver_id = auth.uid()::text
      or is_admin_email()
      or private.can_view_order_contact(p.id)
    then p.descripcion
    else null::text
  end as descripcion,
  p.cantidad,
  case
    when p.user_id = auth.uid()::text or p.driver_id = auth.uid()::text
      or p.requested_driver_id = auth.uid()::text
      or is_admin_email()
      or private.can_view_order_contact(p.id)
    then p.direccion
    else null::text
  end as direccion,
  case
    when p.user_id = auth.uid()::text or p.driver_id = auth.uid()::text
      or p.requested_driver_id = auth.uid()::text
      or is_admin_email()
      or private.can_view_order_contact(p.id)
    then p.telefono
    else null::text
  end as telefono,
  p.estado,
  case
    when p.driver_id = auth.uid()::text or is_admin_email()
    then p.driver_id
    else null::text
  end as driver_id,
  p.ciudad,
  p.barrio_otb,
  p.latitude,
  p.longitude,
  p.visto,
  p.created_at,
  p.updated_at,
  p.subestado
from pedidos p
where is_admin_email()
   or p.user_id = auth.uid()::text
   or p.driver_id = auth.uid()::text
   or p.requested_driver_id = auth.uid()::text
   or private.can_view_order_contact(p.id)
   or (
     auth_user_city() <> ''
     and lower(btrim(coalesce(p.ciudad,''))) = auth_user_city()
     and p.estado in ('pendiente', 'visto')
   );

alter view public.pedidos_publicos set (security_invoker = true);
revoke select on public.pedidos_publicos from anon;
grant select on public.pedidos_publicos to authenticated;

-- ---------------------------------------------------------------------------
-- 7) rpc_assign_order: registra el inicio del plazo de 24h
-- ---------------------------------------------------------------------------
create or replace function public.rpc_assign_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid text := auth.uid()::text;
  v_driver record;
  v_order record;
  oc text;
  dc text;
begin
  if v_uid is null then raise exception 'Usuario no autenticado'; end if;
  if public.is_banned() then raise exception 'El usuario esta baneado o no autorizado'; end if;

  select * into v_driver from public.choferes_habilitados where user_id = v_uid limit 1 for update;
  if not found then raise exception 'El usuario no es un repartidor habilitado'; end if;

  if lower(trim(coalesce(v_driver.estado_verificacion,''))) <> 'aprobado'
     or coalesce(v_driver.bloqueado,false)
     or coalesce(v_driver.estado_servicio,'activo') <> 'activo' then
    raise exception 'Tu cuenta esta bloqueada hasta que se confirme el pago fijo de S/ 50';
  end if;

  if coalesce(v_driver.pedidos_credito_ciclo,0) >= 250
     or coalesce(v_driver.comisiones_pendientes,0) >= 50 then
    raise exception 'Alcanzaste el ciclo fijo de 250 balones cobrables (S/ 50). Regulariza la remesa Yape para continuar.';
  end if;

  select * into v_order from public.pedidos where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  if lower(trim(coalesce(v_order.ciudad,''))) <> lower(trim(coalesce(v_driver.ciudad,''))) then
    raise exception 'El pedido no pertenece a la ciudad del repartidor';
  end if;

  oc := lower(trim(coalesce(v_order.categoria,'')));
  dc := lower(trim(coalesce(v_driver.categoria,'')));
  if oc ilike '%gas%' or oc ilike '%glp%' or oc ilike '%garrafa%' or oc ilike '%balon%' or oc ilike '%balón%' then
    oc := 'gas';
  elsif oc ilike '%agua%' or oc ilike '%botell%' then
    oc := 'agua';
  end if;
  if dc ilike '%gas%' or dc ilike '%glp%' or dc ilike '%garrafa%' or dc ilike '%balon%' or dc ilike '%balón%' then
    dc := 'gas';
  elsif dc ilike '%agua%' or dc ilike '%botell%' then
    dc := 'agua';
  end if;
  if oc <> dc then raise exception 'El pedido no corresponde a la categoria del repartidor'; end if;

  if v_order.estado = 'asignado' then
    if v_order.driver_id = v_uid then
      return jsonb_build_object('ok', true, 'message', 'Pedido ya asignado a ti');
    end if;
    raise exception 'Este pedido ya fue tomado por otro repartidor';
  end if;

  if v_order.estado not in ('pendiente','visto') then
    raise exception 'El pedido ya no esta disponible para asignacion';
  end if;

  perform set_config('notigas.internal_order_mutation','1',true);
  update public.pedidos
     set estado = 'asignado',
         driver_id = v_uid,
         driver_assigned_at = now(),
         comision_entrega = 0,
         comision_registrada = false,
         visto = true,
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'estado', 'asignado',
    'driver_id', v_uid,
    'recoleccion_vence_at', now() + interval '24 hours'
  );
end;
$$;

revoke all on function public.rpc_assign_order(uuid) from public, anon;
grant execute on function public.rpc_assign_order(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) Barrido: vencen a las 24h, vuelven al mapa y penalizan al recolector
-- ---------------------------------------------------------------------------
create or replace function public.rpc_sweep_expired_pickups()
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  r record;
  v_driver_id uuid;
  v_prev numeric(3,2);
  v_new numeric(3,2);
  v_total int := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  for r in
    select p.id, p.driver_id
      from public.pedidos p
     where p.estado = 'asignado'
       and p.driver_id is not null
       and p.driver_assigned_at is not null
       and p.driver_assigned_at <= now() - interval '24 hours'
       and coalesce(p.buyer_confirmed_received,false) = false
       and coalesce(p.driver_confirmed_delivered,false) = false
       and p.delivery_accounted_at is null
     order by p.driver_assigned_at
     for update skip locked
  loop
    select ch.id, ch.rating into v_driver_id, v_prev
      from public.choferes_habilitados ch
     where ch.user_id = r.driver_id
     limit 1
       for update;

    v_new := round(greatest(0, least(5, coalesce(v_prev,5.00) - 1.00)), 2);

    if v_driver_id is not null then
      perform set_config('notigas.internal_driver_finance','1',true);
      update public.choferes_habilitados
         set rating = v_new,
             rating_incumplimientos = coalesce(rating_incumplimientos,0) + 1,
             rating_actualizado_at = now()
       where id = v_driver_id;

      insert into public.driver_rating_events(
        driver_id, driver_user_id, order_id, motivo, delta,
        rating_anterior, rating_nuevo
      ) values (
        v_driver_id, r.driver_id, r.id,
        'recoleccion_comprometida_no_confirmada_24h',
        -1.00, round(coalesce(v_prev,5.00),2), v_new
      );
    end if;

    perform set_config('notigas.internal_order_mutation','1',true);
    update public.pedidos
       set estado = 'pendiente',
           driver_id = null,
           subestado = null,
           driver_assigned_at = null,
           driver_reported_not_delivered = false,
           driver_reported_not_delivered_at = null,
           delivery_resolution = 'pickup_expired_24h',
           comision_entrega = 0,
           comision_registrada = false,
           updated_at = now()
     where id = r.id;

    v_total := v_total + 1;
    v_ids := v_ids || jsonb_build_array(r.id);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'liberados', v_total,
    'order_ids', v_ids,
    'penalizacion_estrella', -1.00
  );
end;
$$;

revoke all on function public.rpc_sweep_expired_pickups() from public, anon, authenticated;
grant execute on function public.rpc_sweep_expired_pickups() to service_role;

comment on function public.rpc_sweep_expired_pickups() is
  'Libera pedidos tomados sin confirmacion en 24h, los devuelve al mapa y descuenta una estrella al recolector.';

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if not exists (
      select 1 from cron.job where jobname = 'notigas_sweep_pickups_vencidos'
    ) then
      perform cron.schedule(
        'notigas_sweep_pickups_vencidos',
        '*/15 * * * *',
        'select public.rpc_sweep_expired_pickups()'
      );
    end if;
  end if;
exception
  when others then
    raise notice 'No se pudo programar cron de vencimientos: %', sqlerrm;
end;
$$;
