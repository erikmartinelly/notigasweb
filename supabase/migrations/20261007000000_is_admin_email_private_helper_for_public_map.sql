-- Contrato de frontera pública: los helpers de administración NO deben ser
-- invocables como RPC por anon. `public.is_admin_email()` devolvía `false` a
-- anon (200), rompiendo el test "is_admin_email no es RPC anónimo".
--
-- La vista pública `pedidos_publicos` necesita el helper para anon, por lo que
-- movemos la versión anon-safe a `private` (no expuesta por PostgREST) y
-- revocamos EXECUTE a anon sobre la versión pública, que sólo usan
-- authenticated/service_role (policies RLS de administración).

create or replace function private.is_admin_email()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin_email_internal();
$$;

revoke all on function private.is_admin_email() from public;
grant execute on function private.is_admin_email() to anon, authenticated, service_role;

create or replace view public.pedidos_publicos as
 SELECT id,
        CASE
            WHEN user_id = auth.uid()::text OR driver_id = auth.uid()::text OR requested_driver_id = auth.uid()::text OR private.is_admin_email() OR private.can_view_order_contact(id) THEN user_id
            ELSE NULL::text
        END AS user_id,
    categoria,
    titulo,
        CASE
            WHEN estado <> ALL (ARRAY['pendiente'::text, 'visto'::text]) THEN NULL::text
            ELSE descripcion
        END AS descripcion,
    cantidad,
        CASE
            WHEN user_id = auth.uid()::text OR driver_id = auth.uid()::text OR requested_driver_id = auth.uid()::text OR private.is_admin_email() OR private.can_view_order_contact(id) THEN direccion
            ELSE NULL::text
        END AS direccion,
        CASE
            WHEN user_id = auth.uid()::text OR driver_id = auth.uid()::text OR requested_driver_id = auth.uid()::text OR private.is_admin_email() OR private.can_view_order_contact(id) THEN telefono
            ELSE NULL::text
        END AS telefono,
    estado,
        CASE
            WHEN driver_id = auth.uid()::text OR private.is_admin_email() THEN driver_id
            ELSE NULL::text
        END AS driver_id,
    ciudad,
    barrio_otb,
    latitude,
    longitude,
    visto,
    created_at,
    updated_at,
    subestado
   FROM pedidos p
  WHERE private.is_admin_email() OR user_id = auth.uid()::text OR driver_id = auth.uid()::text OR requested_driver_id = auth.uid()::text OR private.can_view_order_contact(id) OR (estado = ANY (ARRAY['pendiente'::text, 'visto'::text])) OR public.auth_user_city() <> ''::text AND lower(btrim(COALESCE(ciudad, ''::text))) = public.auth_user_city() AND (estado = ANY (ARRAY['pendiente'::text, 'visto'::text]));

alter view public.pedidos_publicos set (security_invoker = false);
grant select on public.pedidos_publicos to anon, authenticated;

revoke execute on function public.is_admin_email() from anon;
