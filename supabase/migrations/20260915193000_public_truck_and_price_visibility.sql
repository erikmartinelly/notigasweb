-- Presencia comercial pública: visitantes y compradores pueden ver camiones activos
-- y el precio publicado, sin abrir pedidos ni datos de contacto/identidad.

drop policy if exists driver_public_profiles_registered_read on public.driver_public_profiles;
drop policy if exists driver_public_profiles_public_read on public.driver_public_profiles;
create policy driver_public_profiles_public_read on public.driver_public_profiles
for select to anon, authenticated
using (true);

drop policy if exists driver_public_presence_registered_read on public.driver_public_presence;
drop policy if exists driver_public_presence_public_read on public.driver_public_presence;
create policy driver_public_presence_public_read on public.driver_public_presence
for select to anon, authenticated
using (true);

grant select on public.driver_public_profiles to anon, authenticated;
grant select on public.driver_public_presence to anon, authenticated;
grant select on public.choferes_publicos to anon, authenticated;
grant select on public.rutas_repartidores_publicas to anon, authenticated;

-- No se concede acceso anónimo al radar ni a pedidos, rutas base o perfiles privados.
revoke all on public.order_public_radar from anon;
revoke all on public.pedidos_publicos from anon;
