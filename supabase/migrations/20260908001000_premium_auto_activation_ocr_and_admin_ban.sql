-- Migration: 20260908001000_premium_auto_activation_ocr_and_admin_ban.sql
-- Description: Instant VIP activation on voucher upload, OCR data columns, and admin ban for false vouchers.

-- 1. Add OCR metadata columns to choferes_habilitados
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'choferes_habilitados' 
          AND column_name = 'ocr_monto'
    ) THEN
        ALTER TABLE public.choferes_habilitados 
        ADD COLUMN ocr_monto numeric(6,2) DEFAULT NULL,
        ADD COLUMN ocr_app text DEFAULT NULL,
        ADD COLUMN ocr_operacion text DEFAULT NULL,
        ADD COLUMN ocr_valido boolean DEFAULT false,
        ADD COLUMN ocr_raw_text text DEFAULT NULL;
    END IF;
END $$;

-- 2. Update rpc_driver_submit_premium_payment to activate subscription IMMEDIATELY with OCR data
CREATE OR REPLACE FUNCTION public.rpc_driver_submit_premium_payment(
    p_comprobante_url text,
    p_ocr_monto numeric DEFAULT NULL,
    p_ocr_app text DEFAULT NULL,
    p_ocr_operacion text DEFAULT NULL,
    p_ocr_valido boolean DEFAULT false,
    p_ocr_raw_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id text := (SELECT auth.uid()::text);
    v_driver_id uuid;
    v_estado text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    SELECT id INTO v_driver_id
    FROM public.choferes_habilitados
    WHERE user_id = v_user_id;

    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No se encontro ficha de repartidor para este usuario';
    END IF;

    -- Si el OCR valido el monto o es un voucher subido, activamos inmediatamente la suscripcion
    v_estado := CASE 
        WHEN p_ocr_valido THEN 'activo_ocr'
        ELSE 'activo_revision'
    END;

    UPDATE public.choferes_habilitados
    SET 
        comprobante_pago_url = p_comprobante_url,
        comprobante_fecha = now(),
        es_premium = true,
        premium_vence_at = NOW() + INTERVAL '30 days',
        estado_pago_premium = v_estado,
        ocr_monto = p_ocr_monto,
        ocr_app = p_ocr_app,
        ocr_operacion = p_ocr_operacion,
        ocr_valido = p_ocr_valido,
        ocr_raw_text = p_ocr_raw_text
    WHERE id = v_driver_id;

    -- Sincronizar en rutas activas si el camion ya esta transmitiendo
    UPDATE public.rutas_repartidores
    SET es_premium = true
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', '¡Suscripción VIP Premium activada con éxito por 30 días!',
        'driver_id', v_driver_id,
        'es_premium', true,
        'estado', v_estado,
        'ocr_valido', p_ocr_valido,
        'premium_vence_at', (NOW() + INTERVAL '30 days')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_driver_submit_premium_payment(text, numeric, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_submit_premium_payment(text, numeric, text, text, boolean, text) TO authenticated;

-- 3. Update rpc_admin_verify_premium_payment to support banning and revoking
CREATE OR REPLACE FUNCTION public.rpc_admin_verify_premium_payment(p_driver_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_admin boolean;
    v_user_id text;
    v_nombre text;
    v_placa text;
    v_tel text;
BEGIN
    v_is_admin := is_admin_email();
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Solo administradores autorizados pueden validar pagos premium';
    END IF;

    SELECT user_id, nombre_completo, placa, telefono_whatsapp
    INTO v_user_id, v_nombre, v_placa, v_tel
    FROM public.choferes_habilitados
    WHERE id = p_driver_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No se encontro el chofer especificado';
    END IF;

    IF p_action = 'aprobar' OR p_action = 'confirmar' THEN
        UPDATE public.choferes_habilitados
        SET 
            es_premium = true,
            premium_vence_at = COALESCE(premium_vence_at, NOW() + INTERVAL '30 days'),
            estado_pago_premium = 'confirmado_admin'
        WHERE id = p_driver_id;

        UPDATE public.rutas_repartidores
        SET es_premium = true
        WHERE user_id = v_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Pago confirmado y suscripcion VIP verificada',
            'estado', 'confirmado_admin'
        );

    ELSIF p_action = 'rechazar' OR p_action = 'revocar' THEN
        UPDATE public.choferes_habilitados
        SET 
            es_premium = false,
            estado_pago_premium = 'rechazado'
        WHERE id = p_driver_id;

        UPDATE public.rutas_repartidores
        SET es_premium = false
        WHERE user_id = v_user_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Suscripcion VIP revocada',
            'estado', 'rechazado'
        );

    ELSIF p_action = 'banear' THEN
        -- 1. Revocar Premium
        UPDATE public.choferes_habilitados
        SET 
            es_premium = false,
            estado_pago_premium = 'baneado_voucher_invalido'
        WHERE id = p_driver_id;

        -- 2. Eliminar ruta activa de camion
        DELETE FROM public.rutas_repartidores
        WHERE user_id = v_user_id;

        -- 3. Insertar en usuarios_baneados
        INSERT INTO public.usuarios_baneados (user_id, nombre, placa, telefono, motivo, created_at)
        VALUES (
            v_user_id,
            COALESCE(v_nombre, 'Repartidor'),
            COALESCE(v_placa, ''),
            COALESCE(v_tel, ''),
            'Baneado por Administrador: Voucher falso o pago no efectivizado',
            now()
        )
        ON CONFLICT DO NOTHING;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Repartidor baneado exitosamente por voucher falso o pago no efectivizado',
            'estado', 'baneado'
        );

    ELSE
        RAISE EXCEPTION 'Accion no valida. Use "confirmar", "rechazar" o "banear"';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_verify_premium_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_verify_premium_payment(uuid, text) TO authenticated;
