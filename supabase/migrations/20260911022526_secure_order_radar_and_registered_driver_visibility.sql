-- NOTIGAS: privacidad de pedidos libres y visibilidad de repartidores para usuarios registrados.
-- Pedido libre: únicamente área aproximada de 50 m.
-- Pedido asignado: datos exactos únicamente para comprador, repartidor asignado y administrador.

create schema if not exists private;

create table if not exists public.driver_public_profiles (
  driver_profile_id uuid primary key,
  nombre_completo text,
  categoria text,
  ciudad text,
  zonas text,
  schedule text,
  productos text,
  color_camion text,
  precio_balon_10kg numeric,
  estado_verificacion text,
  created_at timestamptz
);

create table if not exists public.driver_public_presence (
  route_id uuid primary key,
  distribuidor_nombre text,
  categoria text,
  titulo text,
  ciudad text,
  latitude double precision,
  longitude double precision,
  garrafas_agotadas boolean default false,
  last_active timestamptz,
  productos text,
  color_camion text,
  precio_balon_10kg numeric,
  route_created_at timestamptz
);

create table if not exists public.order_public_radar (
  order_id uuid primary key references public.pedidos(id) on delete cascade,
  ciudad text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null default 50 check (radius_m = 50)
);

alter table public.driver_public_profiles enable row level security;
alter table public.driver_public_presence enable row level security;
alter table public.order_public_radar enable row level security;

drop policy if exists driver_public_profiles_registered_read on public.driver_public_profiles;
create policy driver_public_profiles_registered_read on public.driver_public_profiles
for select to authenticated
using ((select auth.uid()) is not null and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false);

drop policy if exists driver_public_presence_registered_read on public.driver_public_presence;
create policy driver_public_presence_registered_read on public.driver_public_presence
for select to authenticated
using ((select auth.uid()) is not null and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false);

revoke all on public.driver_public_profiles from public, anon;
revoke all on public.driver_public_presence from public, anon;
revoke all on public.order_public_radar from public, anon;
grant select on public.driver_public_profiles to authenticated;
grant select on public.driver_public_presence to authenticated;

create or replace function private.sync_driver_public_profile()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
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
    color_camion,precio_balon_10kg,estado_verificacion,created_at
  ) values (
    new.id,new.nombre_completo,new.categoria,new.ciudad,new.zonas,new.schedule,new.productos,
    new.color_camion,new.precio_balon_10kg,new.estado_verificacion,new.created_at
  )
  on conflict (driver_profile_id) do update set
    nombre_completo=excluded.nombre_completo,
    categoria=excluded.categoria,
    ciudad=excluded.ciudad,
    zonas=excluded.zonas,
    schedule=excluded.schedule,
    productos=excluded.productos,
    color_camion=excluded.color_camion,
    precio_balon_10kg=excluded.precio_balon_10kg,
    estado_verificacion=excluded.estado_verificacion,
    created_at=excluded.created_at;

  insert into public.driver_public_presence(
    route_id,distribuidor_nombre,categoria,titulo,ciudad,latitude,longitude,
    garrafas_agotadas,last_active,productos,color_camion,precio_balon_10kg,route_created_at
  )
  select r.id,
         coalesce(nullif(trim(r.distribuidor_nombre),''),new.nombre_completo,'Repartidor NOTIGAS'),
         coalesce(r.categoria,new.categoria),
         coalesce(r.titulo,'En ruta de distribución'),
         r.ciudad,r.latitude,r.longitude,coalesce(r.garrafas_agotadas,false),r.last_active,
         new.productos,coalesce(nullif(trim(r.color_camion),''),new.color_camion),
         coalesce(r.precio_balon_10kg,new.precio_balon_10kg),r.created_at
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
    precio_balon_10kg=excluded.precio_balon_10kg,
    route_created_at=excluded.route_created_at;
  return new;
end;
$$;
revoke all on function private.sync_driver_public_profile() from public, anon, authenticated;

