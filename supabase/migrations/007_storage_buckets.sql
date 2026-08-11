-- ==========================================
-- 007_storage_buckets.sql
-- Creación de buckets de almacenamiento y políticas
-- ==========================================

-- Crear el bucket 'anuncios-media' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('anuncios-media', 'anuncios-media', true)
ON CONFLICT (id) DO NOTHING;

-- Política: Acceso público de lectura
CREATE POLICY "Lectura publica anuncios-media"
ON storage.objects FOR SELECT
USING ( bucket_id = 'anuncios-media' );

-- Política: Inserción para usuarios autenticados
CREATE POLICY "Insercion anuncios-media para auth"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'anuncios-media' AND auth.role() = 'authenticated' );

-- Política: Eliminación para administradores u dueños (simplificado a auth por ahora para la OTB)
CREATE POLICY "Eliminacion anuncios-media para auth"
ON storage.objects FOR DELETE
USING ( bucket_id = 'anuncios-media' AND auth.role() = 'authenticated' );
