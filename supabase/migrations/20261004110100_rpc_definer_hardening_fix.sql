/* Correccion de driver_registered_city aplicada en rpc_definer_hardening:
   la version anterior devolvia '' (cadena vacia) en el branch ELSE cuando
   no habia fila, pero la politica driver_public_profiles_public_read
   espera NULL en el primer branch para que un anon (auth.uid() nulo) siga
   viendo las fichas publicas. La subconsulta escalar sin filas devuelve
   NULL, preservando la semantica original. */

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