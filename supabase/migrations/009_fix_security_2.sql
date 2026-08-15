-- 009_fix_security_2.sql
-- Parches de seguridad para admin_credentials, choferes_habilitados y privacidad de pedidos

-- 1. Habilitar RLS en admin_credentials
ALTER TABLE admin_credentials ENABLE ROW LEVEL SECURITY;

-- 3. Privacidad de tabla pedidos:
-- Primero revocamos el acceso público de SELECT en la tabla pedidos y la hacemos estricta
DROP POLICY IF EXISTS "Auth SELECT pedidos" ON pedidos;
DROP POLICY IF EXISTS "Dueño Driver Admin SELECT" ON pedidos;
CREATE POLICY "Dueño Driver Admin SELECT" ON pedidos FOR SELECT USING (
    auth.uid()::text = user_id OR auth.uid()::text = driver_id OR is_admin_email()
);

-- Creamos una vista pública que enmascara los datos sensibles para el feed y mapa.
-- Por defecto las vistas son security definer, así que saltarán la política anterior,
-- pero restringimos a nivel de columna aquí.
CREATE OR REPLACE VIEW pedidos_publicos AS
SELECT
    id,
    user_id,
    categoria,
    titulo,
    descripcion,
    cantidad,
    '***' as direccion,
    '***' as telefono,
    estado,
    driver_id,
    ciudad,
    barrio_otb,
    latitude,
    longitude,
    created_at
FROM pedidos;

-- Damos permiso explícito a los usuarios para consultar la vista
GRANT SELECT ON pedidos_publicos TO authenticated, anon;
