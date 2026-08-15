-- ==========================================
-- 009_fix_security_2.sql
-- Parches de seguridad para admin_credentials y lectura de pedidos
-- ==========================================

-- 1. Habilitar RLS en admin_credentials
ALTER TABLE admin_credentials ENABLE ROW LEVEL SECURITY;

-- 2. Asegurar política de lectura en pedidos para usuarios autenticados
DROP POLICY IF EXISTS "Auth SELECT pedidos" ON pedidos;
DROP POLICY IF EXISTS "Dueño Driver Admin SELECT" ON pedidos;
DROP POLICY IF EXISTS "Dueno Driver Admin SELECT" ON pedidos;

CREATE POLICY "Auth SELECT pedidos" ON pedidos FOR SELECT USING (
    auth.uid() IS NOT NULL
);

-- 3. Crear vista de pedidos para consultas públicas y mapas
CREATE OR REPLACE VIEW pedidos_publicos AS
SELECT
    id,
    user_id,
    categoria,
    titulo,
    descripcion,
    cantidad,
    direccion,
    telefono,
    estado,
    driver_id,
    ciudad,
    barrio_otb,
    latitude,
    longitude,
    created_at
FROM pedidos;

-- 4. Dar permiso explícito a los usuarios para consultar la vista
GRANT SELECT ON pedidos_publicos TO authenticated, anon;
