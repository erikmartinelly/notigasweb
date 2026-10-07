/* ==========================================================================
   HARDENING DE FUNCIONES SECURITY DEFINER (auditoria RPC)
   ==========================================================================

   1) private.reward_driver_on_time_pickup() es una funcion de TRIGGER que
      estaba ejecutable por anon y authenticated. Un trigger se dispara con
      los privilegios del owner sin requerir EXECUTE, asi que el GRANT es
      superfluo y sobra superficie. Se revoca de PUBLIC.

   2) public.driver_registered_city(p_uid) era SECURITY DEFINER y devolvia
      la ciudad registrada de CUALQUIER user_id: cualquiera (incl. anon,
      y sin necesidad de sesion) podia sondear si un uid era conductor y en
      que ciudad. Se vara para que solo responda para el propio
      auth.uid(). La politica driver_public_profiles_public_read la llama
      precisamente con auth.uid(), asi que no cambia su comportamiento. Con
      search_path fijado a '' porque se usa dentro de RLS.
      Retorna NULL para cualquier p_uid distinto del sesion.

      OJO: no es STRICT (anon la llama con NULL y debe seguir devolviendo
      NULL igual que antes: branch 1 de la politica = NULL IS NULL).

   3) public.rpc_get_demand_clusters_v2 era SECURITY DEFINER ejecutable por
      anon, SIN search_path, devolvia order_ids y centros de demanda de
      cualquier ciudad sin validar rol, y ademas esta ROTA: referencia
      pedidos.precio_final que no existe en la tabla. No la llama nadie
      (ni BD, ni frontend, ni server). Se elimina.

   4) public.rpc_accept_demand_cluster_v2 se deja (ya valida uid +
      conductor + ciudad), pero se le quita el acceso a anon y se fija
      search_path para cerrar el aviso 0011 del advisor.
   ========================================================================== */

-- 1) trigger funcion: sin EXECUTE publico
revoke all on function private.reward_driver_on_time_pickup() from public;
grant execute on function private.reward_driver_on_time_pickup() to service_role;

-- 2) driver_registered_city: solo responde por el propio auth.uid()
create or replace function public.driver_registered_city(p_uid text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p_uid is distinct from auth.uid()::text then null::text
           else (select lower(btrim(coalesce(c.ciudad, '')))
                   from public.choferes_habilitados c
                  where c.user_id = p_uid
                  limit 1)
         end;
$$;

revoke all on function public.driver_registered_city(text) from public;
grant execute on function public.driver_registered_city(text) to anon, authenticated, service_role;

-- 3) rpc_get_demand_clusters_v2: muerta, rota y con fuga. Se elimina.
drop function if exists public.rpc_get_demand_clusters_v2(text, text, double precision, integer);

-- 4) rpc_accept_demand_cluster_v2: search_path fijo + sin anon
alter function public.rpc_accept_demand_cluster_v2(uuid[], text) set search_path = '';
revoke all on function public.rpc_accept_demand_cluster_v2(uuid[], text) from public, anon;
grant execute on function public.rpc_accept_demand_cluster_v2(uuid[], text) to authenticated, service_role;