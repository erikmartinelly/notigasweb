-- 023_security_hardening.sql
-- Consolidación de políticas y funciones de seguridad

-- 1. Eliminar funciones antiguas no seguras o en desuso (con firmas completas)
DROP FUNCTION IF EXISTS rpc_get_demand_clusters(text, text, integer);
DROP FUNCTION IF EXISTS rpc_accept_demand_cluster(text, text, text, integer);
DROP FUNCTION IF EXISTS rpc_get_demand_clusters_v2(text, text, double precision, integer); -- se vuelve a crear en el script 021

-- 2. Función para eliminar cuenta de usuario
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Obtener el ID del usuario que ejecuta la función
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Debes iniciar sesión para eliminar tu cuenta.';
  END IF;

  -- Eliminar la cuenta del usuario de la tabla auth.users
  -- Las llaves foráneas con ON DELETE CASCADE limpiarán los datos relacionados
  DELETE FROM auth.users WHERE id = v_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Reprogramar TTLs (movidos desde 001) para asegurar que las tablas existan
DO $$
BEGIN
  -- Intentamos desprogramar por si existían, para que sea idempotente (puede fallar si no existe pg_cron pero asumimos que está activo)
  BEGIN
    PERFORM cron.unschedule('purge-old-pedidos');
    PERFORM cron.unschedule('purge-old-avisos');
  EXCEPTION WHEN OTHERS THEN
    -- Ignorar errores si pg_cron no está activo en esta db o si no existían
  END;
END $$;

select cron.schedule(
  'purge-old-pedidos',
  '0 * * * *',
  $$ delete from pedidos where created_at < now() - interval '2 days'; $$
);

select cron.schedule(
  'purge-old-avisos',
  '0 0 * * *',
  $$ delete from avisos where created_at < now() - interval '72 hours'; $$
);

-- 4. Endurecer política de choferes_habilitados (remover "USING true" si alguna migración anterior la dejó)
DROP POLICY IF EXISTS "Public SELECT choferes" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Auth SELECT choferes" ON public.choferes_habilitados;
CREATE POLICY "Auth SELECT choferes" ON public.choferes_habilitados FOR SELECT USING (
    auth.uid()::text = user_id OR is_admin_email()
);
