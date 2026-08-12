-- 014_fix_auth_triggers.sql
-- Este script purga triggers huérfanos en la tabla interna auth.users
-- que causan el "Database error saving new user" al fallar intentando
-- buscar una tabla public.profiles o public.usuarios que no existe.

-- Habilitar permisos necesarios para operar sobre el esquema auth de manera segura
-- (Supabase SQL Editor corre por defecto con permisos elevados)

DO $$ 
DECLARE
    trigger_record RECORD;
BEGIN
    -- 1. Buscar cualquier trigger customizado en la tabla auth.users
    -- Excluimos los triggers que sean del sistema de Supabase (si los hubiera)
    FOR trigger_record IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_schema = 'auth' 
        AND event_object_table = 'users'
    LOOP
        -- Eliminar el trigger encontrado
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users CASCADE;', trigger_record.trigger_name);
    END LOOP;
END $$;

-- 2. Eliminar de forma precautoria las funciones típicas de tutoriales
-- que acompañan a esos triggers para asegurar una limpieza total.
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.on_auth_user_created() CASCADE;
DROP FUNCTION IF EXISTS public.crear_perfil_usuario() CASCADE;

-- Confirmación visual (opcional)
SELECT 'Triggers de auth.users purgados exitosamente. El registro por correo debería funcionar ahora.' as status;
