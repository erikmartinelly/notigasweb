-- Re-audit 2026-09-13: align retention with the 24-hour product contract and close an internal trigger RPC.

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
    SELECT p.* FROM public.pedidos p
    WHERE (p.estado IN ('entregado','cancelado','recibido') AND coalesce(p.updated_at,p.created_at) < now()-interval '24 hours')
       OR (p.created_at < now()-interval '24 hours')
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
    WHERE (p.estado IN ('entregado','cancelado','recibido') AND coalesce(p.updated_at,p.created_at) < now()-interval '24 hours')
       OR (p.created_at < now()-interval '24 hours')
    RETURNING id
  ) SELECT count(*) INTO v_pedidos_deleted FROM d;

  WITH d AS (DELETE FROM public.avisos WHERE created_at < now()-interval '24 hours' RETURNING id)
  SELECT count(*) INTO v_avisos_deleted FROM d;
  WITH d AS (DELETE FROM public.comentarios_avisos WHERE created_at < now()-interval '24 hours' RETURNING id)
  SELECT count(*) INTO v_comentarios_deleted FROM d;
  WITH d AS (DELETE FROM public.mensajes_foro WHERE created_at < now()-interval '24 hours' RETURNING id)
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

REVOKE ALL ON FUNCTION public.trg_estado_pago_ocr_automatico() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_estado_pago_ocr_automatico() TO service_role;

NOTIFY pgrst, 'reload schema';
