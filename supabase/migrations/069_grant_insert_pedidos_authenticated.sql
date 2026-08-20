-- ==============================================================================
-- NOTIGAS - MIGRACIÓN 069: PERMISOS Y ROBUSTEZ DE CREACIÓN DE PEDIDOS (INSERT)
-- ==============================================================================

-- 1. Garantizar permisos SELECT e INSERT en pedidos para usuarios autenticados
GRANT SELECT, INSERT ON TABLE public.pedidos TO authenticated;

-- 2. Asegurar política RLS de inserción para compradores autenticados
DROP POLICY IF EXISTS "Pedidos Insertar propio" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;

CREATE POLICY "pedidos_insert"
ON public.pedidos
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT auth.uid())::text = user_id
    AND NOT public.is_banned()
);

-- 3. Robustecer trigger guard_optional_order_insert para auto-asignar título si no se especifica
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
  NEW.categoria := LEFT(LOWER(TRIM(COALESCE(NEW.categoria, 'gas'))), 60);

  -- Auto-asignar título amigable por defecto si viene vacío o nulo
  IF NEW.titulo IS NULL OR TRIM(NEW.titulo) = '' THEN
    NEW.titulo := 'Pedido de ' || INITCAP(COALESCE(NEW.categoria, 'Gas'));
  ELSE
    NEW.titulo := LEFT(REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g'), 120);
  END IF;

  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  NEW.cantidad := LEFT(REGEXP_REPLACE(COALESCE(NEW.cantidad, '1 unidad'), '<[^>]*>', '', 'g'), 60);
  NEW.direccion := LEFT(REGEXP_REPLACE(COALESCE(NEW.direccion, ''), '<[^>]*>', '', 'g'), 240);
  NEW.telefono := LEFT(REGEXP_REPLACE(COALESCE(NEW.telefono, ''), '[^0-9+ ()-]', '', 'g'), 24);
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

GRANT EXECUTE ON FUNCTION public.guard_optional_order_insert() TO postgres, authenticated, service_role;
