-- Reconciliación exacta con Supabase producción: 20260911020236
UPDATE public.config_pagos
SET numero_cuenta = NULL, beneficiario_nombre = NULL, beneficiario_documento = NULL, updated_at = now()
WHERE id = 1 AND regexp_replace(coalesce(numero_cuenta,''),'[^0-9]','','g') = '987654321';

CREATE OR REPLACE FUNCTION public.rpc_admin_get_payment_config()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth, pg_temp
AS $$
DECLARE v public.config_pagos%ROWTYPE;
BEGIN
  IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
  SELECT * INTO v FROM public.config_pagos WHERE id=1;
  RETURN jsonb_build_object('ok',true,'pais_destino',coalesce(v.pais_destino,'Peru'),'metodo_entrega',coalesce(v.metodo_entrega,'Yape'),'beneficiario_nombre',v.beneficiario_nombre,'beneficiario_documento',v.beneficiario_documento,'numero_cuenta',v.numero_cuenta);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_payment_config(p_beneficiario_nombre text,p_numero_cuenta text,p_beneficiario_documento text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, auth, pg_temp
AS $$
DECLARE v_name text:=nullif(btrim(p_beneficiario_nombre),''); v_yape text:=regexp_replace(coalesce(p_numero_cuenta,''),'[^0-9]','','g');
BEGIN
  IF NOT public.is_admin_email() THEN RAISE EXCEPTION 'Acceso denegado: solo administradores'; END IF;
  IF v_name IS NULL OR length(v_name)<3 THEN RAISE EXCEPTION 'Nombre del beneficiario inválido'; END IF;
  IF v_yape !~ '^9[0-9]{8}$' THEN RAISE EXCEPTION 'El Yape receptor debe tener 9 dígitos y comenzar con 9'; END IF;
  INSERT INTO public.config_pagos(id,pais_destino,beneficiario_nombre,beneficiario_documento,metodo_entrega,numero_cuenta,updated_at)
  VALUES(1,'Peru',v_name,nullif(btrim(p_beneficiario_documento),''),'Yape',v_yape,now())
  ON CONFLICT(id) DO UPDATE SET pais_destino='Peru',beneficiario_nombre=excluded.beneficiario_nombre,beneficiario_documento=excluded.beneficiario_documento,metodo_entrega='Yape',numero_cuenta=excluded.numero_cuenta,updated_at=now();
  RETURN jsonb_build_object('ok',true,'configured',true);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_get_payment_instructions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE v public.config_pagos%ROWTYPE; v_yape text; v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT * INTO v FROM public.config_pagos WHERE id=1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'configured',false); END IF;
  v_yape:=regexp_replace(coalesce(v.numero_cuenta,''),'[^0-9]','','g');
  v_ok:=lower(coalesce(v.pais_destino,''))='peru' AND lower(coalesce(v.metodo_entrega,''))='yape' AND nullif(btrim(v.beneficiario_nombre),'') IS NOT NULL AND v_yape ~ '^9[0-9]{8}$';
  IF NOT v_ok THEN RETURN jsonb_build_object('ok',true,'configured',false,'pais_destino','Peru','metodo_entrega','Yape'); END IF;
  RETURN jsonb_build_object('ok',true,'configured',true,'pais_destino','Peru','beneficiario_nombre',v.beneficiario_nombre,'beneficiario_documento',v.beneficiario_documento,'metodo_entrega','Yape','numero_cuenta',v_yape);
END; $$;

REVOKE ALL ON FUNCTION public.rpc_admin_get_payment_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_admin_set_payment_config(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_get_payment_instructions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_get_payment_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_payment_config(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_payment_instructions() TO authenticated;
