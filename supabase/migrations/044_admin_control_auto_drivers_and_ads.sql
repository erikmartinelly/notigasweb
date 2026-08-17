-- =============================================================================
-- 044_admin_control_auto_drivers_and_ads.sql
-- Registro automatico de repartidores, control administrativo total y
-- configuracion global de las dos unidades Google AdSense del feed.
-- =============================================================================

BEGIN;

-- Los repartidores entran activos automaticamente. La moderacion posterior se
-- realiza mediante usuarios_baneados o eliminacion de la ficha/cuenta.
UPDATE public.choferes_habilitados
SET estado_verificacion = 'aprobado'
WHERE estado_verificacion IS NULL OR LOWER(TRIM(estado_verificacion)) <> 'aprobado';

ALTER TABLE public.choferes_habilitados
  ALTER COLUMN estado_verificacion SET DEFAULT 'aprobado',
  ALTER COLUMN estado_verificacion SET NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_driver_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Ficha de repartidor no autorizada';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.estado_verificacion := 'aprobado';
  ELSIF NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion
        OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el estado o propietario';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_driver_verification ON public.choferes_habilitados;
CREATE TRIGGER trg_guard_driver_verification
BEFORE INSERT OR UPDATE ON public.choferes_habilitados
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_verification();

-- El telefono del repartidor se conserva internamente, pero no se publica en
-- el mapa en vivo. El formulario lo describe como dato de uso interno.
DROP VIEW IF EXISTS public.rutas_repartidores_publicas;
CREATE VIEW public.rutas_repartidores_publicas
WITH (security_barrier = true)
AS
SELECT
  r.id,
  CASE WHEN r.user_id = auth.uid()::text THEN r.user_id ELSE NULL::text END AS user_id,
  r.distribuidor_nombre,
  r.categoria,
  r.titulo,
  r.ciudad,
  r.latitude,
  r.longitude,
  r.garrafas_agotadas,
  r.last_active
FROM public.rutas_repartidores r
JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= now() - interval '10 minutes'
  AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = r.user_id
  );

GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

-- Configuracion unica y global: un slot dentro de fichas de repartidores y
-- otro dentro de avisos gratuitos. Los anuncios locales permanecen abajo.
CREATE TABLE IF NOT EXISTS public.configuracion_publicidad (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo text NOT NULL DEFAULT 'hybrid' CHECK (modo IN ('adsense', 'local', 'hybrid', 'disabled')),
  publisher_id text NOT NULL DEFAULT 'ca-pub-2502415561017945',
  slot_repartidores text NOT NULL DEFAULT '',
  slot_avisos text NOT NULL DEFAULT '',
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.configuracion_publicidad (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_publicidad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Publicidad Public SELECT" ON public.configuracion_publicidad;
CREATE POLICY "Publicidad Public SELECT" ON public.configuracion_publicidad
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Publicidad Admin ALL" ON public.configuracion_publicidad;
CREATE POLICY "Publicidad Admin ALL" ON public.configuracion_publicidad
FOR ALL USING (public.is_admin_email()) WITH CHECK (public.is_admin_email());

GRANT SELECT ON public.configuracion_publicidad TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.configuracion_publicidad TO authenticated;

-- Lista administrativa con IDs reales de Auth. No incluye cuentas Admin.
CREATE OR REPLACE FUNCTION public.rpc_admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  nombre text,
  role text,
  created_at timestamp with time zone,
  is_driver boolean,
  is_banned boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(p.nombre, u.raw_user_meta_data ->> 'full_name', split_part(COALESCE(u.email, ''), '@', 1))::text,
    CASE WHEN ch.user_id IS NOT NULL THEN 'repartidor' ELSE COALESCE(p.role, 'vecino') END::text,
    u.created_at,
    (ch.user_id IS NOT NULL),
    EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE ub.user_id = u.id::text
         OR (ub.email IS NOT NULL AND LOWER(TRIM(ub.email)) = LOWER(TRIM(COALESCE(u.email, ''))))
    )
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.choferes_habilitados ch ON ch.user_id = u.id::text
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_credentials ac
    WHERE LOWER(TRIM(ac.email)) = LOWER(TRIM(COALESCE(u.email, '')))
  )
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := p_user_id::text;
  v_email text;
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  SELECT LOWER(TRIM(COALESCE(u.email, ''))) INTO v_email
  FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  IF EXISTS (SELECT 1 FROM public.admin_credentials ac WHERE LOWER(TRIM(ac.email)) = v_email) THEN
    RAISE EXCEPTION 'No se puede eliminar una cuenta administradora desde el panel';
  END IF;

  DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
  DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
  DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
  DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
  DELETE FROM public.avisos WHERE user_id = v_uid;
  DELETE FROM public.votos_registro WHERE user_id = v_uid;
  DELETE FROM public.denuncias WHERE user_id = v_uid OR denunciante_id = v_uid OR denunciado_id = v_uid;
  DELETE FROM public.reportes_spam WHERE user_id = v_uid;
  DELETE FROM public.usuarios_baneados WHERE user_id = v_uid OR LOWER(TRIM(COALESCE(email, ''))) = v_email;
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_renew_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores';
  END IF;

  UPDATE public.pedidos
  SET estado = 'pendiente',
      driver_id = NULL,
      visto = false,
      created_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_order_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'estado', 'pendiente');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_users() TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_user(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_renew_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_renew_order(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_driver_verification() FROM PUBLIC, anon, authenticated;

COMMIT;
