-- 20260908010000_financial_commission_rules.sql
-- CONFIGURACIÓN DEFINITIVA DEL BACKEND: PARÁMETROS FINANCIEROS DE LANZAMIENTO - NOTIGAS.COM
-- 1. Comisión fija por entrega: S/ 1.00 PEN
-- 2. Límite de crédito máximo (Tope): S/ 50.00 PEN
-- 3. Acción ante el Tope: Bloqueo inmediato de pedidos (Estado: Suspendido)
-- 4. Alerta de cobro programada: Domingos 11:59 PM (Cálculo de saldo deudor semanal)
-- 5. Ejecución de Baneo Semanal: Lunes 1:00 PM (Si saldo deudor > S/ 0.00)
-- 6. Identificadores bloqueados en baneo: DNI + Placa + Device_ID + Hardware Fingerprint

-- 1. Campos Financieros en choferes_habilitados
ALTER TABLE public.choferes_habilitados 
    ADD COLUMN IF NOT EXISTS comisiones_pendientes numeric(10,2) DEFAULT 0.00 NOT NULL,
    ADD COLUMN IF NOT EXISTS limite_credito numeric(10,2) DEFAULT 50.00 NOT NULL,
    ADD COLUMN IF NOT EXISTS estado_servicio text DEFAULT 'activo' NOT NULL,
    ADD COLUMN IF NOT EXISTS ultimo_corte_semanal timestamp with time zone,
    ADD COLUMN IF NOT EXISTS total_comisiones_pagadas numeric(10,2) DEFAULT 0.00 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_choferes_comisiones ON public.choferes_habilitados (comisiones_pendientes);
CREATE INDEX IF NOT EXISTS idx_choferes_estado_servicio ON public.choferes_habilitados (estado_servicio);

-- 2. Campos de Comisión en pedidos
ALTER TABLE public.pedidos 
    ADD COLUMN IF NOT EXISTS comision_entrega numeric(10,2) DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS comision_registrada boolean DEFAULT false;

-- 3. Tabla de Auditoría / Movimientos de Comisiones
CREATE TABLE IF NOT EXISTS public.registro_comisiones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    driver_id uuid REFERENCES public.choferes_habilitados(id) ON DELETE CASCADE,
    tipo text NOT NULL, -- 'entrega', 'pago_yape', 'corte_semanal', 'baneo_lunes'
    monto numeric(10,2) NOT NULL DEFAULT 0.00,
    saldo_anterior numeric(10,2) NOT NULL DEFAULT 0.00,
    saldo_nuevo numeric(10,2) NOT NULL DEFAULT 0.00,
    referencia text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_comisiones_user_id ON public.registro_comisiones (user_id);
CREATE INDEX IF NOT EXISTS idx_reg_comisiones_created_at ON public.registro_comisiones (created_at DESC);

ALTER TABLE public.registro_comisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can read their own commission records" ON public.registro_comisiones;
CREATE POLICY "Drivers can read their own commission records"
ON public.registro_comisiones
FOR SELECT
TO authenticated
USING (user_id = auth.uid()::text OR public.is_admin_email());

