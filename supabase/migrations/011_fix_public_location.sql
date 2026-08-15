-- 011_fix_public_location.sql
-- REDONDEO DE COORDENADAS PARA LA VISTA PÚBLICA
-- Para proteger la ubicación exacta del domicilio del usuario, truncamos lat y long
-- a 3 decimales (aproximadamente 111 metros de margen de error).

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
    created_at
FROM pedidos;

-- Damos permiso explícito a los usuarios para consultar la vista
GRANT SELECT ON pedidos_publicos TO authenticated, anon;
