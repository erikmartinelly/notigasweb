-- Migration 059: Buyer order lifecycle with 'recibido' state and secure RPCs
BEGIN;

-- 1. Actualizar Check Constraint de estado en tabla pedidos para incluir 'recibido'
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check 
    CHECK (estado IN ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado', 'recibido'));

-- 2. RPC segura para que el comprador confirme recepción de su propio pedido
CREATE OR REPLACE FUNCTION public.rpc_confirm_order_received(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_uuid uuid := auth.uid();
    v_user_id text;
    v_updated_rows integer;
    v_result jsonb;
BEGIN
    IF v_user_uuid IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para confirmar la recepción.';
    END IF;

    v_user_id := v_user_uuid::text;

    IF public.is_banned() THEN
        RAISE EXCEPTION 'Tu cuenta se encuentra bloqueada.';
    END IF;

    UPDATE public.pedidos
    SET estado = 'recibido',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
      AND (user_id = v_user_id OR public.is_admin_email())
      AND estado IN ('pendiente', 'visto', 'asignado');

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
        RAISE EXCEPTION 'El pedido no existe, no pertenece a tu cuenta o ya se encuentra finalizado.';
    END IF;

    SELECT jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'recibido',
        'updated_at', now()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 3. RPC segura para que el comprador cancele su propio pedido
CREATE OR REPLACE FUNCTION public.rpc_cancel_own_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_uuid uuid := auth.uid();
    v_user_id text;
    v_updated_rows integer;
    v_result jsonb;
BEGIN
    IF v_user_uuid IS NULL THEN
        RAISE EXCEPTION 'Debes iniciar sesión para cancelar el pedido.';
    END IF;

    v_user_id := v_user_uuid::text;

    IF public.is_banned() THEN
        RAISE EXCEPTION 'Tu cuenta se encuentra bloqueada.';
    END IF;

    UPDATE public.pedidos
    SET estado = 'cancelado',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id
      AND (user_id = v_user_id OR public.is_admin_email())
      AND estado IN ('pendiente', 'visto', 'asignado');

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
        RAISE EXCEPTION 'El pedido no existe, no pertenece a tu cuenta o ya no puede cancelarse.';
    END IF;

    SELECT jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'cancelado',
        'updated_at', now()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 4. Actualizar funciones de purga automática
CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.pedidos
    WHERE (estado IN ('entregado', 'cancelado', 'recibido') AND updated_at < now() - interval '48 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');

    DELETE FROM public.rutas_repartidores
    WHERE last_active < now() - interval '12 hours';

    DELETE FROM public.avisos
    WHERE created_at < now() - interval '48 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedidos_borrados integer := 0;
    v_rutas_borradas integer := 0;
    v_avisos_borrados integer := 0;
BEGIN
    IF NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ejecutar la purga';
    END IF;

    DELETE FROM public.pedidos
    WHERE (estado IN ('entregado', 'cancelado', 'recibido') AND updated_at < now() - interval '48 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');
    GET DIAGNOSTICS v_pedidos_borrados = ROW_COUNT;

    DELETE FROM public.rutas_repartidores
    WHERE last_active < now() - interval '12 hours';
    GET DIAGNOSTICS v_rutas_borradas = ROW_COUNT;

    DELETE FROM public.avisos
    WHERE created_at < now() - interval '48 hours';
    GET DIAGNOSTICS v_avisos_borrados = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'pedidos_purgados', v_pedidos_borrados,
        'rutas_purgadas', v_rutas_borradas,
        'avisos_purgados', v_avisos_borrados,
        'duracion_retencion_horas', 48,
        'ejecutado_el', now()
    );
END;
$$;

-- 5. Permisos
REVOKE ALL ON FUNCTION public.rpc_confirm_order_received(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_order_received(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_cancel_own_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_own_order(uuid) TO authenticated;

-- 6. Registrar migración
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('059', 'buyer_order_lifecycle_recibido')
ON CONFLICT (version) DO NOTHING;

COMMIT;
