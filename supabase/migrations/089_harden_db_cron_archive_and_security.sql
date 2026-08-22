-- ==============================================================================
-- MIGRACIÓN 089: ENDURECIMIENTO DE BD, ARCHIVADO DE PEDIDOS, SEGURIDAD Y PG_CRON
-- ==============================================================================

-- 1. Crear tabla de archivo histórico para pedidos purgados
CREATE TABLE IF NOT EXISTS public.pedidos_archivo (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    categoria text,
    titulo text,
    descripcion text,
    cantidad text,
    direccion text,
    telefono text,
    estado text,
    driver_id text,
    ciudad text,
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    visto boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.pedidos_archivo ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pedidos_archivo TO authenticated, service_role;

-- 2. Eliminar la sobrecarga redundante de rpc_admin_delete_user(uuid)
DROP FUNCTION IF EXISTS public.rpc_admin_delete_user(uuid);

-- 3. Redefinir rpc_purge_old_records con archivado automático
CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedidos_archived integer := 0;
  v_pedidos_deleted integer := 0;
  v_rutas_deleted integer := 0;
BEGIN
  -- Permiso total si es llamado desde cron (superuser/postgres) o administrador
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') AND NOT public.is_admin_email() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado: requiere privilegios administrativos');
  END IF;

  -- A. Archivar pedidos terminados o antiguos (> 24h) antes del borrado
  WITH to_archive AS (
    SELECT * FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
  ),
  ins AS (
    INSERT INTO public.pedidos_archivo (
      id, user_id, categoria, titulo, descripcion, cantidad, direccion,
      telefono, estado, driver_id, ciudad, barrio_otb, latitude, longitude,
      visto, created_at, updated_at, archived_at
    )
    SELECT 
      id, user_id, categoria, titulo, descripcion, cantidad, direccion,
      telefono, estado, driver_id, ciudad, barrio_otb, latitude, longitude,
      visto, created_at, updated_at, now()
    FROM to_archive
    ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      driver_id = EXCLUDED.driver_id,
      updated_at = EXCLUDED.updated_at,
      archived_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_pedidos_archived FROM ins;

  -- B. Borrar pedidos archivados
  WITH d AS (
    DELETE FROM public.pedidos
    WHERE estado IN ('entregado', 'cancelado', 'recibido')
       OR created_at < (now() - interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  -- C. Eliminar rutas inactivas de repartidores (> 2 horas)
  WITH d AS (
    DELETE FROM public.rutas_repartidores
    WHERE last_active < (now() - interval '2 hours')
    RETURNING id
  ) SELECT count(*) INTO v_rutas_deleted FROM d;

  RETURN jsonb_build_object(
    'success', true,
    'pedidos_archivados', v_pedidos_archived,
    'pedidos_eliminados', v_pedidos_deleted,
    'rutas_eliminadas', v_rutas_deleted
  );
END;
$$;

-- 4. Restringir permisos: Revocar anon en funciones administrativas
REVOKE EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_purge_old_records() FROM anon;

GRANT EXECUTE ON FUNCTION public.rpc_save_local_ad(text, text, text, text, text, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_local_ad(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated, service_role;

-- 5. Limpieza y programación limpia de pg_cron
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Desprogramar todos los jobs antiguos o rotos
  FOR r IN (SELECT jobid FROM cron.job) LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  -- Programar un único job horario saludable que ejecute rpc_purge_old_records()
  PERFORM cron.schedule('purge_records_hourly', '0 * * * *', 'SELECT public.rpc_purge_old_records()');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no está disponible o no tiene permisos de schedule: %', SQLERRM;
END;
$$;

-- 6. Recarga de esquema de PostgREST
NOTIFY pgrst, 'reload schema';
