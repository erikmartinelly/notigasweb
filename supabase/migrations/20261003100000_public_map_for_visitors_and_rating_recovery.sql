-- ============================================================================
-- Mapa publico para visitantes + recuperacion de estrellas del recolector
-- ============================================================================
-- 1) Visitantes sin sesion vuelven a ver los pedidos abiertos del mapa. El
--    registro sigue siendo obligatorio para pedir: guard_optional_order_insert
--    exige auth.uid() con perfil, asi que el INSERT anónimo sigue bloqueado.
-- 2) El contacto (telefono/direccion/usuario) sigue enmascarado para terceros.
-- 3) Recuperacion de estrellas: confirmar la recoleccion dentro de las 24h
--    devuelve una estrella (piso 0, tope 5) al recolector que cumple.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Lectura publica del mapa (solo pedidos abiertos)
-- ---------------------------------------------------------------------------
drop policy if exists pedidos_select_publico_anon on public.pedidos;

create policy pedidos_select_publico_anon
  on public.pedidos
  for select
  to anon
  using (estado in ('pendiente', 'visto'));

alter table public.pedidos enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Vista publica: contacto enmascarado, contenido del pedido visible
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
    when p.estado not in ('pendiente', 'visto') then null::text
    else p.descripcion
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
   or (p.estado in ('pendiente', 'visto'))
   or (
     auth_user_city() <> ''
     and lower(btrim(coalesce(p.ciudad,''))) = auth_user_city()
     and p.estado in ('pendiente', 'visto')
   );

-- No se da SELECT sobre public.pedidos a anon: exponeria telefono/direccion
-- crudos. La vista se ejecuta como su dueno y aplica las reglas ella misma.
alter view public.pedidos_publicos set (security_invoker = false);
revoke select on public.pedidos from anon;
grant select on public.pedidos_publicos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Recuperacion de estrellas al cumplir dentro de las 24h
-- ---------------------------------------------------------------------------
create or replace function private.reward_driver_on_time_pickup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_driver_id uuid;
  v_prev numeric(3,2);
  v_new numeric(3,2);
  v_hours numeric(10,4);
begin
  if new.estado is distinct from 'entregado' then return new; end if;
  if old.estado is not distinct from 'entregado' then return new; end if;
  if new.driver_id is null then return new; end if;
  if new.driver_assigned_at is null then return new; end if;

  v_hours := extract(epoch from (now() - new.driver_assigned_at)) / 3600.0;
  if v_hours > 24 then return new; end if;

  select ch.id, ch.rating into v_driver_id, v_prev
    from public.choferes_habilitados ch
   where ch.user_id = new.driver_id
   limit 1
     for update;

  if v_driver_id is null then return new; end if;
  if coalesce(v_prev, 5.00) >= 5 then return new; end if;

  v_new := round(least(5, coalesce(v_prev, 5.00) + 1.00), 2);

  perform set_config('notigas.internal_driver_finance', '1', true);
  update public.choferes_habilitados
     set rating = v_new,
         rating_actualizado_at = now()
   where id = v_driver_id;

  insert into public.driver_rating_events(
    driver_id, driver_user_id, order_id, motivo, delta,
    rating_anterior, rating_nuevo
  ) values (
    v_driver_id, new.driver_id, new.id,
    'recoleccion_confirmada_en_plazo',
    round(v_new - coalesce(v_prev, 5.00), 2),
    round(coalesce(v_prev, 5.00), 2),
    v_new
  );

  return new;
end;
$function$;

drop trigger if exists trg_reward_driver_on_time_pickup on public.pedidos;

create trigger trg_reward_driver_on_time_pickup
  after update on public.pedidos
  for each row
  execute function private.reward_driver_on_time_pickup();

comment on function private.reward_driver_on_time_pickup() is
  'Devuelve una estrella al recolector que confirma la recoleccion dentro de las 24h (tope 5).';

comment on policy pedidos_select_publico_anon on public.pedidos is
  'Los visitantes sin sesion ven el mapa, pero solo pedidos aun no tomados; para pedir deben registrarse.';
