-- Migration 20260907234500: Driver 10kg gas cylinder price and Premium subscription (S/ 15/month)

-- 1. Add columns to choferes_habilitados
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS precio_balon_10kg numeric(6,2) DEFAULT NULL;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS es_premium boolean DEFAULT false;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS premium_vence_at timestamptz DEFAULT NULL;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS comprobante_pago_url text DEFAULT NULL;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS comprobante_fecha timestamptz DEFAULT NULL;
ALTER TABLE public.choferes_habilitados ADD COLUMN IF NOT EXISTS estado_pago_premium text DEFAULT 'ninguno';

-- 2. Add columns to rutas_repartidores
ALTER TABLE public.rutas_repartidores ADD COLUMN IF NOT EXISTS precio_balon_10kg numeric(6,2) DEFAULT NULL;
ALTER TABLE public.rutas_repartidores ADD COLUMN IF NOT EXISTS es_premium boolean DEFAULT false;

-- 3. Create storage bucket for vouchers if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('vouchers-premium', 'vouchers-premium', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for vouchers-premium
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Vouchers Premium Public Read'
    ) THEN
        CREATE POLICY "Vouchers Premium Public Read"
        ON storage.objects FOR SELECT
        TO anon, authenticated
        USING (bucket_id = 'vouchers-premium');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Vouchers Premium Auth Insert'
    ) THEN
        CREATE POLICY "Vouchers Premium Auth Insert"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'vouchers-premium');
    END IF;
END $$;

-- 4. Helper function to check if current caller is an active premium driver
CREATE OR REPLACE FUNCTION public.is_current_driver_premium()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.choferes_habilitados ch
        WHERE ch.user_id = (SELECT auth.uid()::text)
          AND ch.es_premium = true
          AND (ch.premium_vence_at IS NULL OR ch.premium_vence_at >= now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_driver_premium() TO anon, authenticated;

-- 5. Recreate public.choferes_publicos
DROP VIEW IF EXISTS public.choferes_publicos CASCADE;
CREATE VIEW public.choferes_publicos
WITH (security_barrier = true, security_invoker = false)
AS
SELECT 
    ch.id,
    ch.user_id,
    ch.nombre_completo,
    ch.categoria,
    ch.ciudad,
    ch.zonas,
    ch.schedule,
    ch.placa,
    ch.productos,
    ch.telefono_whatsapp AS telefono,
    NULL::text AS descripcion,
    NULL::text AS foto_url,
    COALESCE(ch.color_camion, '') AS color_camion,
    ch.precio_balon_10kg,
    COALESCE(ch.es_premium AND (ch.premium_vence_at IS NULL OR ch.premium_vence_at >= now()), false) AS es_premium,
    ch.premium_vence_at,
    ch.estado_verificacion,
    ch.created_at
FROM public.choferes_habilitados ch
WHERE LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub 
    WHERE (ub.user_id IS NOT NULL AND ub.user_id = ch.user_id)
       OR (ub.telefono IS NOT NULL AND ub.telefono = ch.telefono_whatsapp)
       OR (ub.placa IS NOT NULL AND LOWER(ub.placa) = LOWER(ch.placa))
  )
ORDER BY (COALESCE(ch.es_premium AND (ch.premium_vence_at IS NULL OR ch.premium_vence_at >= now()), false)) DESC, ch.created_at DESC;

ALTER VIEW public.choferes_publicos OWNER TO postgres;
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;

-- 6. Recreate public.rutas_repartidores_publicas
DROP VIEW IF EXISTS public.rutas_repartidores_publicas CASCADE;
CREATE OR REPLACE VIEW public.rutas_repartidores_publicas AS
SELECT 
    r.id,
    CASE
        WHEN r.user_id = (SELECT auth.uid()::text) THEN r.user_id
        ELSE NULL::text
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS'::text) AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP'::text) AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución'::text) AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    COALESCE(ch.placa, '') AS placa,
    COALESCE(ch.productos, '') AS productos,
    COALESCE(r.garrafas_agotadas, false) AS balones_agotados,
    COALESCE(NULLIF(TRIM(r.color_camion), ''), NULLIF(TRIM(ch.color_camion), ''), '') AS color_camion,
    COALESCE(r.precio_balon_10kg, ch.precio_balon_10kg) AS precio_balon_10kg,
    COALESCE(ch.es_premium AND (ch.premium_vence_at IS NULL OR ch.premium_vence_at >= now()), false) AS es_premium
