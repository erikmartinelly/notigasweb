-- 030_auto_purge_cron.sql
-- Implementación de purga automática de datos caducados usando pg_cron

-- 1. Habilitar la extensión pg_cron (Supabase la incluye por defecto, pero por si acaso)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Crear función de purga (se ejecuta como admin para saltar RLS)
CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Eliminar pedidos mayores a 24 horas
    DELETE FROM public.pedidos 
    WHERE created_at < NOW() - INTERVAL '48 hours';

    -- Eliminar avisos del foro mayores a 24 horas
    DELETE FROM public.avisos 
    WHERE created_at < NOW() - INTERVAL '72 hours';

    -- Opcional: Eliminar clústeres de demanda vacíos si fuera necesario
    -- Pero se limpian solos o pierden relevancia
END;
$$;

-- 3. Programar el cron job para que corre cada hora
-- Se revoca si ya existía para asegurar idempotencia (ignorando error si no existe)
DO $$
BEGIN
    PERFORM cron.unschedule('purge_old_records_job');
EXCEPTION WHEN OTHERS THEN
    -- Ignorar el error si el job no existía
END $$;

SELECT cron.schedule(
    'purge_old_records_job', -- nombre del job
    '0 * * * *',             -- expresión cron: cada hora, en el minuto 0
    $$SELECT public.purge_old_records()$$
);
