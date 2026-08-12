-- 006_realtime.sql
-- CONFIGURACIÓN DE PUBLICACIONES EN TIEMPO REAL (WEBSOCKETS)

-- 6. HABILITAR REALTIME (Websockets para que el mapa se mueva en vivo)
-- Crear la publicación si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Añadir tablas a la publicación de forma segura
DO $$
DECLARE
    t text;
    tables_list text[] := ARRAY['pedidos', 'rutas_repartidores', 'avisos', 'comentarios_avisos', 'anuncios_globales'];
BEGIN
    FOREACH t IN ARRAY tables_list
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        END IF;
    END LOOP;
END $$;
