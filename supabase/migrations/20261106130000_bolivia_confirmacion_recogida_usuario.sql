-- =============================================================================
-- Bolivia: el vecino confirma que su material ya fue recogido
-- =============================================================================
-- La ficha "Mis Pedidos" permite cerrar un pedido en cualquier estado activo
-- (pendiente, visto o asignado). El RPC existente rpc_confirm_order_received
-- exige driver_id, por lo que no sirve cuando el recolector recogio el material
-- sin haber tomado el pedido en la app.
--
-- Reglas:
--   - Solo el propietario (o un administrador) puede confirmar.
--   - Un pedido ya entregado/recibido responde idempotentemente.
--   - Un pedido cancelado no se puede confirmar.
--   - Al confirmarlo queda en 'entregado', sale del mapa y del radar de pedidos
--     libres. Si tenia recolector asignado, se contabiliza la entrega y se le
--     notifica; si no, solo se cierra el pedido.
--   - No se cobra comision ni se generan deudas (Bolivia).

create or replace function public.rpc_user_confirm_pickup(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid text := auth.uid()::text;
  v_order record;
  v_account jsonb;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  if public.is_banned() then
    raise exception 'El usuario esta suspendido';
  end if;

  select *
    into v_order
    from public.pedidos
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.user_id <> v_uid and not public.is_admin_email() then
    raise exception 'Acceso denegado: no eres el propietario de este pedido';
  end if;

  if v_order.estado in ('entregado', 'recibido') then
    return jsonb_build_object(
      'ok', true,
      'already_confirmed', true,
      'estado', v_order.estado
    );
  end if;

  if v_order.estado = 'cancelado' then
    raise exception 'El pedido fue cancelado y no puede confirmarse como recogido';
  end if;

  if v_order.estado not in ('pendiente', 'visto', 'asignado') then
    raise exception 'El pedido no se encuentra en un estado valido para confirmar la recogida';
  end if;

  perform set_config('notigas.internal_order_mutation', '1', true);

  update public.pedidos
     set estado = 'entregado',
         buyer_confirmed_received = true,
         buyer_confirmed_at = coalesce(buyer_confirmed_at, now()),
         delivery_resolution = case
           when driver_id is null then 'buyer_confirmed_pickup_without_driver'
           else 'buyer_confirmed_pickup'
         end,
         updated_at = now()
   where id = p_order_id;

  if v_order.driver_id is not null and btrim(v_order.driver_id) <> '' then
    begin
      select public.fn_contabilizar_entrega_confirmada(p_order_id, 'comprador_recogida')
        into v_account;
    exception when others then
      -- La confirmacion del vecino no debe fallar por contabilidad.
      v_account := jsonb_build_object('ok', false, 'warning', sqlerrm);
    end;

    insert into public.notificaciones_repartidor(
      user_id, pedido_id, tipo, titulo, mensaje
    ) values (
      v_order.driver_id,
      p_order_id,
      'comprador_confirma_recogida',
      'Recogida confirmada por el vecino',
      'El vecino confirmo que el material ya fue recogido. El pedido quedo finalizado.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'order_id', p_order_id,
    'estado', 'entregado',
    'confirmed_by', 'buyer',
    'accounting', coalesce(v_account, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_user_confirm_pickup(uuid) from public, anon;
grant execute on function public.rpc_user_confirm_pickup(uuid) to authenticated, service_role;

comment on function public.rpc_user_confirm_pickup(uuid) is
  'El propietario confirma que su material ya fue recogido. Cierra el pedido en entregado y lo retira del mapa/radar. Sin comisiones (Bolivia).';

do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'rpc_user_confirm_pickup'
  ) then
    raise exception 'rpc_user_confirm_pickup no quedo definida tras la migracion';
  end if;
end $$;
