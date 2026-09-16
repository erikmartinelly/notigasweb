-- Queja verificable por precio publicado incumplido.
alter table public.denuncias
  add column if not exists pedido_id uuid references public.pedidos(id) on delete set null,
  add column if not exists precio_publicado numeric(10,2),
  add column if not exists precio_reportado numeric(10,2);

create unique index if not exists denuncias_precio_publicado_pedido_unica
  on public.denuncias (pedido_id)
  where motivo = 'Incumplimiento de precio publicado';

create or replace function public.rpc_reportar_incumplimiento_precio(
  p_order_id uuid,
  p_precio_cobrado numeric,
  p_detalle text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_order public.pedidos%rowtype;
  v_driver public.choferes_habilitados%rowtype;
  v_report_id uuid;
begin
  if v_uid is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') = 'true' then
    raise exception 'Debes iniciar sesión para reportar un precio';
  end if;
  if p_precio_cobrado is null or p_precio_cobrado < 0 or p_precio_cobrado > 1000 then
    raise exception 'El precio reportado no es válido';
  end if;

  select * into v_order from public.pedidos where id = p_order_id;
  if not found or v_order.user_id <> v_uid or v_order.driver_id is null
     or v_order.estado not in ('asignado', 'entregado') then
    raise exception 'No puedes reportar este pedido';
  end if;

  select * into v_driver from public.choferes_habilitados where user_id = v_order.driver_id;
  if not found or v_driver.precio_balon_10kg is null then
    raise exception 'Este repartidor no tiene un precio publicado verificable';
  end if;

  insert into public.denuncias (
    denunciante_id, user_id, denunciado_id, telefono_denunciado, motivo, detalles,
    pedido_id, precio_publicado, precio_reportado
  ) values (
    v_uid, v_uid, v_order.driver_id, v_driver.telefono_whatsapp,
    'Incumplimiento de precio publicado',
    concat('Pedido ', v_order.id, '. Precio publicado: S/ ', v_driver.precio_balon_10kg,
      '. Precio cobrado reportado: S/ ', p_precio_cobrado,
      case when nullif(trim(coalesce(p_detalle, '')), '') is null then '' else '. Detalle: ' || left(trim(p_detalle), 300) end),
    v_order.id, v_driver.precio_balon_10kg, p_precio_cobrado
  ) on conflict (pedido_id) where motivo = 'Incumplimiento de precio publicado'
    do nothing returning id into v_report_id;

  return jsonb_build_object('ok', true, 'report_id', v_report_id, 'already_reported', v_report_id is null);
end;
$$;

revoke all on function public.rpc_reportar_incumplimiento_precio(uuid, numeric, text) from public, anon;
grant execute on function public.rpc_reportar_incumplimiento_precio(uuid, numeric, text) to authenticated;
