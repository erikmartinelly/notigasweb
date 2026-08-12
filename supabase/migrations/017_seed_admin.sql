-- 017_seed_admin.sql
-- Inserta un usuario administrador inicial en la tabla admin_credentials.
-- REEMPLAZA 'erikmartinelly@gmail.com' por tu correo electrónico de administrador.

DO $$
BEGIN
    -- Comprobamos si la tabla tiene una columna password_hash (por si se añadió manualmente)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'admin_credentials' 
          AND column_name = 'password_hash'
    ) THEN
        INSERT INTO public.admin_credentials (email, password_hash) 
        VALUES (LOWER('erikmartinelly@gmail.com'), 'dummy_hash_not_used')
        ON CONFLICT (email) DO NOTHING;
    ELSE
        INSERT INTO public.admin_credentials (email) 
        VALUES (LOWER('erikmartinelly@gmail.com'))
        ON CONFLICT (email) DO NOTHING;
    END IF;
END $$;

-- Aseguramos que la política RLS sea insensible a mayúsculas/minúsculas
DROP POLICY IF EXISTS "Admins select own record" ON admin_credentials;
CREATE POLICY "Admins select own record" ON admin_credentials
FOR SELECT USING ( LOWER(email) = LOWER(auth.jwt() ->> 'email') );
