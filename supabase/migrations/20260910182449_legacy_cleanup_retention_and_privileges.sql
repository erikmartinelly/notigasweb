-- Recovered from the applied Supabase migration history to restore Git/remote parity.
-- NOTIGAS: remove legacy business paths, protect sensitive storage, archive before purge,
-- and finish least-privilege cleanup.

-- 1) No authenticated user can call the legacy generic ban function.
DO $$
BEGIN
  IF to_regprocedure('public.rpc_banear_repartidor_completo(text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_banear_repartidor_completo(text,text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rpc_banear_repartidor_completo(text,text) TO service_role;
  END IF;
END $$;

-- Obsolete trigger function: trigger was already removed in the accounting migration.
DROP FUNCTION IF EXISTS public.trg_generar_cobro_al_alcanzar_limite();

-- 2) Remove anonymous execution from RPCs that require a signed-in user/admin.
DO $$
BEGIN
  IF to_regprocedure('public.rpc_actualizar_aviso_propio(uuid,text,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_actualizar_aviso_propio(uuid,text,text,text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_actualizar_aviso_propio(uuid,text,text,text) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.rpc_actualizar_precio_gas_chofer(numeric)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_actualizar_precio_gas_chofer(numeric) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_actualizar_precio_gas_chofer(numeric) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.rpc_admin_get_metrics()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_admin_get_metrics() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_admin_get_metrics() TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.rpc_admin_list_users()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_admin_list_users() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_admin_list_users() TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.rpc_crear_aviso_vecinal(text,text,text,text,text,text,text,text,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_crear_aviso_vecinal(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text,text,text,text,text,text,text,text,text,text) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.rpc_get_my_assigned_orders()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_get_my_assigned_orders() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.rpc_update_order_location(uuid,double precision,double precision)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rpc_update_order_location(uuid,double precision,double precision) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_update_order_location(uuid,double precision,double precision) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.check_driver_not_blocked_trigger()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.check_driver_not_blocked_trigger() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 3) Vouchers are sensitive. New payment flow keeps OCR local and stores structured data only.
UPDATE storage.buckets
SET public = false
WHERE id IN ('vouchers-comisiones','vouchers-premium');

DROP POLICY IF EXISTS "Vouchers Comisiones Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Vouchers Premium Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Vouchers Comisiones Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Vouchers Premium Auth Insert" ON storage.objects;

-- 4) Preserve permanent antifraud records when an account is deleted.
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uuid uuid := auth.uid();
  v_uid text;
  v_email text;
