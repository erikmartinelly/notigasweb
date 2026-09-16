-- Los pedidos libres son un recurso operativo exclusivo de repartidores activos.
-- Ni visitantes, ni compradores registrados, ni cuentas suspendidas pueden leer
-- order_public_radar. Un pedido asignado se elimina de esta tabla por trigger.

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
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return false;
  end if;

  select id, user_id, categoria, ciudad, estado, driver_id
    into p
    from public.pedidos
   where id = p_order_id;

  if not found
     or p.user_id = v_uid
     or p.driver_id is not null
     or p.estado not in ('pendiente', 'visto') then
    return false;
  end if;

  select categoria, ciudad, estado_verificacion, bloqueado, estado_servicio
    into d
    from public.choferes_habilitados
   where user_id = v_uid
   limit 1;

  -- Ser un usuario autenticado no basta: debe ser repartidor aprobado y activo.
  if not found
     or lower(trim(coalesce(d.estado_verificacion, ''))) <> 'aprobado'
     or coalesce(d.bloqueado, false)
     or coalesce(d.estado_servicio, 'activo') <> 'activo'
     or lower(trim(coalesce(d.ciudad, ''))) <> lower(trim(coalesce(p.ciudad, ''))) then
    return false;
  end if;

  oc := lower(trim(coalesce(p.categoria, '')));
  dc := lower(trim(coalesce(d.categoria, '')));
  if oc ilike '%gas%' or oc ilike '%glp%' or oc ilike '%garrafa%' or oc ilike '%balon%' or oc ilike '%balón%' then oc := 'gas';
  elsif oc ilike '%agua%' or oc ilike '%botell%' then oc := 'agua'; end if;
  if dc ilike '%gas%' or dc ilike '%glp%' or dc ilike '%garrafa%' or dc ilike '%balon%' or dc ilike '%balón%' then dc := 'gas';
  elsif dc ilike '%agua%' or dc ilike '%botell%' then dc := 'agua'; end if;

  return oc = dc;
end;
$$;

revoke all on function private.can_view_order_radar(uuid) from public, anon;
grant execute on function private.can_view_order_radar(uuid) to authenticated;

drop policy if exists order_public_radar_registered_read on public.order_public_radar;
create policy order_public_radar_active_driver_read on public.order_public_radar
for select to authenticated
using (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and private.can_view_order_radar(order_id)
);

-- Reconciliación defensiva para instalaciones que ya contenían filas obsoletas.
delete from public.order_public_radar radar
using public.pedidos p
where p.id = radar.order_id
  and (p.driver_id is not null or p.estado not in ('pendiente', 'visto'));

notify pgrst, 'reload schema';