FROM public.rutas_repartidores r
LEFT JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = r.user_id
  );

ALTER VIEW public.rutas_repartidores_publicas OWNER TO postgres;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

-- 7. Recreate public.pedidos_publicos with 3-minute premium advantage rule
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;
CREATE VIEW public.pedidos_publicos AS
SELECT 
    id,
    CASE
        WHEN (user_id = (SELECT auth.uid()::text)) THEN user_id
        ELSE NULL::text
    END AS user_id,
    categoria,
    CASE
        WHEN (user_id = (SELECT auth.uid()::text)) 
          OR (driver_id = (SELECT auth.uid()::text)) 
          OR is_admin_email() 
          OR ((driver_id IS NULL) AND is_current_enabled_driver(ciudad, categoria)) THEN titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    CASE
        WHEN (user_id = (SELECT auth.uid()::text)) 
          OR (driver_id = (SELECT auth.uid()::text)) 
          OR is_admin_email() 
          OR ((driver_id IS NULL) AND is_current_enabled_driver(ciudad, categoria)) THEN descripcion
        ELSE NULL::text
    END AS descripcion,
    cantidad,
    CASE
        WHEN (user_id = (SELECT auth.uid()::text)) 
          OR (driver_id = (SELECT auth.uid()::text)) 
          OR is_admin_email() 
          OR ((driver_id IS NULL) AND is_current_enabled_driver(ciudad, categoria)) THEN direccion
        ELSE COALESCE(barrio_otb, 'Zona indicada en el mapa'::text)
    END AS direccion,
    CASE
        WHEN ((driver_id IS NOT NULL) AND (driver_id <> (SELECT auth.uid()::text)) AND (NOT is_admin_email())) THEN NULL::text
        WHEN (user_id = (SELECT auth.uid()::text)) 
          OR (driver_id = (SELECT auth.uid()::text)) 
          OR is_admin_email() 
          OR ((driver_id IS NULL) AND is_current_enabled_driver(ciudad, categoria)) THEN telefono
        ELSE NULL::text
    END AS telefono,
    estado,
    CASE
        WHEN ((user_id = (SELECT auth.uid()::text)) OR (driver_id = (SELECT auth.uid()::text))) THEN driver_id
        ELSE NULL::text
    END AS driver_id,
    ciudad,
    COALESCE(barrio_otb, 'Zona indicada en el mapa'::text) AS barrio_otb,
    CASE
        WHEN (user_id = (SELECT auth.uid()::text)) 
          OR (driver_id = (SELECT auth.uid()::text)) 
          OR is_admin_email() 
          OR ((driver_id IS NULL) AND is_current_enabled_driver(ciudad, categoria)) THEN latitude
        ELSE (round((latitude)::numeric, 3))::double precision
    END AS latitude,
    CASE
        WHEN (user_id = (SELECT auth.uid()::text)) 
          OR (driver_id = (SELECT auth.uid()::text)) 
          OR is_admin_email() 
          OR ((driver_id IS NULL) AND is_current_enabled_driver(ciudad, categoria)) THEN longitude
        ELSE (round((longitude)::numeric, 3))::double precision
    END AS longitude,
    visto,
    created_at,
    updated_at,
    subestado
