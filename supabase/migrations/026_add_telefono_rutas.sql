-- 026_add_telefono_rutas.sql
-- Agregar columna de teléfono a las rutas de repartidores para que los vecinos
-- puedan ver el contacto del chofer al presionar su camión en el mapa.

ALTER TABLE public.rutas_repartidores
ADD COLUMN IF NOT EXISTS telefono text;
