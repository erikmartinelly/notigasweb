-- =============================================================================
-- Bolivia sin cobros: rpc_assign_order deja de bloquear por credito
-- =============================================================================
-- Contexto: la migracion 20261003233759 reintrodujo en rpc_assign_order() las
-- puertas de la era Peru (250 pedidos cobrables, S/ 50 pendientes y "remesa
-- Yape"). La interfaz y el README de Bolivia dicen lo contrario: NOTIGAS no
-- cobra comisiones ni bloquea por saldo. El resultado era que un recolector
-- habilitado no podia tomar pedidos aunque la app le indicara que es gratis.
--
-- Esta migracion reemplaza SOLO las reglas de cobro y de categoria. Conserva
-- intactas las validaciones que si aplican:
--   1. sesion autenticada (auth.uid()),
--   2. usuario no baneado (public.is_banned()),
--   3. recolector habilitado en choferes_habilitados,
--   4. cuenta aprobada y activa (estado_verificacion / estado_servicio /
--      bloqueado, este ultimo solo por sancion administrativa),
--   5. pedido existente y bloqueado con FOR UPDATE,
--   6. ciudad del pedido igual a la ciudad del recolector,
--   7. categoria del pedido entre los materiales del recolector, usando el
--      catalogo vigente y soportando listas multi-material
--      (private.driver_matches_order_category).
--
-- Ademas se conserva el registro del inicio del plazo de 24h
-- (driver_assigned_at) y la entrega sin comision (comision_entrega = 0).

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
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;
  if public.is_banned() then
    raise exception 'El usuario esta baneado o no autorizado';
  end if;

  select * into v_driver
    from public.choferes_habilitados
   where user_id = v_uid
   limit 1
   for update;
  if not found then
    raise exception 'El usuario no es un repartidor habilitado';
  end if;

  if lower(trim(coalesce(v_driver.estado_verificacion, ''))) <> 'aprobado' then
    raise exception 'Tu cuenta aun no esta aprobada para tomar pedidos';
  end if;

  -- Solo sancion administrativa. NOTIGAS Bolivia no cobra comisiones, no exige
  -- remesas y no bloquea por ciclo de pedidos ni por monto pendiente.
  if coalesce(v_driver.bloqueado, false)
     or coalesce(v_driver.estado_servicio, 'activo') <> 'activo' then
    raise exception 'Tu cuenta esta suspendida por una sancion administrativa';
  end if;

  select * into v_order
    from public.pedidos
   where id = p_order_id
   for update;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if lower(trim(coalesce(v_order.ciudad, ''))) <> lower(trim(coalesce(v_driver.ciudad, ''))) then
    raise exception 'El pedido no pertenece a la ciudad del repartidor';
  end if;

  if not private.driver_matches_order_category(v_order.categoria, v_driver.categoria) then
    raise exception 'El pedido no corresponde a la categoria del repartidor';
  end if;

  if v_order.estado = 'asignado' then
    if v_order.driver_id = v_uid then
      return jsonb_build_object('ok', true, 'message', 'Pedido ya asignado a ti');
    end if;
    raise exception 'Este pedido ya fue tomado por otro repartidor';
  end if;

  if v_order.estado not in ('pendiente', 'visto') then
    raise exception 'El pedido ya no esta disponible para asignacion';
  end if;

  perform set_config('notigas.internal_order_mutation', '1', true);
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

comment on function public.rpc_assign_order(uuid) is
  'Asigna un pedido al recolector autenticado. Valida sesion, baneo, habilitacion, ciudad y categoria; no aplica cobros ni limites de credito (Bolivia).';

do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'rpc_assign_order'
  ) then
    raise exception 'rpc_assign_order no quedo definida tras la migracion';
  end if;
end $$;