FROM pedidos p
WHERE (
    (user_id = (SELECT auth.uid()::text)) 
    OR is_admin_email() 
    OR (driver_id = (SELECT auth.uid()::text)) 
    OR (
        (estado = ANY (ARRAY['pendiente'::text, 'visto'::text])) 
        AND (driver_id IS NULL) 
        AND (created_at >= (now() - '48:00:00'::interval)) 
        -- Regla Premium: Ventaja de 3 minutos
        -- Los repartidores Premium (y admin/dueño) ven pedidos inmediatamente.
        -- Los repartidores estándar solo ven pedidos creados hace 3 minutos o más.
        AND (
            is_current_driver_premium() 
            OR is_admin_email() 
            OR (user_id = (SELECT auth.uid()::text)) 
            OR (created_at <= (now() - interval '3 minutes'))
        )
        AND (NOT (EXISTS (
            SELECT 1 FROM usuarios_baneados ub WHERE (ub.user_id = p.user_id)
        )))
    )
);

ALTER VIEW public.pedidos_publicos OWNER TO postgres;
GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- 8. RPC para que el chofer envíe su comprobante de pago QR
CREATE OR REPLACE FUNCTION public.rpc_driver_submit_premium_payment(p_comprobante_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id text := (SELECT auth.uid()::text);
    v_driver_id uuid;
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

    UPDATE public.choferes_habilitados
    SET 
        comprobante_pago_url = p_comprobante_url,
        comprobante_fecha = now(),
        estado_pago_premium = 'pendiente_revision'
    WHERE id = v_driver_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Comprobante de pago recibido. En revision por el administrador.',
        'driver_id', v_driver_id,
        'estado', 'pendiente_revision'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_driver_submit_premium_payment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_driver_submit_premium_payment(text) TO authenticated;

-- 9. RPC para que el admin apruebe o rechace el pago Premium
CREATE OR REPLACE FUNCTION public.rpc_admin_verify_premium_payment(p_driver_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    v_is_admin := is_admin_email();
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Solo administradores autorizados pueden validar pagos premium';
    END IF;

    IF p_action = 'aprobar' THEN
        UPDATE public.choferes_habilitados
        SET 
            es_premium = true,
            premium_vence_at = NOW() + INTERVAL '30 days',
            estado_pago_premium = 'aprobado'
        WHERE id = p_driver_id;

        -- Sincronizar en rutas activas si existe
        UPDATE public.rutas_repartidores
        SET es_premium = true
        WHERE user_id = (SELECT user_id FROM public.choferes_habilitados WHERE id = p_driver_id);

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Suscripcion Premium de 30 dias activada con exito',
            'estado', 'aprobado'
        );
    ELSIF p_action = 'rechazar' THEN
        UPDATE public.choferes_habilitados
        SET 
            es_premium = false,
            estado_pago_premium = 'rechazado'
        WHERE id = p_driver_id;

        UPDATE public.rutas_repartidores
        SET es_premium = false
        WHERE user_id = (SELECT user_id FROM public.choferes_habilitados WHERE id = p_driver_id);

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Comprobante rechazado',
            'estado', 'rechazado'
        );
    ELSE
        RAISE EXCEPTION 'Accion no valida. Use "aprobar" o "rechazar"';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_verify_premium_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_verify_premium_payment(uuid, text) TO authenticated;

-- 10. RPC para depurar vouchers caducados (elimina comprobantes vencidos el siguiente mes)
CREATE OR REPLACE FUNCTION public.rpc_purge_expired_premium_vouchers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    -- Identificar y actualizar choferes cuya suscripción ya venció
    WITH caducados AS (
        UPDATE public.choferes_habilitados
        SET 
            es_premium = false,
            estado_pago_premium = 'caducado',
            comprobante_pago_url = NULL
        WHERE es_premium = true 
          AND premium_vence_at IS NOT NULL 
          AND premium_vence_at < NOW()
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM caducados;

    -- Sincronizar rutas
    UPDATE public.rutas_repartidores r
    SET es_premium = false
    FROM public.choferes_habilitados ch
    WHERE r.user_id = ch.user_id
      AND ch.es_premium = false;

    RETURN jsonb_build_object(
        'success', true,
        'purged_count', v_count,
        'message', format('Se depuraron %s suscripciones premium caducadas', v_count)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_purge_expired_premium_vouchers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_purge_expired_premium_vouchers() TO authenticated;
