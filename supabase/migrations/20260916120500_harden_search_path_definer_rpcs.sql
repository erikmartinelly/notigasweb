-- ============================================================================
-- M7: Agregar pg_temp al search_path de los RPC SECURITY DEFINER que aun no
-- lo incluyen. PostgreSQL busca pg_temp implicitamente PRIMERO salvo que se lo
-- liste explicitamente; sin la lista, un objeto temporal del llamante podria
-- secuestrar nombres sin calificar dentro de la funcion.
--
-- Estado verificado contra la definicion vigente (ultima en supabase/migrations):
--   rpc_delete_local_ad            (20260825200000) SET search_path 'public','auth'
--   rpc_reportar_incumplimiento_precio (20260916005329) SET search_path public, private
--   rpc_driver_set_quick_status    (20260907150000) SET search_path 'public'
--   rpc_admin_list_users           (20260825144100) SET search_path public
-- ============================================================================
BEGIN;

ALTER FUNCTION public.rpc_delete_local_ad(uuid, text)
  SET search_path = 'public', 'auth', 'pg_temp';

ALTER FUNCTION public.rpc_reportar_incumplimiento_precio(uuid, numeric, text)
  SET search_path = public, private, pg_temp;

ALTER FUNCTION public.rpc_driver_set_quick_status(uuid, text)
  SET search_path = 'public', 'pg_temp';

ALTER FUNCTION public.rpc_admin_list_users()
  SET search_path = public, pg_temp;

COMMIT;