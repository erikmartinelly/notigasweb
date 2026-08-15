-- 024_unmask_data.sql
-- Por solicitud, se elimina el enmascaramiento de los datos del comprador
-- para que los repartidores puedan ver la ubicación exacta y el teléfono de contacto.

DROP VIEW IF EXISTS pedidos_publicos CASCADE;

CREATE OR REPLACE VIEW pedidos_publicos AS
SELECT
    id,
    user_id,
    categoria,
    titulo,
    cantidad,
    direccion,
    telefono,
    estado,
    driver_id,
    ciudad,
    barrio_otb,
    latitude,
    longitude,
    descripcion,
    created_at
FROM pedidos;

GRANT SELECT ON pedidos_publicos TO authenticated, anon;
