-- 094_driver_quick_status_security_hardening.sql
-- Harden execute permissions and search path for quick status RPCs and purge function

REVOKE EXECUTE ON FUNCTION public.rpc_driver_set_quick_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_set_quick_status(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_driver_release_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_release_order(uuid, text) TO authenticated;

-- Fix mutable search_path on purge_old_records
CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    DELETE FROM public.pedidos 
    WHERE created_at < NOW() - INTERVAL '24 hours';

    DELETE FROM public.avisos 
    WHERE created_at < NOW() - INTERVAL '24 hours';

    DELETE FROM public.comentarios_avisos 
    WHERE created_at < NOW() - INTERVAL '24 hours';

    DELETE FROM public.mensajes_foro 
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_old_records() TO authenticated, service_role;
