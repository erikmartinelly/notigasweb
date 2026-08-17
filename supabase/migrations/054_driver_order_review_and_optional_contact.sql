-- 054_driver_order_review_and_optional_contact.sql
-- El repartidor revisa el pedido en el mapa antes de elegir/navegar.
-- La direccion y el telefono del comprador son opcionales; el correo autenticado
-- se entrega solamente a repartidores habilitados para trazabilidad y denuncias.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_optional_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF public.is_admin_email() THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR public.is_banned() THEN
    RAISE EXCEPTION 'Cuenta no autorizada para publicar';
  END IF;

  NEW.user_id := v_uid;
  NEW.estado := 'pendiente';
  NEW.driver_id := NULL;
  NEW.visto := false;
  NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 120);
  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.cantidad := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
  NEW.categoria := LEFT(LOWER(TRIM(COALESCE(NEW.categoria, 'gas'))), 60);
  NEW.ciudad := LEFT(LOWER(TRIM(COALESCE(NEW.ciudad, ''))), 80);

  IF NEW.titulo = ''
     OR (NEW.telefono <> '' AND length(NEW.telefono) < 6)
     OR NEW.latitude NOT BETWEEN -90 AND 90
     OR NEW.longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Datos del pedido invalidos o incompletos';
  END IF;

  PERFORM public.enforce_action_rate_limit('create_order', 8, 300);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_050_limit_pedidos ON public.pedidos;
CREATE TRIGGER trg_050_limit_pedidos
BEFORE INSERT ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.guard_optional_order_insert();

CREATE OR REPLACE FUNCTION public.rpc_get_driver_available_orders(
    p_ciudad text DEFAULT NULL,
    p_categoria text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    buyer_email text,
    buyer_name text,
    titulo text,
    categoria text,
    cantidad text,
    direccion text,
    telefono text,
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone,
    estado text,
    visto boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_driver_id text := auth.uid()::text;
    v_norm_city text := NULLIF(LOWER(TRIM(COALESCE(p_ciudad, ''))), '');
    v_norm_cat text := NULLIF(LOWER(TRIM(COALESCE(p_categoria, ''))), '');
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.choferes_habilitados ch
        WHERE ch.user_id = v_driver_id
          AND NOT EXISTS (
              SELECT 1 FROM public.usuarios_baneados ub
              WHERE ub.user_id = v_driver_id
          )
    ) THEN
        RAISE EXCEPTION 'Repartidor no habilitado o cuenta suspendida';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        u.email::text,
        COALESCE(NULLIF(TRIM(p.titulo), ''), split_part(u.email::text, '@', 1)),
        p.titulo,
        p.categoria,
        COALESCE(NULLIF(TRIM(p.cantidad), ''), '1 unidad'),
        COALESCE(NULLIF(TRIM(p.direccion), ''), 'Ubicacion fijada en mapa GPS (opcional)'),
        NULLIF(TRIM(p.telefono), ''),
        COALESCE(NULLIF(TRIM(p.barrio_otb), ''), 'Zona indicada en el mapa'),
        p.latitude,
        p.longitude,
        p.created_at,
        p.estado,
        COALESCE(p.visto, false)
    FROM public.pedidos p
    JOIN auth.users u ON u.id::text = p.user_id
    WHERE p.estado IN ('pendiente', 'visto')
      AND (v_norm_city IS NULL OR LOWER(TRIM(p.ciudad)) = v_norm_city)
      AND (
          v_norm_cat IS NULL
          OR LOWER(TRIM(p.categoria)) = v_norm_cat
          OR (v_norm_cat IN ('gas', 'gas glp') AND LOWER(TRIM(p.categoria)) IN ('gas', 'gas glp', 'garrafa'))
          OR (v_norm_cat IN ('agua', 'agua potable') AND LOWER(TRIM(p.categoria)) IN ('agua', 'agua potable', 'botellon'))
      )
    ORDER BY p.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_driver_available_orders(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_driver_available_orders(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_optional_order_insert() FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('054', 'driver_order_review_and_optional_contact')
ON CONFLICT (version) DO NOTHING;

COMMIT;
