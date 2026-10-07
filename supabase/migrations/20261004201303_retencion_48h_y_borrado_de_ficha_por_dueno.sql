/* ==========================================================================
   RETENCION UNICA DE 48 HORAS  +  FICHA DEL RECOLECTOR: SOLO DUENO O ADMIN
   ==========================================================================
   1) rpc_purge_old_records() pasa de 24h a 48h y deja de borrar pedidos
      'asignado' antes de que rpc_sweep_expired_pickups() los libere y penalice.
      Ese era un bug real: el purge horario corria cada 60 min y el sweep cada
      15 min, pero un pedido asignado a las 2h de crearse se borraba a las 24h
      sin llegar a discharging penalizacion de estrella.
   2) Los pedidos con denuncia activa NO se borran: denuncias.pedido_id es
      FK NO ACTION y hacia fallar TODO el purge (una denuncia solita dejaba de
      purgar comentarios, avisos y pedidos a la vez).
   3) Los pedidos se archivan en pedidos_archivo antes de borrarse, asi la
      contabilidad historica no se pierde.
   ========================================================================== */

create or replace function public.rpc_purge_old_records()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_comentarios_deleted integer := 0;
  v_mensajes_foro_deleted integer := 0;
  v_avisos_deleted integer := 0;
  v_pedidos_archived integer := 0;
  v_pedidos_deleted integer := 0;
  v_eventos_deleted integer := 0;
  v_archivo_deleted integer := 0;
  v_denuncias_respetadas integer := 0;
begin
  -- 0) Contar pedidos con denuncia para no abortar el purge por la FK.
  select count(*) into v_denuncias_respetadas
  from public.pedidos p
  where p.created_at < now() - interval '48 hours'
    and exists (select 1 from public.denuncias d where d.pedido_id = p.id);

  -- 1) Comentarios de la 3ra pestana: 48h.
  with d as (
    delete from public.comentarios_avisos
    where created_at < now() - interval '48 hours'
    returning id
  ) select count(*) into v_comentarios_deleted from d;

  with d as (
    delete from public.mensajes_foro
    where created_at < now() - interval '48 hours'
    returning id
  ) select count(*) into v_mensajes_foro_deleted from d;

  -- 2) Avisos vecinales: 48h.
  with d as (
    delete from public.avisos
    where created_at < now() - interval '48 hours'
    returning id
  ) select count(*) into v_avisos_deleted from d;

  -- 3) Pedidos: fuera de 48h, en estado terminal o publicados sin tomar.
  --    Nunca en 'asignado': ese estado lo resuelve el sweep de 24h.
  with candidatos as (
    select p.id, p.user_id, p.categoria, p.titulo, p.descripcion, p.cantidad,
           p.direccion, p.telefono, p.estado, p.driver_id, p.ciudad,
           p.barrio_otb, p.latitude, p.longitude, p.visto, p.created_at, p.updated_at
    from public.pedidos p
    where p.created_at < now() - interval '48 hours'
      and coalesce(p.estado, 'pendiente') <> 'asignado'
      and not exists (select 1 from public.denuncias d where d.pedido_id = p.id)
  ), ins as (
    insert into public.pedidos_archivo(
      id,user_id,categoria,titulo,descripcion,cantidad,direccion,telefono,estado,driver_id,
      ciudad,barrio_otb,latitude,longitude,visto,created_at,updated_at,archived_at
    )
    select id,user_id,categoria,titulo,descripcion,cantidad,direccion,telefono,estado,driver_id,
           ciudad,barrio_otb,latitude,longitude,visto,created_at,updated_at,now()
    from candidatos
    on conflict (id) do nothing
    returning id
  ) select count(*) into v_pedidos_archived from ins;

  with d as (
    delete from public.pedidos p
    where p.created_at < now() - interval '48 hours'
      and coalesce(p.estado, 'pendiente') <> 'asignado'
      and not exists (select 1 from public.denuncias d where d.pedido_id = p.id)
    returning id
  ) select count(*) into v_pedidos_deleted from d;

  -- 4) Eventos de rating huerfanos de pedidos ya borrados.
  with d as (
    delete from public.driver_rating_events e
    where not exists (select 1 from public.pedidos p where p.id = e.order_id)
      and not exists (select 1 from public.pedidos_archivo p where p.id = e.order_id)
    returning e.order_id
  ) select count(*) into v_eventos_deleted from d;

  -- 5) El archivo historico se conserva 180 dias.
  with d as (
    delete from public.pedidos_archivo
    where archived_at < now() - interval '180 days'
    returning id
  ) select count(*) into v_archivo_deleted from d;

  return jsonb_build_object(
    'success', true,
    'retencion_horas', 48,
    'comentarios_eliminados', v_comentarios_deleted,
    'mensajes_foro_eliminados', v_mensajes_foro_deleted,
    'avisos_eliminados', v_avisos_deleted,
    'pedidos_archivados', v_pedidos_archived,
    'pedidos_eliminados', v_pedidos_deleted,
    'pedidos_con_denuncia_respetados', v_denuncias_respetadas,
    'eventos_rating_eliminados', v_eventos_deleted,
    'archivo_antiguo_eliminado', v_archivo_deleted
  );
end;
$function$;

revoke all on function public.rpc_purge_old_records() from public;
grant execute on function public.rpc_purge_old_records() to service_role;

/* --------------------------------------------------------------------------
   Ficha del recolector: la puede borrar el dueno o el administrador.
   Antes solo la podia borrar el admin, asi que un recolector no podia
   retirarse por si mismo.
   -------------------------------------------------------------------------- */
drop policy if exists choferes_delete on public.choferes_habilitados;

create policy choferes_delete
on public.choferes_habilitados
for delete
to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (
    (select auth.uid())::text = user_id
    or (select public.is_admin_email())
  )
);