BEGIN
  IF v_uuid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  v_uid := v_uuid::text;
  SELECT lower(trim(coalesce(email,''))) INTO v_email
  FROM auth.users WHERE id=v_uuid;

  DELETE FROM public.votos_registro
  WHERE user_id=v_uid
     OR (tipo_entidad='aviso' AND entidad_id IN (SELECT id FROM public.avisos WHERE user_id=v_uid))
     OR (tipo_entidad='comentario' AND entidad_id IN (
          SELECT c.id FROM public.comentarios_avisos c
          WHERE c.user_id=v_uid OR c.aviso_id IN (SELECT a.id FROM public.avisos a WHERE a.user_id=v_uid)
        ))
     OR (tipo_entidad='pedido' AND entidad_id IN (
          SELECT id FROM public.pedidos WHERE user_id=v_uid OR driver_id=v_uid
        ));

  DELETE FROM public.comentarios_avisos
  WHERE user_id=v_uid OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id=v_uid);
  DELETE FROM public.avisos WHERE user_id=v_uid;
  DELETE FROM public.pedidos WHERE user_id=v_uid OR driver_id=v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id=v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id=v_uid;
  DELETE FROM public.anuncios_globales WHERE user_id=v_uid;
  DELETE FROM public.denuncias WHERE user_id=v_uid OR denunciante_id=v_uid OR denunciado_id=v_uid;
  DELETE FROM public.reportes_spam WHERE user_id=v_uid;

  DELETE FROM public.usuarios_baneados
  WHERE coalesce(permanente,false)=false
    AND (user_id=v_uid OR (v_email<>'' AND lower(trim(coalesce(email,'')))=v_email));

  DELETE FROM public.profiles WHERE id=v_uuid;
  DELETE FROM auth.users WHERE id=v_uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id text, p_email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_uid text := trim(coalesce(p_user_id,''));
  v_email text := lower(trim(coalesce(p_email,'')));
  v_target_uuid uuid := NULL;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  IF v_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_target_uuid := v_uid::uuid;
  END IF;

  IF v_target_uuid IS NULL AND v_email<>'' THEN
    SELECT id INTO v_target_uuid FROM auth.users
    WHERE lower(trim(email))=v_email LIMIT 1;
    IF v_target_uuid IS NOT NULL THEN v_uid:=v_target_uuid::text; END IF;
  END IF;

  IF v_target_uuid IS NOT NULL AND v_email='' THEN
    SELECT lower(trim(coalesce(email,''))) INTO v_email FROM auth.users WHERE id=v_target_uuid;
  END IF;

  IF v_email<>'' AND EXISTS (
    SELECT 1 FROM public.admin_credentials WHERE lower(trim(email))=v_email
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora desde el panel';
  END IF;

  IF v_uid<>'' THEN
    DELETE FROM public.votos_registro
    WHERE user_id=v_uid
       OR (tipo_entidad='aviso' AND entidad_id IN (SELECT id FROM public.avisos WHERE user_id=v_uid))
       OR (tipo_entidad='comentario' AND entidad_id IN (SELECT id FROM public.comentarios_avisos WHERE user_id=v_uid))
       OR (tipo_entidad='pedido' AND entidad_id IN (SELECT id FROM public.pedidos WHERE user_id=v_uid OR driver_id=v_uid));
    DELETE FROM public.comentarios_avisos WHERE user_id=v_uid OR aviso_id IN (SELECT id FROM public.avisos WHERE user_id=v_uid);
    DELETE FROM public.avisos WHERE user_id=v_uid;
    DELETE FROM public.pedidos WHERE user_id=v_uid OR driver_id=v_uid;
    DELETE FROM public.rutas_repartidores WHERE user_id=v_uid;
    DELETE FROM public.choferes_habilitados WHERE user_id=v_uid;
    DELETE FROM public.denuncias WHERE user_id=v_uid OR denunciante_id=v_uid OR denunciado_id=v_uid;
    DELETE FROM public.reportes_spam WHERE user_id=v_uid;
    DELETE FROM public.usuarios_baneados
      WHERE coalesce(permanente,false)=false AND user_id=v_uid;
  END IF;

  IF v_email<>'' THEN
    DELETE FROM public.usuarios_baneados
      WHERE coalesce(permanente,false)=false AND lower(trim(coalesce(email,'')))=v_email;
  END IF;

  IF v_target_uuid IS NOT NULL THEN
    DELETE FROM public.profiles WHERE id=v_target_uuid;
    DELETE FROM auth.users WHERE id=v_target_uuid;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(text,text) TO authenticated, service_role;

-- 5) Archive every order before scheduled deletion. Keep history 180 days.
CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_pedidos_deleted integer := 0;
  v_pedidos_archived integer := 0;
  v_avisos_deleted integer := 0;
  v_rutas_deleted integer := 0;
  v_comentarios_deleted integer := 0;
  v_mensajes_foro_deleted integer := 0;
  v_archivo_deleted integer := 0;
