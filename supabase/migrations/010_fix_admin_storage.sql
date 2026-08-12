-- ==========================================
-- 010_fix_admin_storage.sql
-- Corrección de Políticas de Almacenamiento y Admin
-- ==========================================

-- 1. Refactorizar is_admin_email para no usar strings quemados
CREATE OR REPLACE FUNCTION is_admin_email()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN exists (
    select 1 from admin_credentials 
    where email = auth.jwt() ->> 'email'
  );
END;
$$;

-- 2. Permitir a los administradores validar su propio acceso
DROP POLICY IF EXISTS "Admins select own record" ON admin_credentials;
CREATE POLICY "Admins select own record" ON admin_credentials
FOR SELECT USING ( email = auth.jwt() ->> 'email' );

-- 3. Corregir Políticas de Storage para 'anuncios-media'
-- Solo los administradores pueden insertar imágenes
DROP POLICY IF EXISTS "Insercion anuncios-media para auth" ON storage.objects;
CREATE POLICY "Insercion anuncios-media para admin"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'anuncios-media' AND public.is_admin_email() );

-- Solo los administradores pueden eliminar imágenes
DROP POLICY IF EXISTS "Eliminacion anuncios-media para auth" ON storage.objects;
CREATE POLICY "Eliminacion anuncios-media para admin"
ON storage.objects FOR DELETE
USING ( bucket_id = 'anuncios-media' AND public.is_admin_email() );
