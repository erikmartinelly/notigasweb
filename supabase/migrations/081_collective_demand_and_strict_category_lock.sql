-- ==============================================================================
-- MIGRACIÓN 081: FILOSOFÍA DE DEMANDA COLECTIVA, DATOS COMPLETOS PARA REPARTIDOR Y CATEGORÍA ESTRICTA
-- ==============================================================================

-- 1. Permitir que el teléfono sea opcional en la tabla pedidos
ALTER TABLE public.pedidos ALTER COLUMN telefono DROP NOT NULL;
ALTER TABLE public.pedidos ALTER COLUMN telefono SET DEFAULT '';

-- 2. Función de verificación de chofer habilitado con categoría estricta (sin comodines otros/todos)
CREATE OR REPLACE FUNCTION public.is_current_enabled_driver(p_ciudad text, p_categoria text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.choferes_habilitados ch
    WHERE ch.user_id = (SELECT auth.uid())::text
      AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
      AND (p_ciudad IS NULL OR LOWER(TRIM(ch.ciudad)) = LOWER(TRIM(p_ciudad)))
      AND (
        p_categoria IS NOT NULL
        AND (
          LOWER(TRIM(ch.categoria)) = LOWER(TRIM(p_categoria))
          OR (LOWER(TRIM(ch.categoria)) IN ('gas', 'gas glp', 'garrafa', 'glp') AND LOWER(TRIM(p_categoria)) IN ('gas', 'gas glp', 'garrafa', 'glp'))
          OR (LOWER(TRIM(ch.categoria)) IN ('agua', 'agua potable', 'botellon') AND LOWER(TRIM(p_categoria)) IN ('agua', 'agua potable', 'botellon'))
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = ch.user_id
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) TO anon, authenticated;

-- 3. Actualizar vista pedidos_publicos entregando datos completos al chofer habilitado de la categoría
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;

CREATE VIEW public.pedidos_publicos WITH (security_invoker = true) AS
SELECT
    p.id,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text THEN p.user_id
        ELSE NULL::text
    END AS user_id,
    p.categoria,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.descripcion
        ELSE NULL::text
    END AS descripcion,
    p.cantidad,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.direccion
        ELSE COALESCE(p.barrio_otb, 'Zona indicada en el mapa')
    END AS direccion,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.telefono
        ELSE NULL::text
    END AS telefono,
    p.estado,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text THEN p.driver_id
        ELSE NULL::text
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa') AS barrio_otb,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.latitude
        ELSE round(p.latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text 
          OR p.driver_id = (SELECT auth.uid())::text 
          OR public.is_admin_email() 
          OR public.is_current_enabled_driver(p.ciudad, p.categoria) 
        THEN p.longitude
        ELSE round(p.longitude::numeric, 3)::double precision
    END AS longitude,
    p.visto,
    p.created_at,
    p.updated_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto', 'asignado')
  AND p.created_at >= (now() - interval '48 hours')
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = p.user_id
  );

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- 4. Actualizar rpc_assign_order eliminando comodines otros/todos
CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_driver_id text;
    v_driver record;
    v_order record;
    v_order_cat text;
    v_driver_cat text;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está baneado o no autorizado';
    END IF;

    SELECT * INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no es un repartidor habilitado';
    END IF;

    SELECT * INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    -- Validar estrictamente la ciudad del chofer
    IF LOWER(TRIM(COALESCE(v_order.ciudad, ''))) <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    v_order_cat := LOWER(TRIM(COALESCE(v_order.categoria, '')));
    v_driver_cat := LOWER(TRIM(COALESCE(v_driver.categoria, '')));

    IF v_order_cat ILIKE '%gas%' OR v_order_cat ILIKE '%glp%' OR v_order_cat ILIKE '%garrafa%' THEN
        v_order_cat := 'gas';
    ELSIF v_order_cat ILIKE '%agua%' OR v_order_cat ILIKE '%botell%' THEN
        v_order_cat := 'agua';
    END IF;

    IF v_driver_cat ILIKE '%gas%' OR v_driver_cat ILIKE '%glp%' OR v_driver_cat ILIKE '%garrafa%' THEN
        v_driver_cat := 'gas';
    ELSIF v_driver_cat ILIKE '%agua%' OR v_driver_cat ILIKE '%botell%' THEN
        v_driver_cat := 'agua';
    END IF;

    -- Comparación estricta de categoría sin comodines
    IF v_order_cat <> v_driver_cat THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    IF v_order.estado = 'asignado' THEN
        IF v_order.driver_id = v_driver_id THEN
            RETURN jsonb_build_object('ok', true, 'message', 'Pedido ya asignado a ti');
        ELSE
            RAISE EXCEPTION 'Este pedido ya fue tomado por otro repartidor';
        END IF;
    END IF;

    IF v_order.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible para asignación';
    END IF;

    UPDATE public.pedidos
    SET estado = 'asignado',
        driver_id = v_driver_id,
        visto = true,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'estado', 'asignado',
        'driver_id', v_driver_id
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;
