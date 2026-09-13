BEGIN;

-- ============================================================================
-- NOTIGAS - Cierre de superficie publica y helpers privilegiados
-- 2026-09-13 UTC
-- ============================================================================

-- 1) Los helpers de autorizacion dejan de ser SECURITY DEFINER expuestos.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin_email_internal()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_role text := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' THEN
    RETURN true;
  END IF;
  IF COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN false;
  END IF;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(trim(COALESCE(email, '')))
    INTO v_user_email
    FROM auth.users
   WHERE id = v_user_id;
  IF v_user_email = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.admin_credentials ac
     WHERE lower(trim(ac.email)) = v_user_email
  );
END;
$$;
REVOKE ALL ON FUNCTION private.is_admin_email_internal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin_email_internal() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.is_admin_email_internal();
$$;
REVOKE ALL ON FUNCTION public.is_admin_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin_email_for_internal(p_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := '';
BEGIN
  IF NOT private.is_admin_email_internal() THEN
    RETURN false;
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN true;
  END IF;
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(trim(COALESCE(email, '')))
    INTO v_user_email
    FROM auth.users
   WHERE id = v_user_id;
  RETURN v_user_email <> '' AND lower(trim(p_email)) = v_user_email;
END;
$$;
REVOKE ALL ON FUNCTION private.is_admin_email_for_internal(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin_email_for_internal(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin_email_for(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.is_admin_email_for_internal(p_email);
$$;
REVOKE ALL ON FUNCTION public.is_admin_email_for(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_email_for(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_banned_internal()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text := auth.uid()::text;
  v_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
BEGIN
  IF auth.uid() IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.usuarios_baneados ub
     WHERE ub.user_id = v_id
        OR (v_email <> '' AND (lower(trim(COALESCE(ub.user_id, ''))) = v_email
                           OR lower(trim(COALESCE(ub.email, ''))) = v_email))
  );
END;
$$;
REVOKE ALL ON FUNCTION private.is_banned_internal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_banned_internal() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.is_banned_internal();
$$;
REVOKE ALL ON FUNCTION public.is_banned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_current_enabled_driver_internal(p_ciudad text, p_categoria text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND EXISTS (
      SELECT 1
        FROM public.choferes_habilitados ch
       WHERE ch.user_id = auth.uid()::text
         AND lower(trim(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
         AND COALESCE(ch.bloqueado, false) = false
         AND COALESCE(ch.estado_servicio, 'activo') = 'activo'
         AND COALESCE(ch.pedidos_credito_ciclo, 0) < COALESCE(ch.limite_pedidos_credito, 100)
         AND COALESCE(ch.comisiones_pendientes, 0) < COALESCE(ch.limite_credito, 20)
         AND (p_ciudad IS NULL OR lower(trim(ch.ciudad)) = lower(trim(p_ciudad)))
         AND (
           p_categoria IS NOT NULL
           AND (
             lower(trim(ch.categoria)) = lower(trim(p_categoria))
             OR (
               lower(trim(ch.categoria)) IN ('gas','gas glp','garrafa','glp','balon','balon de gas','balón','balón de gas')
               AND lower(trim(p_categoria)) IN ('gas','gas glp','garrafa','glp','balon','balon de gas','balón','balón de gas')
             )
             OR (
               lower(trim(ch.categoria)) IN ('agua','agua potable','botellon','botellón')
               AND lower(trim(p_categoria)) IN ('agua','agua potable','botellon','botellón')
             )
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = ch.user_id
         )
    );
$$;
REVOKE ALL ON FUNCTION private.is_current_enabled_driver_internal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_current_enabled_driver_internal(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(p_ciudad text DEFAULT NULL, p_categoria text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.is_current_enabled_driver_internal(p_ciudad, p_categoria);
$$;
REVOKE ALL ON FUNCTION public.is_current_enabled_driver(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) TO authenticated, service_role;

-- 2) Funciones de trigger/rate-limit no son endpoints RPC de usuario.
REVOKE ALL ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.guard_optional_order_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_optional_order_insert() TO service_role;

-- 3) Chequeo pre-registro: la logica privilegiada queda en esquema no expuesto.
CREATE SCHEMA IF NOT EXISTS internal_pre_auth AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA internal_pre_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA internal_pre_auth TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal_pre_auth.check_device_block(
  p_device_id text,
  p_device_fingerprint text,
  p_dni text,
  p_placa text,
  p_telefono text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_device text := NULLIF(left(trim(COALESCE(p_device_id, '')), 160), '');
  v_fingerprint text := NULLIF(left(trim(COALESCE(p_device_fingerprint, '')), 160), '');
  v_dni text := NULLIF(left(regexp_replace(COALESCE(p_dni, ''), '[^0-9]', '', 'g'), 20), '');
  v_placa text := NULLIF(left(upper(regexp_replace(COALESCE(p_placa, ''), '[^a-zA-Z0-9]', '', 'g')), 20), '');
  v_telefono text := NULLIF(left(regexp_replace(COALESCE(p_telefono, ''), '[^0-9]', '', 'g'), 20), '');
  v_blocked boolean := false;
BEGIN
  IF v_device IS NULL AND v_fingerprint IS NULL AND v_dni IS NULL AND v_placa IS NULL AND v_telefono IS NULL THEN
    RETURN jsonb_build_object('bloqueado', false, 'motivo', NULL);
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.usuarios_baneados ub
     WHERE (v_device IS NOT NULL AND ub.device_id = v_device)
        OR (v_fingerprint IS NOT NULL AND ub.device_fingerprint = v_fingerprint)
        OR (v_dni IS NOT NULL AND regexp_replace(COALESCE(ub.dni, ''), '[^0-9]', '', 'g') = v_dni)
        OR (v_placa IS NOT NULL AND upper(regexp_replace(COALESCE(ub.placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_placa)
        OR (v_telefono IS NOT NULL AND regexp_replace(COALESCE(ub.telefono, ''), '[^0-9]', '', 'g') = v_telefono)
  ) OR EXISTS (
    SELECT 1
      FROM public.choferes_habilitados ch
     WHERE ch.bloqueado = true
       AND (
          (v_device IS NOT NULL AND ch.device_id = v_device)
       OR (v_fingerprint IS NOT NULL AND ch.device_fingerprint = v_fingerprint)
       OR (v_dni IS NOT NULL AND regexp_replace(COALESCE(ch.dni, ''), '[^0-9]', '', 'g') = v_dni)
       OR (v_placa IS NOT NULL AND upper(regexp_replace(COALESCE(ch.placa, ''), '[^a-zA-Z0-9]', '', 'g')) = v_placa)
       OR (v_telefono IS NOT NULL AND regexp_replace(COALESCE(ch.telefono_whatsapp, ''), '[^0-9]', '', 'g') = v_telefono)
       )
  ) INTO v_blocked;

  IF v_blocked THEN
    RETURN jsonb_build_object(
      'bloqueado', true,
      'motivo', 'Acceso suspendido. Regulariza cualquier obligación pendiente o contacta a soporte.'
    );
  END IF;

  RETURN jsonb_build_object('bloqueado', false, 'motivo', NULL);
END;
$$;
REVOKE ALL ON FUNCTION internal_pre_auth.check_device_block(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal_pre_auth.check_device_block(text, text, text, text, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_verificar_bloqueo_dispositivo(text, text, text, text);
CREATE OR REPLACE FUNCTION public.rpc_verificar_bloqueo_dispositivo(
  p_device_id text,
  p_device_fingerprint text,
  p_dni text,
  p_placa text,
  p_telefono text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT internal_pre_auth.check_device_block(p_device_id, p_device_fingerprint, p_dni, p_placa, p_telefono);
$$;
REVOKE ALL ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_verificar_bloqueo_dispositivo(text, text, text, text, text) TO anon, authenticated, service_role;

-- 4) Tablas legacy sin consumidores actuales: cerrar lectura/escritura publica.
DROP POLICY IF EXISTS "Insertar mensajes foro" ON public.mensajes_foro;
DROP POLICY IF EXISTS "Lectura publica mensajes_foro" ON public.mensajes_foro;
REVOKE ALL ON TABLE public.mensajes_foro FROM anon, authenticated;
GRANT SELECT ON TABLE public.mensajes_foro TO authenticated;
CREATE POLICY mensajes_foro_admin_select
ON public.mensajes_foro
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS "Public SELECT" ON public.publicaciones;
REVOKE ALL ON TABLE public.publicaciones FROM anon, authenticated;
GRANT SELECT ON TABLE public.publicaciones TO authenticated;
CREATE POLICY publicaciones_admin_select
ON public.publicaciones
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

-- 5) Escrituras del foro: solo sesiones reales, no cuentas anonimas de Supabase Auth.
DROP POLICY IF EXISTS avisos_insert ON public.avisos;
CREATE POLICY avisos_insert ON public.avisos
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = user_id
  AND NOT public.is_banned()
);

DROP POLICY IF EXISTS avisos_update ON public.avisos;
CREATE POLICY avisos_update ON public.avisos
FOR UPDATE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (auth.uid()::text = user_id OR public.is_admin_email())
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (auth.uid()::text = user_id OR public.is_admin_email())
);

DROP POLICY IF EXISTS avisos_delete ON public.avisos;
CREATE POLICY avisos_delete ON public.avisos
FOR DELETE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (auth.uid()::text = user_id OR public.is_admin_email())
);

DROP POLICY IF EXISTS comentarios_insert ON public.comentarios_avisos;
CREATE POLICY comentarios_insert ON public.comentarios_avisos
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND auth.uid() IS NOT NULL
  AND auth.uid()::text = user_id
  AND NOT public.is_banned()
);

DROP POLICY IF EXISTS comentarios_update ON public.comentarios_avisos;
CREATE POLICY comentarios_update ON public.comentarios_avisos
FOR UPDATE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (auth.uid()::text = user_id OR public.is_admin_email())
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (auth.uid()::text = user_id OR public.is_admin_email())
);

DROP POLICY IF EXISTS comentarios_delete ON public.comentarios_avisos;
CREATE POLICY comentarios_delete ON public.comentarios_avisos
FOR DELETE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND (auth.uid()::text = user_id OR public.is_admin_email())
);

-- 6) Endurecer policies TO authenticated que antes confiaban solo en helpers.
DROP POLICY IF EXISTS order_public_radar_registered_read ON public.order_public_radar;
CREATE POLICY order_public_radar_registered_read ON public.order_public_radar
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND private.can_view_order_radar(order_id)
);

DROP POLICY IF EXISTS "Pedidos Borrar admin" ON public.pedidos;
CREATE POLICY "Pedidos Borrar admin" ON public.pedidos
FOR DELETE TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS repartidores_admin_select ON public.repartidores;
CREATE POLICY repartidores_admin_select ON public.repartidores
FOR SELECT TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_admin_email()
);

DROP POLICY IF EXISTS denuncias_select ON public.denuncias;
CREATE POLICY denuncias_select ON public.denuncias
FOR SELECT TO authenticated
USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email());
DROP POLICY IF EXISTS denuncias_update ON public.denuncias;
CREATE POLICY denuncias_update ON public.denuncias
FOR UPDATE TO authenticated
USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email())
WITH CHECK (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email());
DROP POLICY IF EXISTS denuncias_delete ON public.denuncias;
CREATE POLICY denuncias_delete ON public.denuncias
FOR DELETE TO authenticated
USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email());

DROP POLICY IF EXISTS reportes_spam_select ON public.reportes_spam;
CREATE POLICY reportes_spam_select ON public.reportes_spam
FOR SELECT TO authenticated
USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email());
DROP POLICY IF EXISTS reportes_spam_update ON public.reportes_spam;
CREATE POLICY reportes_spam_update ON public.reportes_spam
FOR UPDATE TO authenticated
USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email())
WITH CHECK (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email());
DROP POLICY IF EXISTS reportes_spam_delete ON public.reportes_spam;
CREATE POLICY reportes_spam_delete ON public.reportes_spam
FOR DELETE TO authenticated
USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false AND public.is_admin_email());

-- 7) config_pagos es RPC-only. Policy explicita para documentar que no hay acceso cliente directo.
DROP POLICY IF EXISTS config_pagos_service_access ON public.config_pagos;
CREATE POLICY config_pagos_service_access ON public.config_pagos
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- 8) Los futuros helpers no deben quedar ejecutables por defecto desde la API.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
