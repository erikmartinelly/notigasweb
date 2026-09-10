-- Fix P0: avoid ambiguous resolution between 4-arg and 5-arg overloads.
DROP FUNCTION IF EXISTS public.rpc_verificar_bloqueo_dispositivo(text,text,text,text,text);
DROP FUNCTION IF EXISTS public.rpc_verificar_bloqueo_dispositivo(text,text,text,text);

CREATE FUNCTION public.rpc_verificar_bloqueo_dispositivo(
  p_device_id text,
  p_device_fingerprint text,
  p_dni text,
  p_placa text,
  p_telefono text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
    v_banned_row record;
    v_driver_row record;
    v_clean_dni text;
    v_clean_placa text;
    v_clean_device text;
    v_clean_fingerprint text;
    v_clean_telefono text;
BEGIN
    v_clean_device := NULLIF(trim(p_device_id), '');
    v_clean_fingerprint := NULLIF(trim(p_device_fingerprint), '');
    v_clean_dni := NULLIF(regexp_replace(trim(p_dni), '[^0-9]', '', 'g'), '');
    v_clean_placa := NULLIF(upper(regexp_replace(trim(p_placa), '[^a-zA-Z0-9]', '', 'g')), '');
    v_clean_telefono := NULLIF(regexp_replace(trim(p_telefono), '[^0-9]', '', 'g'), '');

    SELECT motivo, dni, placa, device_id, device_fingerprint, telefono
    INTO v_banned_row
    FROM public.usuarios_baneados
    WHERE (v_clean_device IS NOT NULL AND device_id = v_clean_device)
       OR (v_clean_fingerprint IS NOT NULL AND device_fingerprint = v_clean_fingerprint)
       OR (v_clean_dni IS NOT NULL AND regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = v_clean_dni)
       OR (v_clean_placa IS NOT NULL AND upper(regexp_replace(COALESCE(placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean_placa)
       OR (v_clean_telefono IS NOT NULL AND regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_clean_telefono)
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'bloqueado', true,
            'motivo', COALESCE(v_banned_row.motivo, 'Acceso suspendido por deuda o sanción.'),
            'telefono_bloqueado', (v_clean_telefono IS NOT NULL AND regexp_replace(COALESCE(v_banned_row.telefono, ''), '[^0-9]', '', 'g') = v_clean_telefono),
            'placa_bloqueada', (v_clean_placa IS NOT NULL AND upper(regexp_replace(COALESCE(v_banned_row.placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean_placa),
            'device_bloqueado', (v_clean_device IS NOT NULL AND v_banned_row.device_id = v_clean_device)
        );
    END IF;

    SELECT motivo_bloqueo, dni, placa, device_id, device_fingerprint, telefono_whatsapp
    INTO v_driver_row
    FROM public.choferes_habilitados
    WHERE bloqueado = true
      AND (
          (v_clean_device IS NOT NULL AND device_id = v_clean_device)
       OR (v_clean_fingerprint IS NOT NULL AND device_fingerprint = v_clean_fingerprint)
       OR (v_clean_dni IS NOT NULL AND regexp_replace(COALESCE(dni, ''), '[^0-9]', '', 'g') = v_clean_dni)
       OR (v_clean_placa IS NOT NULL AND upper(regexp_replace(COALESCE(placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean_placa)
       OR (v_clean_telefono IS NOT NULL AND regexp_replace(COALESCE(telefono_whatsapp, ''), '[^0-9]', '', 'g') = v_clean_telefono)
      )
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'bloqueado', true,
            'motivo', COALESCE(v_driver_row.motivo_bloqueo, 'Repartidor suspendido.'),
            'telefono_bloqueado', (v_clean_telefono IS NOT NULL AND regexp_replace(COALESCE(v_driver_row.telefono_whatsapp, ''), '[^0-9]', '', 'g') = v_clean_telefono),
            'placa_bloqueada', (v_clean_placa IS NOT NULL AND upper(regexp_replace(COALESCE(v_driver_row.placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean_placa),
            'device_bloqueado', (v_clean_device IS NOT NULL AND v_driver_row.device_id = v_clean_device)
        );
    END IF;

    RETURN jsonb_build_object('bloqueado', false, 'motivo', null);
END;
$$;

CREATE FUNCTION public.rpc_verificar_bloqueo_dispositivo(
  p_device_id text,
  p_device_fingerprint text,
  p_dni text,
  p_placa text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=public,pg_temp
AS $$
  SELECT public.rpc_verificar_bloqueo_dispositivo(p_device_id,p_device_fingerprint,p_dni,p_placa,NULL::text);
$$;

CREATE OR REPLACE FUNCTION public.check_driver_not_blocked_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_is_blocked jsonb;
BEGIN
  v_is_blocked := public.rpc_verificar_bloqueo_dispositivo(
    NEW.device_id,
    NEW.device_fingerprint,
    NEW.dni,
    NEW.placa,
    NEW.telefono_whatsapp
  );
  IF COALESCE((v_is_blocked->>'bloqueado')::boolean,false) THEN
    RAISE EXCEPTION 'DISPOSITIVO_BLOQUEADO: %', COALESCE(v_is_blocked->>'motivo','Acceso suspendido');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text,text,text,text,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text,text,text,text) TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';