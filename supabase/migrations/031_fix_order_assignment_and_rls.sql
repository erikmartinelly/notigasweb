-- ==========================================
-- 031_fix_order_assignment_and_rls.sql
-- 1. Ampliación del esquema de moderación (usuarios_baneados)
-- 2. Corrección de función is_banned() para validar email y user_id
-- 3. Creación de RPC rpc_assign_order para asignación atómica y segura de pedidos
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

CREATE OR REPLACE FUNCTION public.rpc_assign_order(p_order_id uuid)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id text;
    v_driver_rec RECORD;
    v_order_rec public.pedidos;
BEGIN
    v_driver_id := auth.uid()::text;
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- Validar que el conductor esté registrado
    SELECT * INTO v_driver_rec
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado';
    END IF;

    -- Validar y actualizar pedido atómicamente
    UPDATE public.pedidos
    SET 
        estado = 'asignado',
        driver_id = v_driver_id
    WHERE id = p_order_id
      AND estado IN ('pendiente', 'visto')
      AND (driver_id IS NULL OR driver_id = v_driver_id)
    RETURNING * INTO v_order_rec;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido ya fue tomado por otro repartidor o no está disponible';
    END IF;

    RETURN v_order_rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;
