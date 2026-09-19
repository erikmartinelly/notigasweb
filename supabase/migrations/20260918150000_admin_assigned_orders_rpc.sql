-- Admin: listado de pedidos asignados con datos exactos (solo lectura).
-- Un administrador autenticado puede inspeccionar la operación de repartidores
-- sin tener ficha habilitada. El frontend consume este RPC en lugar de consultar
-- la tabla `pedidos` directamente, preservando el contrato de privacidad:
-- los teléfonos se entregan únicamente mediante RPC verificados en servidor.

create or replace function public.rpc_admin_list_assigned_orders()
returns setof public.pedidos
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin_email() then
    raise exception 'Acceso denegado: operación exclusiva de administradores';
  end if;

  return query
    select p.*
    from public.pedidos p
    where p.estado = 'asignado'
    order by p.created_at desc;
end;
$$;

revoke all on function public.rpc_admin_list_assigned_orders() from public, anon, authenticated;
grant execute on function public.rpc_admin_list_assigned_orders() to authenticated;