drop trigger if exists trg_sync_driver_public_profile on public.choferes_habilitados;
create trigger trg_sync_driver_public_profile
after insert or update or delete on public.choferes_habilitados
for each row execute function private.sync_driver_public_profile();

create or replace function private.sync_driver_public_presence()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare ch record;
begin
  if tg_op='DELETE' then
    delete from public.driver_public_presence where route_id=old.id;
    return old;
  end if;

  select * into ch from public.choferes_habilitados
   where user_id=new.user_id
     and lower(trim(coalesce(estado_verificacion,'')))='aprobado'
     and coalesce(bloqueado,false)=false
     and coalesce(estado_servicio,'activo')='activo'
   limit 1;

  if not found or new.last_active < now()-interval '10 minutes' then
    delete from public.driver_public_presence where route_id=new.id;
    return new;
  end if;

  insert into public.driver_public_presence(
    route_id,distribuidor_nombre,categoria,titulo,ciudad,latitude,longitude,
    garrafas_agotadas,last_active,productos,color_camion,precio_balon_10kg,route_created_at
  ) values (
    new.id,coalesce(nullif(trim(new.distribuidor_nombre),''),ch.nombre_completo,'Repartidor NOTIGAS'),
    coalesce(new.categoria,ch.categoria),coalesce(new.titulo,'En ruta de distribución'),
    new.ciudad,new.latitude,new.longitude,coalesce(new.garrafas_agotadas,false),new.last_active,
    ch.productos,coalesce(nullif(trim(new.color_camion),''),ch.color_camion),
    coalesce(new.precio_balon_10kg,ch.precio_balon_10kg),new.created_at
  ) on conflict(route_id) do update set
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
    precio_balon_10kg=excluded.precio_balon_10kg,
    route_created_at=excluded.route_created_at;
  return new;
end;
$$;
revoke all on function private.sync_driver_public_presence() from public, anon, authenticated;

drop trigger if exists trg_sync_driver_public_presence on public.rutas_repartidores;
create trigger trg_sync_driver_public_presence
after insert or update or delete on public.rutas_repartidores
for each row execute function private.sync_driver_public_presence();

create or replace function private.sync_order_public_radar()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_existing public.order_public_radar%rowtype;
  v_distance double precision;
  v_angle double precision;
  v_coslat double precision;
begin
  if tg_op='DELETE' then
    delete from public.order_public_radar where order_id=old.id;
    return old;
  end if;

  if new.driver_id is null and new.estado in ('pendiente','visto')
     and new.latitude is not null and new.longitude is not null then
    select * into v_existing from public.order_public_radar where order_id=new.id;
    if found then
      update public.order_public_radar
         set ciudad=coalesce(new.ciudad,'lima'),
             latitude=v_existing.latitude + case when old.latitude is not null then new.latitude-old.latitude else 0 end,
             longitude=v_existing.longitude + case when old.longitude is not null then new.longitude-old.longitude else 0 end,
             radius_m=50
       where order_id=new.id;
    else
      v_distance := 15.0 + random()*20.0;
      v_angle := random()*2.0*pi();
      v_coslat := greatest(abs(cos(radians(new.latitude))),0.20);
      insert into public.order_public_radar(order_id,ciudad,latitude,longitude,radius_m)
      values(new.id,coalesce(new.ciudad,'lima'),
        new.latitude + (v_distance*cos(v_angle)/111320.0),
        new.longitude + (v_distance*sin(v_angle)/(111320.0*v_coslat)),50)
      on conflict(order_id) do nothing;
    end if;
  else
    delete from public.order_public_radar where order_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_order_public_radar() from public, anon, authenticated;

drop trigger if exists trg_sync_order_public_radar on public.pedidos;
create trigger trg_sync_order_public_radar
after insert or update of latitude,longitude,estado,driver_id,ciudad or delete on public.pedidos
for each row execute function private.sync_order_public_radar();

