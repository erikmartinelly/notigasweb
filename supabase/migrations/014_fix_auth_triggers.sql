-- 014_fix_auth_triggers.sql
-- VERSIÓN SEGURA: Solo elimina el trigger problemático exacto
-- que intentaba insertar perfiles en una tabla inexistente.

DO $$ 
BEGIN
    -- Eliminar específicamente el trigger on_auth_user_created 
    -- o el trigger de perfiles que suele causar fallos
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    DROP TRIGGER IF EXISTS tr_on_auth_user_created ON auth.users;
    DROP TRIGGER IF EXISTS trigger_create_profile ON auth.users;
    
    -- Eliminar la función huérfana asociada
    DROP FUNCTION IF EXISTS public.handle_new_user();
    DROP FUNCTION IF EXISTS public.create_profile_for_user();
    
    RAISE NOTICE 'Limpieza selectiva de triggers huérfanos completada con éxito.';
END $$;
