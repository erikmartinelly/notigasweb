-- =============================================================================
-- Bolivia: busqueda de recolectores por buffer (cercanos primero)
-- =============================================================================
-- Antes el radar de pedidos libres mostraba de golpe todos los pedidos de la
-- ciudad y de la categoria del recolector. No habia distancia ni ampliacion
-- progresiva, asi que un recolector lejano veia el pedido al mismo tiempo que
-- el mas cercano.
--
-- Ahora el pedido se abre en anillos, similar a inDrive:
--   - primeros 60 segundos: recolectores a <= 1 km
--   - hasta 3 minutos:      recolectores a <= 3 km
--   - hasta 7 minutos:      recolectores a <= 8 km
--   - despues:              toda la ciudad
--
-- La distancia se calcula entre la ultima ubicacion GPS del recolector
-- (rutas_repartidores, vigente <= 10 min) y la ubicacion real del pedido. El
-- radar publico sigue mostrando solo un area aproximada de 50 m: el buffer usa
-- las coordenadas reales mientras la fila viaja por RLS, sin exponerlas.
--
-- Si el recolector nunca transmitio su ubicacion, se mantiene el comportamiento
-- anterior (ve toda la ciudad) para no dejar la app sin pedidos.
--
-- Las solicitudes dirigidas (requested_driver_id) no pasan por el buffer: son
-- exclusivas del recolector elegido durante 30 segundos.

create index if not exists idx_rutas_repartidores_user_active
  on public.rutas_repartidores (user_id, last_active desc)
  where latitude is not null and longitude is not null;

create or replace function private.can_view_order_radar(p_order_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'private', 'pg_temp'
as $$
declare
  v_uid text := auth.uid()::text;
  d record;
  p record;
  oc text;
  dc text;
  v_driver_lat double precision;
  v_driver_lng double precision;
  v_distance_m double precision;
  v_radius_m double precision;
  v_order_age interval;
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return false;
  end if;

  select id, user_id, categoria, ciudad, estado, driver_id,
         requested_driver_id, driver_request_status,
         created_at, latitude, longitude
    into p
    from public.pedidos
   where id = p_order_id;

  if not found
     or p.user_id = v_uid
     or p.driver_id is not null
     or p.estado not in ('pendiente', 'visto') then
    return false;
  end if;

  -- Una solicitud dirigida es invisible para cualquier otro recolector.
  if p.requested_driver_id is not null
     and (p.driver_request_status <> 'requested' or p.requested_driver_id <> v_uid) then
    return false;
  end if;

  select categoria, ciudad, estado_verificacion, bloqueado, estado_servicio
    into d
    from public.choferes_habilitados
   where user_id = v_uid
   limit 1;

  if not found
     or lower(trim(coalesce(d.estado_verificacion, ''))) <> 'aprobado'
     or coalesce(d.bloqueado, false)
     or coalesce(d.estado_servicio, 'activo') <> 'activo'
     or lower(trim(coalesce(d.ciudad, ''))) <> lower(trim(coalesce(p.ciudad, ''))) then
    return false;
  end if;

  oc := lower(trim(coalesce(p.categoria, '')));
  dc := lower(trim(coalesce(d.categoria, '')));

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

  if oc <> dc then
    return false;
  end if;

  -- La solicitud dirigida ya valido que es para este recolector.
  if p.requested_driver_id is not null then
    return true;
  end if;

  -- Ultima ubicacion del recolector. Si no hay GPS reciente, no se aplica buffer.
  select r.latitude, r.longitude
    into v_driver_lat, v_driver_lng
    from public.rutas_repartidores r
   where r.user_id = v_uid
     and r.last_active >= now() - interval '10 minutes'
     and r.latitude is not null
     and r.longitude is not null
   order by r.last_active desc
   limit 1;

  if v_driver_lat is null or v_driver_lng is null
     or p.latitude is null or p.longitude is null then
    return true;
  end if;

  -- Haversine en metros entre recolector y pedido.
  v_distance_m := 2 * 6371000 * asin(
    sqrt(
      power(sin(radians((p.latitude - v_driver_lat) / 2)), 2)
      + cos(radians(v_driver_lat))
        * cos(radians(p.latitude))
        * power(sin(radians((p.longitude - v_driver_lng) / 2)), 2)
    )
  );

  v_order_age := now() - coalesce(p.created_at, now());

  v_radius_m := case
    when v_order_age <= interval '60 seconds' then 1000
    when v_order_age <= interval '3 minutes'  then 3000
    when v_order_age <= interval '7 minutes'  then 8000
    else 100000
  end;

  return v_distance_m <= v_radius_m;
end;
$$;

revoke all on function private.can_view_order_radar(uuid) from public, anon;
grant execute on function private.can_view_order_radar(uuid) to authenticated;

comment on function private.can_view_order_radar(uuid) is
  'Radar de pedidos libres con buffer de busqueda: 1 km (60 s), 3 km (3 min), 8 km (7 min) y luego toda la ciudad.';

notify pgrst, 'reload schema';
