-- 025_binary_logic.sql
-- Simplificación a modelo binario (activo/borrado) y privacidad dual

-- 1. Restaurar el enmascaramiento en la vista pública
DROP VIEW IF EXISTS pedidos_publicos CASCADE;

CREATE OR REPLACE VIEW pedidos_publicos AS
SELECT
    id,
    user_id,
    categoria,
    titulo,
    cantidad,
    '***' as direccion,
    '***' as telefono,
    estado,
    driver_id,
    ciudad,
    barrio_otb,
    round(latitude::numeric, 3) as latitude,
    round(longitude::numeric, 3) as longitude,
    descripcion,
    created_at
FROM pedidos;

GRANT SELECT ON pedidos_publicos TO authenticated, anon;


-- 2. Permitir que los clientes eliminen sus propios pedidos (en lugar de solo actualizarlos)
DROP POLICY IF EXISTS "Users can delete own orders" ON public.pedidos;
CREATE POLICY "Users can delete own orders" ON public.pedidos
FOR DELETE USING ( auth.uid()::text = user_id );


-- 3. Permitir que los choferes habilitados lean la tabla 'pedidos' completa (para ver los datos reales)
DROP POLICY IF EXISTS "Choferes select assigned orders" ON public.pedidos;
DROP POLICY IF EXISTS "Choferes select active orders" ON public.pedidos;

CREATE POLICY "Choferes select active orders" ON public.pedidos
FOR SELECT USING ( 
    EXISTS (SELECT 1 FROM choferes_habilitados WHERE user_id = auth.uid()::text) 
);
