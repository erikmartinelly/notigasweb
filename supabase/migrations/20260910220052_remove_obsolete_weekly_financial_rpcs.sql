-- Remove obsolete weekly financial RPCs and harden manual administrative bans.
-- Current NOTIGAS Peru contract: S/ 0.20 per confirmed order, 100 orders = S/ 20.
-- There is no weekly automatic cutoff/ban workflow.

DROP FUNCTION IF EXISTS public.rpc_ejecutar_corte_semanal_comisiones();
DROP FUNCTION IF EXISTS public.rpc_ejecutar_baneo_semanal_morosos();

CREATE OR REPLACE FUNCTION public.rpc_banear_repartidor_completo(
  p_user_id text,
  p_motivo text DEFAULT 'Suspensión administrativa'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_driver public.choferes_habilitados%ROWTYPE;
  v_motivo text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  v_motivo := COALESCE(NULLIF(btrim(p_motivo), ''), 'Suspensión administrativa');

  SELECT * INTO v_driver
  FROM public.choferes_habilitados
  WHERE user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repartidor no encontrado';
  END IF;

  UPDATE public.usuarios_baneados
  SET nombre = v_driver.nombre_completo,
      telefono = v_driver.telefono_whatsapp,
      placa = v_driver.placa,
      dni = v_driver.dni,
      device_id = v_driver.device_id,
      device_fingerprint = v_driver.device_fingerprint,
      motivo = v_motivo,
      tipo_baneo = 'administrativo',
      permanente = true,
      reviewed_by = auth.uid()::text
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.usuarios_baneados (
      user_id, nombre, telefono, placa, dni, device_id, device_fingerprint,
      motivo, tipo_baneo, permanente, reviewed_by
    ) VALUES (
      p_user_id, v_driver.nombre_completo, v_driver.telefono_whatsapp,
      v_driver.placa, v_driver.dni, v_driver.device_id,
      v_driver.device_fingerprint, v_motivo, 'administrativo', true,
      auth.uid()::text
    );
  END IF;

  PERFORM set_config('notigas.internal_driver_finance','1',true);
  UPDATE public.choferes_habilitados
  SET bloqueado = true,
      estado_verificacion = 'bloqueado',
      estado_servicio = 'baneado',
      motivo_bloqueo = v_motivo
  WHERE user_id = p_user_id;

  DELETE FROM public.rutas_repartidores
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'motivo', v_motivo,
    'mensaje', 'Repartidor suspendido administrativamente.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_banear_repartidor_completo(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_banear_repartidor_completo(text,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
