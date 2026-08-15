-- ==========================================
-- 031_fix_order_assignment_and_rls.sql
-- 1. Ampliación del esquema de moderación (usuarios_baneados)
-- 2. Corrección de función is_banned() para validar email y user_id
-- 3. Creación de RPC rpc_assign_order para asignación atómica, validada y segura de pedidos
-- ==========================================

-- 1. Añadir columnas a usuarios_baneados si no existen
ALTER TABLE IF EXISTS public.usuarios_baneados
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS nombre text,
ADD COLUMN IF NOT EXISTS placa text,
ADD COLUMN IF NOT EXISTS telefono text;

CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_email ON public.usuarios_baneados(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_user_id ON public.usuarios_baneados(user_id);

-- 2. Actualizar función is_banned() con búsqueda robusta por user_id y email
DROP FUNCTION IF EXISTS public.is_banned();

CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email text;
  u_id text;
BEGIN
  u_id := auth.uid()::text;
  u_email := LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')));
  
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios_baneados 
    WHERE (user_id IS NOT NULL AND user_id = u_id)
       OR (email IS NOT NULL AND LOWER(TRIM(email)) = u_email AND u_email != '')
       OR (user_id IS NOT NULL AND user_id = u_email AND u_email != '')
  );
END;
$$;

-- 3. RPC para asignación atómica de pedidos individuales por parte del repartidor
DROP FUNCTION IF EXISTS public.rpc_assign_order(uuid);

CREATE OR REPLACE FUNCTION public.rpc_assign_order(
    p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_driver record;
    v_order record;
BEGIN
    -- Usuario autenticado
    v_driver_id := auth.uid()::text;

    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- Validar si está baneado
    IF is_banned() THEN
        RAISE EXCEPTION 'El usuario está baneado o no autorizado';
    END IF;

    -- Obtener repartidor
    SELECT *
    INTO v_driver
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no es un repartidor habilitado';
    END IF;

    -- Obtener pedido con bloqueo FOR UPDATE
    SELECT *
    INTO v_order
    FROM public.pedidos
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido no encontrado';
    END IF;

    -- Validar ciudad
    IF LOWER(TRIM(COALESCE(v_order.ciudad, '')))
       <> LOWER(TRIM(COALESCE(v_driver.ciudad, ''))) THEN
        RAISE EXCEPTION 'El pedido no pertenece a la ciudad del repartidor';
    END IF;

    -- Validar categoría
    IF LOWER(TRIM(COALESCE(v_order.categoria, '')))
       <> LOWER(TRIM(COALESCE(v_driver.categoria, ''))) THEN
        RAISE EXCEPTION 'El pedido no corresponde a la categoría del repartidor';
    END IF;

    -- Solo pedidos disponibles
    IF v_order.estado NOT IN ('pendiente', 'visto') THEN
        RAISE EXCEPTION 'El pedido ya no está disponible';
    END IF;

    -- Asignación individual atómica
    UPDATE public.pedidos
    SET
        estado = 'asignado',
        driver_id = v_driver_id,
        updated_at = now()
    WHERE id = p_order_id
      AND estado IN ('pendiente', 'visto');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido fue asignado por otro repartidor';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'order_id', p_order_id,
        'driver_id', v_driver_id,
        'estado', 'asignado'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_pedidos_assignment
ON public.pedidos (id, estado, ciudad, categoria);
