-- El mapa publico corre como visitante (security_invoker=false en la vista), pero
-- PostgreSQL exige EXECUTE sobre las funciones llamadas dentro de la vista para
-- el rol invocante. is_admin_email() era SECURITY INVOKER y al delegar en
-- private.is_admin_email_internal() pedia USAGE del schema private, que anon no tiene.
-- Pasarla a SECURITY DEFINER deja la logica de admin en un solo lugar y permite que
-- el mapa publico la evalue sin exponer el schema private.
-- El resultado no cambia: con auth.uid() NULL sigue devolviendo false.
revoke all on function public.is_admin_email() from public;
create or replace function public.is_admin_email()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_email_internal();
$$;
grant execute on function public.is_admin_email() to anon, authenticated, service_role;