BEGIN
  WITH candidatos AS (
    SELECT p.*
    FROM public.pedidos p
    WHERE (p.estado IN ('entregado','cancelado') AND p.updated_at < now()-interval '24 hours')
       OR (p.created_at < now()-interval '48 hours')
  ), ins AS (
    INSERT INTO public.pedidos_archivo(
      id,user_id,categoria,titulo,descripcion,cantidad,direccion,telefono,estado,driver_id,
      ciudad,barrio_otb,latitude,longitude,visto,created_at,updated_at,archived_at
    )
    SELECT id,user_id,categoria,titulo,descripcion,cantidad,direccion,telefono,estado,driver_id,
           ciudad,barrio_otb,latitude,longitude,visto,created_at,updated_at,now()
    FROM candidatos
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_archived FROM ins;

  WITH d AS (
    DELETE FROM public.pedidos p
    WHERE (p.estado IN ('entregado','cancelado') AND p.updated_at < now()-interval '24 hours')
       OR (p.created_at < now()-interval '48 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  WITH d AS (DELETE FROM public.avisos WHERE created_at < now()-interval '48 hours' RETURNING id)
  SELECT count(*) INTO v_avisos_deleted FROM d;

  WITH d AS (DELETE FROM public.comentarios_avisos WHERE created_at < now()-interval '48 hours' RETURNING id)
  SELECT count(*) INTO v_comentarios_deleted FROM d;

  WITH d AS (DELETE FROM public.mensajes_foro WHERE created_at < now()-interval '48 hours' RETURNING id)
  SELECT count(*) INTO v_mensajes_foro_deleted FROM d;

  WITH d AS (DELETE FROM public.rutas_repartidores WHERE last_active < now()-interval '2 hours' RETURNING id)
  SELECT count(*) INTO v_rutas_deleted FROM d;

  WITH d AS (DELETE FROM public.pedidos_archivo WHERE archived_at < now()-interval '180 days' RETURNING id)
  SELECT count(*) INTO v_archivo_deleted FROM d;

  RETURN jsonb_build_object(
    'success',true,
    'pedidos_archivados',v_pedidos_archived,
    'pedidos_eliminados',v_pedidos_deleted,
    'avisos_eliminados',v_avisos_deleted,
    'comentarios_eliminados',v_comentarios_deleted,
    'mensajes_foro_eliminados',v_mensajes_foro_deleted,
    'rutas_eliminadas',v_rutas_deleted,
    'archivo_antiguo_eliminado',v_archivo_deleted
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_purge_old_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO service_role;

CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$ BEGIN PERFORM public.rpc_purge_old_records(); END; $$;
REVOKE ALL ON FUNCTION public.purge_old_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_records() TO service_role;

-- Remove weekly debt cron from the old model; keep only safe hourly retention.
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    FOR r IN SELECT jobid FROM cron.job WHERE jobname IN ('corte_semanal_domingos','baneo_semanal_lunes','purge_records_hourly') LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;
    PERFORM cron.schedule('purge_records_hourly','0 * * * *','SELECT public.rpc_purge_old_records()');
  END IF;
END $$;

-- 6) Integrity and performance constraints/indexes.
CREATE INDEX IF NOT EXISTS idx_notificaciones_repartidor_pedido_id ON public.notificaciones_repartidor(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_driver_id ON public.pagos_comisiones(driver_id);
CREATE INDEX IF NOT EXISTS idx_registro_comisiones_driver_id ON public.registro_comisiones(driver_id);
DROP INDEX IF EXISTS public.idx_pagos_comisiones_tx_unique;

ALTER TABLE public.pagos_comisiones DROP CONSTRAINT IF EXISTS pagos_comisiones_estado_check;
ALTER TABLE public.pagos_comisiones ADD CONSTRAINT pagos_comisiones_estado_check CHECK (
  estado IN ('generado','pendiente','pendiente_revision','requiere_revision','pendiente_verificacion_recepcion',
             'ocr_no_valido','confirmado','aprobado','no_recibido','rechazado','fraude_confirmado')
);

ALTER TABLE public.choferes_habilitados DROP CONSTRAINT IF EXISTS choferes_estado_servicio_check;
ALTER TABLE public.choferes_habilitados ADD CONSTRAINT choferes_estado_servicio_check CHECK (
  estado_servicio IN ('activo','suspendido_tope','suspendido','inactivo','baneado')
);
ALTER TABLE public.choferes_habilitados DROP CONSTRAINT IF EXISTS choferes_estado_verificacion_check;
ALTER TABLE public.choferes_habilitados ADD CONSTRAINT choferes_estado_verificacion_check CHECK (
  estado_verificacion IN ('aprobado','pendiente','rechazado','bloqueado')
);

DROP POLICY IF EXISTS "Drivers can read their own commission records" ON public.registro_comisiones;
CREATE POLICY "Drivers can read their own commission records"
ON public.registro_comisiones FOR SELECT TO authenticated
USING (user_id=(select auth.uid())::text OR (select public.is_admin_email()));

DROP POLICY IF EXISTS "Drivers can read own commission payments" ON public.pagos_comisiones;
CREATE POLICY "Drivers can read own commission payments"
ON public.pagos_comisiones FOR SELECT TO authenticated
USING (user_id=(select auth.uid())::text OR (select public.is_admin_email()));

DROP POLICY IF EXISTS "Drivers can insert own commission payments" ON public.pagos_comisiones;

DROP POLICY IF EXISTS "notificaciones_repartidor_select_own" ON public.notificaciones_repartidor;
CREATE POLICY "notificaciones_repartidor_select_own"
ON public.notificaciones_repartidor FOR SELECT TO authenticated
USING (user_id=(select auth.uid())::text OR (select public.is_admin_email()));

DROP POLICY IF EXISTS "notificaciones_repartidor_update_own" ON public.notificaciones_repartidor;
CREATE POLICY "notificaciones_repartidor_update_own"
ON public.notificaciones_repartidor FOR UPDATE TO authenticated
USING (user_id=(select auth.uid())::text OR (select public.is_admin_email()))
WITH CHECK (user_id=(select auth.uid())::text OR (select public.is_admin_email()));

NOTIFY pgrst, 'reload schema';
