-- Cierre de privilegios sobre funciones de solicitudes_otros
-- Evita la exposición de la función de trigger como endpoint RPC de PostgREST.

REVOKE ALL ON FUNCTION public.guard_solicitud_otros_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_solicitudes_otros_stats(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_solicitudes_otros_stats(integer) TO authenticated, service_role;
