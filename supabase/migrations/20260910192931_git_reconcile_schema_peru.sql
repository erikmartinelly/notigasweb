-- Reconciliación de esquema NOTIGAS Perú: idempotente sobre producción y suficiente para instalaciones nuevas.
ALTER TABLE public.choferes_habilitados
  ADD COLUMN IF NOT EXISTS yape_numero text,
  ADD COLUMN IF NOT EXISTS promo_pedidos_gratis_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_pedidos_gratis_usados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pedidos_credito_ciclo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pedidos_entregados_total bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comision_por_pedido numeric(10,2) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS limite_pedidos_credito integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS botellones_credito_ciclo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS botellones_entregados_total bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_botellones_credito integer NOT NULL DEFAULT 100;
ALTER TABLE public.choferes_habilitados ALTER COLUMN limite_credito SET DEFAULT 20.00;
UPDATE public.choferes_habilitados SET promo_pedidos_gratis_total=0,promo_pedidos_gratis_usados=0,comision_por_pedido=0.20,limite_pedidos_credito=100,limite_credito=20.00;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS buyer_confirmed_received boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_confirmed_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_reported_not_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_reported_not_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_resolution text,
  ADD COLUMN IF NOT EXISTS unidades_contabilizadas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_accounted_at timestamptz;
ALTER TABLE public.pedidos ALTER COLUMN comision_entrega SET DEFAULT 0.20;

ALTER TABLE public.usuarios_baneados
  ADD COLUMN IF NOT EXISTS tipo_baneo text NOT NULL DEFAULT 'administrativo',
  ADD COLUMN IF NOT EXISTS permanente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pago_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

CREATE TABLE IF NOT EXISTS public.config_pagos(
 id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1), pais_destino text NOT NULL DEFAULT 'Peru', beneficiario_nombre text,
 beneficiario_documento text, metodo_entrega text NOT NULL DEFAULT 'Yape', numero_cuenta text, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.config_pagos(id,pais_destino,beneficiario_nombre,beneficiario_documento,metodo_entrega,numero_cuenta)
VALUES(1,'Peru',NULL,NULL,'Yape','987654321')
ON CONFLICT(id) DO UPDATE SET pais_destino='Peru',beneficiario_nombre=NULL,beneficiario_documento=NULL,metodo_entrega='Yape',numero_cuenta='987654321',updated_at=now();

CREATE TABLE IF NOT EXISTS public.pagos_comisiones(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, driver_id uuid REFERENCES public.choferes_habilitados(id) ON DELETE CASCADE,
 monto numeric(10,2) NOT NULL DEFAULT 20.00, comprobante_url text, metodo text DEFAULT 'yape', estado text DEFAULT 'pendiente',
 ocr_monto numeric,ocr_operacion text,ocr_valido boolean DEFAULT false,ocr_raw_text text,admin_observacion text,created_at timestamptz DEFAULT now(),reviewed_at timestamptz);
ALTER TABLE public.pagos_comisiones
 ADD COLUMN IF NOT EXISTS cobro_generado_at timestamptz, ADD COLUMN IF NOT EXISTS pago_fecha timestamptz,
 ADD COLUMN IF NOT EXISTS numero_transaccion text, ADD COLUMN IF NOT EXISTS remitente_nombre text,
 ADD COLUMN IF NOT EXISTS remitente_dni text, ADD COLUMN IF NOT EXISTS remitente_yape text, ADD COLUMN IF NOT EXISTS device_id text,
 ADD COLUMN IF NOT EXISTS expected_nombre text, ADD COLUMN IF NOT EXISTS expected_dni text, ADD COLUMN IF NOT EXISTS expected_yape text,
 ADD COLUMN IF NOT EXISTS expected_device_id text, ADD COLUMN IF NOT EXISTS monto_valido boolean DEFAULT false,
 ADD COLUMN IF NOT EXISTS fecha_valida boolean DEFAULT false, ADD COLUMN IF NOT EXISTS transaccion_unica boolean DEFAULT false,
 ADD COLUMN IF NOT EXISTS dni_coincide boolean, ADD COLUMN IF NOT EXISTS nombre_coincide boolean, ADD COLUMN IF NOT EXISTS yape_coincide boolean,
 ADD COLUMN IF NOT EXISTS device_coincide boolean, ADD COLUMN IF NOT EXISTS ocr_confianza numeric, ADD COLUMN IF NOT EXISTS ocr_procesado_at timestamptz,
 ADD COLUMN IF NOT EXISTS origen_comprobante text DEFAULT 'ocr_local_sin_imagen', ADD COLUMN IF NOT EXISTS validado_automaticamente_at timestamptz,
 ADD COLUMN IF NOT EXISTS verificado_recepcion_at timestamptz, ADD COLUMN IF NOT EXISTS verificado_recepcion_por text,
 ADD COLUMN IF NOT EXISTS fraude_confirmado boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS monto_enviado_pen numeric,
 ADD COLUMN IF NOT EXISTS destinatario_nombre text, ADD COLUMN IF NOT EXISTS destinatario_yape text,
 ADD COLUMN IF NOT EXISTS destinatario_nombre_coincide boolean, ADD COLUMN IF NOT EXISTS destinatario_yape_coincide boolean;

CREATE TABLE IF NOT EXISTS public.notificaciones_repartidor(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL,pedido_id uuid,tipo text NOT NULL,titulo text NOT NULL,mensaje text NOT NULL,
 leida boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz);
CREATE INDEX IF NOT EXISTS idx_notificaciones_repartidor_user ON public.notificaciones_repartidor(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_repartidor_pedido_id ON public.notificaciones_repartidor(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_user_id ON public.pagos_comisiones(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_driver_id ON public.pagos_comisiones(driver_id);
CREATE INDEX IF NOT EXISTS idx_registro_comisiones_driver_id ON public.registro_comisiones(driver_id);

ALTER TABLE public.pagos_comisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_repartidor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_roles_select ON public.usuarios_roles;
DROP POLICY IF EXISTS usuarios_roles_select_public ON public.usuarios_roles;
DROP POLICY IF EXISTS "Lectura publica usuarios_roles" ON public.usuarios_roles;
DROP POLICY IF EXISTS usuarios_roles_select_own_or_admin ON public.usuarios_roles;
CREATE POLICY usuarios_roles_select_own_or_admin ON public.usuarios_roles FOR SELECT TO authenticated
USING(lower(trim(email))=lower(trim(coalesce((SELECT auth.jwt()->>'email'),''))) OR public.is_admin_email());
REVOKE SELECT ON public.usuarios_roles FROM anon;
GRANT SELECT ON public.usuarios_roles TO authenticated;

DROP FUNCTION IF EXISTS public.validar_admin(text,text);
ALTER TABLE public.admin_credentials DROP COLUMN IF EXISTS password_hash;
REVOKE ALL ON public.admin_credentials FROM anon;
REVOKE SELECT ON public.admin_credentials FROM authenticated;
GRANT SELECT(email) ON public.admin_credentials TO authenticated;
DROP POLICY IF EXISTS admin_credentials_select_own ON public.admin_credentials;
DROP POLICY IF EXISTS "Admins select own record" ON public.admin_credentials;
CREATE POLICY admin_credentials_select_own ON public.admin_credentials FOR SELECT TO authenticated
USING(lower(trim(email))=lower(trim(coalesce((SELECT auth.jwt()->>'email'),''))));

REVOKE ALL ON public.config_pagos FROM anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,TRIGGER,REFERENCES ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
NOTIFY pgrst,'reload schema';