create or replace function private.can_view_order_radar(p_order_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, private, pg_temp
as $$
declare
  v_uid text := auth.uid()::text;
  d record;
  p record;
  oc text;
  dc text;
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return false; end if;
  select id,user_id,categoria,ciudad,estado,driver_id into p from public.pedidos where id=p_order_id;
  if not found or p.driver_id is not null or p.estado not in ('pendiente','visto') then return false; end if;

  select categoria,ciudad,estado_verificacion,bloqueado,estado_servicio into d
    from public.choferes_habilitados where user_id=v_uid limit 1;
  if not found then return true; end if;

  if lower(trim(coalesce(d.estado_verificacion,'')))<>'aprobado'
     or coalesce(d.bloqueado,false)
     or coalesce(d.estado_servicio,'activo')<>'activo' then return false; end if;
  if lower(trim(coalesce(d.ciudad,'')))<>lower(trim(coalesce(p.ciudad,''))) then return false; end if;

  oc:=lower(trim(coalesce(p.categoria,'')));
  dc:=lower(trim(coalesce(d.categoria,'')));
  if oc ilike '%gas%' or oc ilike '%glp%' or oc ilike '%garrafa%' or oc ilike '%balon%' or oc ilike '%balón%' then oc:='gas';
  elsif oc ilike '%agua%' or oc ilike '%botell%' then oc:='agua'; end if;
  if dc ilike '%gas%' or dc ilike '%glp%' or dc ilike '%garrafa%' or dc ilike '%balon%' or dc ilike '%balón%' then dc:='gas';
  elsif dc ilike '%agua%' or dc ilike '%botell%' then dc:='agua'; end if;
  return oc=dc;
end;
$$;
revoke all on function private.can_view_order_radar(uuid) from public, anon, authenticated;

drop policy if exists order_public_radar_registered_read on public.order_public_radar;
create policy order_public_radar_registered_read on public.order_public_radar
for select to authenticated using ((select private.can_view_order_radar(order_id)));
grant select on public.order_public_radar to authenticated;

drop policy if exists pedidos_select_strict on public.pedidos;
create policy pedidos_select_strict on public.pedidos
for select to authenticated
using (user_id=((select auth.uid()))::text or driver_id=((select auth.uid()))::text or (select public.is_admin_email()));

drop policy if exists pedidos_update_strict on public.pedidos;
create policy pedidos_update_strict on public.pedidos
for update to authenticated
using (user_id=((select auth.uid()))::text or driver_id=((select auth.uid()))::text or (select public.is_admin_email()))
with check (user_id=((select auth.uid()))::text or driver_id=((select auth.uid()))::text or (select public.is_admin_email()));

revoke all on function public.rpc_get_driver_available_orders(text,text) from public, anon, authenticated;

drop view if exists public.choferes_publicos cascade;
create view public.choferes_publicos with (security_invoker=true) as
select driver_profile_id as id,nombre_completo,categoria,ciudad,null::text as telefono,
       null::text as descripcion,null::text as foto_url,estado_verificacion,created_at,
       color_camion,precio_balon_10kg,false as es_premium,zonas,schedule,productos
from public.driver_public_profiles;
revoke all on public.choferes_publicos from public, anon;
grant select on public.choferes_publicos to authenticated;

drop view if exists public.rutas_repartidores_publicas cascade;
create view public.rutas_repartidores_publicas with (security_invoker=true) as
select route_id as id,null::text as user_id,distribuidor_nombre,categoria,titulo,ciudad,latitude,longitude,
       garrafas_agotadas,last_active,null::text as telefono,null::text as placa,productos,
       garrafas_agotadas as balones_agotados,color_camion,precio_balon_10kg,false as es_premium,
       route_created_at,'credito'::text as tipo_plan
from public.driver_public_presence;
revoke all on public.rutas_repartidores_publicas from public, anon;
grant select on public.rutas_repartidores_publicas to authenticated;

drop view if exists public.pedidos_publicos cascade;
create view public.pedidos_publicos with (security_invoker=true) as
select p.id,p.user_id,p.categoria,p.titulo,p.descripcion,p.cantidad,p.direccion,p.telefono,
       p.estado,p.driver_id,p.ciudad,p.barrio_otb,p.latitude,p.longitude,p.visto,p.created_at,p.updated_at,p.subestado
from public.pedidos p;
revoke all on public.pedidos_publicos from public, anon;
grant select on public.pedidos_publicos to authenticated;

insert into public.driver_public_profiles(driver_profile_id,nombre_completo,categoria,ciudad,zonas,schedule,productos,color_camion,precio_balon_10kg,estado_verificacion,created_at)
select id,nombre_completo,categoria,ciudad,zonas,schedule,productos,color_camion,precio_balon_10kg,estado_verificacion,created_at
from public.choferes_habilitados
where lower(trim(coalesce(estado_verificacion,'')))='aprobado' and coalesce(bloqueado,false)=false and coalesce(estado_servicio,'activo')='activo'
on conflict(driver_profile_id) do update set
 nombre_completo=excluded.nombre_completo,categoria=excluded.categoria,ciudad=excluded.ciudad,zonas=excluded.zonas,
 schedule=excluded.schedule,productos=excluded.productos,color_camion=excluded.color_camion,
 precio_balon_10kg=excluded.precio_balon_10kg,estado_verificacion=excluded.estado_verificacion,created_at=excluded.created_at;

insert into public.driver_public_presence(route_id,distribuidor_nombre,categoria,titulo,ciudad,latitude,longitude,garrafas_agotadas,last_active,productos,color_camion,precio_balon_10kg,route_created_at)
select r.id,coalesce(nullif(trim(r.distribuidor_nombre),''),ch.nombre_completo,'Repartidor NOTIGAS'),coalesce(r.categoria,ch.categoria),
       coalesce(r.titulo,'En ruta de distribución'),r.ciudad,r.latitude,r.longitude,coalesce(r.garrafas_agotadas,false),r.last_active,
       ch.productos,coalesce(nullif(trim(r.color_camion),''),ch.color_camion),coalesce(r.precio_balon_10kg,ch.precio_balon_10kg),r.created_at
from public.rutas_repartidores r join public.choferes_habilitados ch on ch.user_id=r.user_id
where r.last_active>=now()-interval '10 minutes' and lower(trim(coalesce(ch.estado_verificacion,'')))='aprobado'
  and coalesce(ch.bloqueado,false)=false and coalesce(ch.estado_servicio,'activo')='activo'
on conflict(route_id) do update set
 distribuidor_nombre=excluded.distribuidor_nombre,categoria=excluded.categoria,titulo=excluded.titulo,ciudad=excluded.ciudad,
 latitude=excluded.latitude,longitude=excluded.longitude,garrafas_agotadas=excluded.garrafas_agotadas,last_active=excluded.last_active,
 productos=excluded.productos,color_camion=excluded.color_camion,precio_balon_10kg=excluded.precio_balon_10kg,route_created_at=excluded.route_created_at;

insert into public.order_public_radar(order_id,ciudad,latitude,longitude,radius_m)
select p.id,coalesce(p.ciudad,'lima'),
       p.latitude + ((15.0+random()*20.0)*cos(random()*2*pi())/111320.0),
       p.longitude + ((15.0+random()*20.0)*sin(random()*2*pi())/(111320.0*greatest(abs(cos(radians(p.latitude))),0.20))),50
from public.pedidos p
where p.driver_id is null and p.estado in ('pendiente','visto') and p.latitude is not null and p.longitude is not null
on conflict(order_id) do nothing;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_public_radar') then
    alter publication supabase_realtime add table public.order_public_radar;
  end if;
end $$;

notify pgrst, 'reload schema';
