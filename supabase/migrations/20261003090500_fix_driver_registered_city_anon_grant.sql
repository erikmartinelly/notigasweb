-- La politica driver_public_profiles_public_read aplica a anon y authenticated.
-- Sin permiso EXECUTE para anon, el usuario anonimo recibia "permission denied"
-- al listar recolectores desde choferes_publicos.
revoke all on function public.driver_registered_city(text) from public;
grant execute on function public.driver_registered_city(text) to anon, authenticated, service_role;
