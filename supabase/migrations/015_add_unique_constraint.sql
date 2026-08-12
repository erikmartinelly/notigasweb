-- 015_add_unique_constraint.sql
-- Soluciona el error "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- forzando la creación del índice único en user_id si no existía por una creación previa incompleta de la tabla.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'choferes_habilitados_user_id_key'
    ) THEN
        ALTER TABLE public.choferes_habilitados ADD CONSTRAINT choferes_habilitados_user_id_key UNIQUE (user_id);
    END IF;
END $$;
