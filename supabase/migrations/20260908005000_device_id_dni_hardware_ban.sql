-- 20260908005000_device_id_dni_hardware_ban.sql
-- Sistema de Registro con DNI, Placa, Device ID y Bloqueo de Hardware por Comisiones

-- 1. Añadir columnas a usuarios_baneados si no existen
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS device_fingerprint text;

CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_device_id ON public.usuarios_baneados (device_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_fingerprint ON public.usuarios_baneados (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_dni ON public.usuarios_baneados (dni);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_placa ON public.usuarios_baneados (placa);

-- 2. Añadir columnas a choferes_habilitados
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS device_fingerprint text;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS bloqueado boolean DEFAULT false;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS motivo_bloqueo text;

CREATE INDEX IF NOT EXISTS idx_choferes_device_id ON public.choferes_habilitados (device_id);
CREATE INDEX IF NOT EXISTS idx_choferes_fingerprint ON public.choferes_habilitados (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_choferes_dni ON public.choferes_habilitados (dni);

-- 3. RPC para verificar si un dispositivo, DNI o placa se encuentra bloqueado
CREATE OR REPLACE FUNCTION public.rpc_verificar_bloqueo_dispositivo(
    p_device_id text DEFAULT NULL,
    p_device_fingerprint text DEFAULT NULL,
    p_dni text DEFAULT NULL,
    p_placa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \$\$
DECLARE
    v_banned_row record;
    v_driver_row record;
    v_clean_dni text;
    v_clean_placa text;
    v_clean_device text;
    v_clean_fingerprint text;
BEGIN
    v_clean_device := NULLIF(trim(p_device_id), '');
    v_clean_fingerprint := NULLIF(trim(p_device_fingerprint), '');
    v_clean_dni := NULLIF(regexp_replace(trim(p_dni), '[^0-9]', '', 'g'), '');
    v_clean_placa := NULLIF(upper(regexp_replace(trim(p_placa), '[^a-zA-Z0-9]', '', 'g')), '');

    -- 1. Verificar en usuarios_baneados
    SELECT motivo, dni, placa, device_id, device_fingerprint INTO v_banned_row
    FROM public.usuarios_baneados
    WHERE (v_clean_device IS NOT NULL AND device_id = v_clean_device)
       OR (v_clean_fingerprint IS NOT NULL AND device_fingerprint = v_clean_fingerprint)
       OR (v_clean_dni IS NOT NULL AND regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = v_clean_dni)
       OR (v_clean_placa IS NOT NULL AND upper(regexp_replace(COALESCE(placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean_placa)
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'bloqueado', true,
            'motivo', COALESCE(v_banned_row.motivo, 'Dispositivo o documento suspendido por falta de pago de comisiones o sanción administrativa.')
        );
    END IF;

    -- 2. Verificar en choferes_habilitados con bandera bloqueado
    SELECT motivo_bloqueo INTO v_driver_row
    FROM public.choferes_habilitados
    WHERE bloqueado = true
      AND (
          (v_clean_device IS NOT NULL AND device_id = v_clean_device)
       OR (v_clean_fingerprint IS NOT NULL AND device_fingerprint = v_clean_fingerprint)
       OR (v_clean_dni IS NOT NULL AND regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = v_clean_dni)
       OR (v_clean_placa IS NOT NULL AND upper(regexp_replace(COALESCE(placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean_placa)
      )
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'bloqueado', true,
            'motivo', COALESCE(v_driver_row.motivo_bloqueo, 'Dispositivo suspendido por comisiones pendientes de S/ 1 por balón de gas.')
        );
    END IF;

    RETURN jsonb_build_object(
        'bloqueado', false,
        'motivo', null
    );
END;
\$\$;

-- 4. RPC para que el Administrador banee a un repartidor de forma completa
CREATE OR REPLACE FUNCTION public.rpc_banear_repartidor_completo(
    p_user_id text,
    p_motivo text DEFAULT 'Falta de pago de comisión (S/ 1 por balón)'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \$\$
DECLARE
    v_driver record;
    v_motivo text;
BEGIN
    v_motivo := COALESCE(NULLIF(trim(p_motivo), ''), 'Falta de pago de comisión (S/ 1 por balón)');

    -- Obtener datos del chofer
    SELECT * INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = p_user_id
    LIMIT 1;

    -- Insertar en usuarios_baneados con todos los identificadores de hardware y documento
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
        p_user_id,
        v_driver.nombre_completo,
        v_driver.telefono_whatsapp,
        v_driver.placa,
        v_driver.dni,
        v_driver.device_id,
        v_driver.device_fingerprint,
        v_motivo
    );

    -- Marcar en choferes_habilitados
    UPDATE public.choferes_habilitados
    SET bloqueado = true,
        estado_verificacion = 'bloqueado',
        motivo_bloqueo = v_motivo
    WHERE user_id = p_user_id;

    -- Expulsar ruta activa si estuviera en marcha
    DELETE FROM public.rutas_repartidores
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'ok', true,
        'mensaje', 'Repartidor, DNI, Placa y Dispositivo móvil bloqueados exitosamente.'
    );
END;
\$\$;

-- 5. Trigger de rechazo automático en choferes_habilitados
CREATE OR REPLACE FUNCTION public.check_driver_not_blocked_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \$\$
DECLARE
    v_is_blocked jsonb;
BEGIN
    v_is_blocked := public.rpc_verificar_bloqueo_dispositivo(
        NEW.device_id,
        NEW.device_fingerprint,
        NEW.dni,
        NEW.placa
    );

    IF (v_is_blocked ->> 'bloqueado')::boolean = true THEN
        RAISE EXCEPTION 'DISPOSITIVO_BLOQUEADO: %', (v_is_blocked ->> 'motivo');
    END IF;

    RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS trg_guard_driver_blocklist ON public.choferes_habilitados;
CREATE TRIGGER trg_guard_driver_blocklist
BEFORE INSERT OR UPDATE OF dni, placa, device_id, device_fingerprint ON public.choferes_habilitados
FOR EACH ROW
WHEN (NEW.bloqueado IS NOT TRUE)
EXECUTE FUNCTION public.check_driver_not_blocked_trigger();

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_banear_repartidor_completo(text, text) TO authenticated, service_role;