-- 4. Actualizar rpc_driver_confirm_delivery para sumar S/ 1.00 y evaluar tope de S/ 50.00
CREATE OR REPLACE FUNCTION public.rpc_driver_confirm_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_order record;
    v_driver record;
    v_prev_saldo numeric(10,2);
    v_new_saldo numeric(10,2);
    v_limite numeric(10,2);
    v_new_estado text;
    v_is_suspended boolean := false;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está suspendido';
    END IF;

    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    IF v_order.driver_id <> v_driver_id AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: este pedido no está asignado a tu cuenta';
    END IF;

    IF v_order.estado <> 'asignado' AND NOT is_admin_email() THEN
        RAISE EXCEPTION 'El pedido no se encuentra en estado asignado';
    END IF;

    -- Obtener registro del chofer
    SELECT * INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ficha de chofer no encontrada';
    END IF;

    -- Actualizar pedido
    UPDATE public.pedidos
    SET
        estado = 'entregado',
        comision_entrega = 1.00,
        comision_registrada = true,
        updated_at = now()
    WHERE id = p_order_id;

    -- Calcular comisiones
    v_prev_saldo := COALESCE(v_driver.comisiones_pendientes, 0.00);
    v_limite := COALESCE(v_driver.limite_credito, 50.00);
    v_new_saldo := v_prev_saldo + 1.00;

    IF v_new_saldo >= v_limite THEN
        v_new_estado := 'suspendido_tope';
        v_is_suspended := true;
    ELSE
        v_new_estado := COALESCE(v_driver.estado_servicio, 'activo');
    END IF;

    -- Actualizar ficha del chofer
    UPDATE public.choferes_habilitados
    SET
        comisiones_pendientes = v_new_saldo,
        estado_servicio = v_new_estado
    WHERE id = v_driver.id;

    -- Registrar movimiento en auditoría de comisiones
    INSERT INTO public.registro_comisiones (
        user_id,
        driver_id,
        tipo,
        monto,
        saldo_anterior,
        saldo_nuevo,
        referencia
    ) VALUES (
        v_driver_id,
        v_driver.id,
        'entrega',
        1.00,
        v_prev_saldo,
        v_new_saldo,
        'Entrega de balón (Pedido ID: ' || p_order_id::text || ')'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'entregado',
        'confirmed_by', 'driver',
        'comision_fija', 1.00,
        'comisiones_pendientes', v_new_saldo,
        'limite_credito', v_limite,
        'estado_servicio', v_new_estado,
        'suspendido', v_is_suspended
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_driver_confirm_delivery(uuid) TO authenticated, service_role;

-- 5. Actualizar rpc_assign_order para bloquear toma de pedidos si supera tope de crédito
CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_driver_id text;
    v_driver record;
    v_order record;
    v_order_cat text;
    v_driver_cat text;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está baneado o no autorizado';
    END IF;

    SELECT * INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no es un repartidor habilitado';
    END IF;

    -- REGLA FINANCIERA ESTRICTA: Bloqueo inmediato ante tope de crédito (S/ 50.00) o suspensión
    IF v_driver.bloqueado = true THEN
        RAISE EXCEPTION 'Tu cuenta se encuentra bloqueada por falta de pago de comisiones o sanción administrativa.';
    END IF;

    IF v_driver.estado_servicio = 'suspendido_tope' OR COALESCE(v_driver.comisiones_pendientes, 0.00) >= COALESCE(v_driver.limite_credito, 50.00) THEN
        RAISE EXCEPTION 'Límite de crédito alcanzado (S/ 50.00). Regulariza tus comisiones pendientes de S/ 1 por balón vía Yape para seguir recibiendo pedidos.';
    END IF;

    IF v_driver.estado_servicio = 'baneado' THEN
        RAISE EXCEPTION 'Servicio suspendido por mora semanal de comisiones. Comunícate con Administración.';
    END IF;

    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    -- Validar ciudad del chofer
    IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    v_order_cat := LOWER(TRIM(COALESCE(v_order.categoria, '')));
    v_driver_cat := LOWER(TRIM(COALESCE(v_driver.categoria, '')));

    IF v_order_cat ILIKE '%gas%' OR v_order_cat ILIKE '%glp%' OR v_order_cat ILIKE '%garrafa%' OR v_order_cat ILIKE '%balon%' THEN
        v_order_cat := 'gas';
    ELSIF v_order_cat ILIKE '%agua%' OR v_order_cat ILIKE '%botell%' THEN
        v_order_cat := 'agua';
    END IF;

    IF v_driver_cat ILIKE '%gas%' OR v_driver_cat ILIKE '%glp%' OR v_driver_cat ILIKE '%garrafa%' OR v_driver_cat ILIKE '%balon%' THEN
        v_driver_cat := 'gas';
    ELSIF v_driver_cat ILIKE '%agua%' OR v_driver_cat ILIKE '%botell%' THEN
        v_driver_cat := 'agua';
    END IF;

    IF v_order_cat <> v_driver_cat THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    IF v_order.estado = 'asignado' THEN
        IF v_order.driver_id = v_driver_id THEN
            RETURN jsonb_build_object('ok', true, 'message', 'Pedido ya asignado a ti');
        ELSE
            RAISE EXCEPTION 'Este pedido ya fue tomado por otro repartidor';
        END IF;
    END IF;

    IF v_order.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible para asignación';
    END IF;

    UPDATE public.pedidos
    SET estado = 'asignado',
        driver_id = v_driver_id,
        visto = true,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'asignado',
        'driver_id', v_driver_id
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated, service_role;

-- 6. RPC para Liquidar / Pagar Comisiones (Abono por Yape / Plin / Admin)
CREATE OR REPLACE FUNCTION public.rpc_liquidar_comisiones_chofer(
    p_driver_id text,
    p_monto numeric DEFAULT NULL,
    p_referencia text DEFAULT 'Pago Yape'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver record;
    v_prev_saldo numeric(10,2);
    v_abono numeric(10,2);
    v_new_saldo numeric(10,2);
    v_limite numeric(10,2);
    v_new_estado text;
BEGIN
    SELECT * INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = p_driver_id OR id::text = p_driver_id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Repartidor no encontrado: %', p_driver_id;
    END IF;

    v_prev_saldo := COALESCE(v_driver.comisiones_pendientes, 0.00);
    v_limite := COALESCE(v_driver.limite_credito, 50.00);

    IF p_monto IS NULL OR p_monto <= 0 THEN
        v_abono := v_prev_saldo;
        v_new_saldo := 0.00;
    ELSE
        v_abono := p_monto;
        v_new_saldo := GREATEST(0.00, v_prev_saldo - v_abono);
    END IF;

    IF v_new_saldo < v_limite THEN
        v_new_estado := 'activo';
    ELSE
        v_new_estado := 'suspendido_tope';
    END IF;

    -- Actualizar chofer
    UPDATE public.choferes_habilitados
    SET
        comisiones_pendientes = v_new_saldo,
        total_comisiones_pagadas = COALESCE(total_comisiones_pagadas, 0.00) + v_abono,
        estado_servicio = v_new_estado,
        bloqueado = CASE 
            -- Si estaba bloqueado solo por comisiones, desbloquearlo
            WHEN bloqueado = true AND (motivo_bloqueo ILIKE '%comision%' OR motivo_bloqueo ILIKE '%pago%' OR motivo_bloqueo ILIKE '%semanal%') THEN false 
            ELSE bloqueado 
        END,
        motivo_bloqueo = CASE 
            WHEN bloqueado = true AND (motivo_bloqueo ILIKE '%comision%' OR motivo_bloqueo ILIKE '%pago%' OR motivo_bloqueo ILIKE '%semanal%') THEN NULL 
            ELSE motivo_bloqueo 
        END,
        estado_verificacion = CASE 
            WHEN estado_verificacion = 'bloqueado' AND (motivo_bloqueo ILIKE '%comision%' OR motivo_bloqueo ILIKE '%pago%' OR motivo_bloqueo ILIKE '%semanal%') THEN 'aprobado' 
            ELSE estado_verificacion 
        END
    WHERE id = v_driver.id;

    -- Si estaba en usuarios_baneados por mora de comisiones, remover sanción
    DELETE FROM public.usuarios_baneados
    WHERE user_id = v_driver.user_id
      AND (motivo ILIKE '%comision%' OR motivo ILIKE '%pago%' OR motivo ILIKE '%semanal%');

    -- Registrar auditoría
    INSERT INTO public.registro_comisiones (
        user_id,
        driver_id,
        tipo,
        monto,
        saldo_anterior,
        saldo_nuevo,
        referencia
    ) VALUES (
        v_driver.user_id,
        v_driver.id,
        'pago_yape',
        v_abono,
        v_prev_saldo,
        v_new_saldo,
        COALESCE(p_referencia, 'Pago recibido vía Yape/Plin')
    );

    RETURN jsonb_build_object(
        'ok', true,
        'driver_id', v_driver.user_id,
        'abono', v_abono,
        'saldo_anterior', v_prev_saldo,
        'saldo_nuevo', v_new_saldo,
        'estado_servicio', v_new_estado,
        'desbloqueado', (v_new_estado = 'activo')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_liquidar_comisiones_chofer(text, numeric, text) TO authenticated, service_role;

-- 7. RPC de Corte Semanal (Domingos 11:59 PM)
CREATE OR REPLACE FUNCTION public.rpc_ejecutar_corte_semanal_comisiones()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_morosos integer := 0;
    v_total_deuda numeric(10,2) := 0.00;
    v_driver record;
BEGIN
    FOR v_driver IN
        SELECT id, user_id, nombre_completo, comisiones_pendientes
        FROM public.choferes_habilitados
        WHERE comisiones_pendientes > 0.00
    LOOP
        v_total_morosos := v_total_morosos + 1;
        v_total_deuda := v_total_deuda + v_driver.comisiones_pendientes;

        -- Actualizar fecha de corte
        UPDATE public.choferes_habilitados
        SET ultimo_corte_semanal = now()
        WHERE id = v_driver.id;

        -- Registrar corte en movimientos
        INSERT INTO public.registro_comisiones (
            user_id,
            driver_id,
            tipo,
            monto,
            saldo_anterior,
            saldo_nuevo,
            referencia
        ) VALUES (
            v_driver.user_id,
            v_driver.id,
            'corte_semanal',
            0.00,
            v_driver.comisiones_pendientes,
            v_driver.comisiones_pendientes,
            'Corte Semanal Domingos 11:59 PM - Plazo de pago vence Lunes 1:00 PM'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'fecha_corte', now(),
        'choferes_con_deuda', v_total_morosos,
        'deuda_total_acumulada', v_total_deuda,
        'mensaje', 'Corte dominical 11:59 PM ejecutado con éxito. Plazo límite para pago: Lunes 1:00 PM.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ejecutar_corte_semanal_comisiones() TO authenticated, service_role;

-- 8. RPC de Baneo Semanal de Morosos (Lunes 1:00 PM)
-- Bloquea: DNI + Placa + Android_ID / Device_ID + Hardware Fingerprint
CREATE OR REPLACE FUNCTION public.rpc_ejecutar_baneo_semanal_morosos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_baneados integer := 0;
    v_driver record;
    v_motivo text;
    v_banned_list jsonb := '[]'::jsonb;
BEGIN
    FOR v_driver IN
        SELECT *
        FROM public.choferes_habilitados
        WHERE comisiones_pendientes > 0.00
          AND bloqueado = false
    LOOP
        v_motivo := 'Baneo semanal por comisiones impagas (Lunes 1:00 PM) - Deuda: S/ ' || v_driver.comisiones_pendientes::text;

        -- 1. Insertar en usuarios_baneados con DNI, Placa, Device ID y Fingerprint
        INSERT INTO public.usuarios_baneados (
            user_id,
            nombre,
            telefono,
            placa,
            dni,
            device_id,
            device_fingerprint,
            motivo
        ) VALUES (
            v_driver.user_id,
            v_driver.nombre_completo,
            v_driver.telefono_whatsapp,
            v_driver.placa,
            v_driver.dni,
            v_driver.device_id,
            v_driver.device_fingerprint,
            v_motivo
        );

        -- 2. Marcar en choferes_habilitados
        UPDATE public.choferes_habilitados
        SET
            bloqueado = true,
            estado_servicio = 'baneado',
            estado_verificacion = 'bloqueado',
            motivo_bloqueo = v_motivo
        WHERE id = v_driver.id;

        -- 3. Expulsar de rutas activas
        DELETE FROM public.rutas_repartidores
        WHERE user_id = v_driver.user_id;

        -- 4. Registrar auditoría
        INSERT INTO public.registro_comisiones (
            user_id,
            driver_id,
            tipo,
            monto,
            saldo_anterior,
            saldo_nuevo,
            referencia
        ) VALUES (
            v_driver.user_id,
            v_driver.id,
            'baneo_lunes',
            0.00,
            v_driver.comisiones_pendientes,
            v_driver.comisiones_pendientes,
            v_motivo
        );

        v_total_baneados := v_total_baneados + 1;
        v_banned_list := v_banned_list || jsonb_build_object(
            'user_id', v_driver.user_id,
            'nombre', v_driver.nombre_completo,
            'dni', v_driver.dni,
            'placa', v_driver.placa,
            'deuda', v_driver.comisiones_pendientes
        );
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true,
        'fecha_ejecucion', now(),
        'choferes_baneados', v_total_baneados,
        'detalle', v_banned_list,
        'mensaje', 'Ejecución de baneo semanal completada. Dispositivos móviles, DNI y Placas bloqueados.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ejecutar_baneo_semanal_morosos() TO authenticated, service_role;

-- 9. Programación con pg_cron si está disponible
-- Domingos 11:59 PM Lima (UTC-5) -> Lunes 04:59 UTC -> Cron: 59 4 * * 1
-- Lunes 1:00 PM Lima (UTC-5) -> Lunes 18:00 UTC -> Cron: 0 18 * * 1
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) 
        FROM cron.job 
        WHERE jobname IN ('corte_semanal_domingos', 'baneo_semanal_lunes');

        PERFORM cron.schedule(
            'corte_semanal_domingos',
            '59 4 * * 1',
            'SELECT public.rpc_ejecutar_corte_semanal_comisiones();'
        );

        PERFORM cron.schedule(
            'baneo_semanal_lunes',
            '0 18 * * 1',
            'SELECT public.rpc_ejecutar_baneo_semanal_morosos();'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron no disponible o sin permisos para programar tareas automáticas: %', SQLERRM;
END;
$$;
