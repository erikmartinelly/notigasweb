-- 052_fix_avisos_trigger_autor_column.sql
-- Corrige el trigger de sanitización en avisos para evitar acceder al campo inexistente 'autor'.

BEGIN;

-- 1. Redefinir sanitize_html de forma segura sin acceder a NEW.autor
CREATE OR REPLACE FUNCTION public.sanitize_html()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.titulo := LEFT(REGEXP_REPLACE(COALESCE(NEW.titulo, ''), '<[^>]*>', '', 'g'), 160);
  NEW.descripcion := LEFT(REGEXP_REPLACE(COALESCE(NEW.descripcion, ''), '<[^>]*>', '', 'g'), 2000);
  IF NEW.mensaje IS NOT NULL THEN
    NEW.mensaje := LEFT(REGEXP_REPLACE(NEW.mensaje, '<[^>]*>', '', 'g'), 2000);
  END IF;
  NEW.categoria := LEFT(REGEXP_REPLACE(COALESCE(NEW.categoria, 'AVISO VECINAL'), '<[^>]*>', '', 'g'), 80);
  RETURN NEW;
END;
$$;

-- 2. Eliminar triggers duplicados o conflictivos en la tabla avisos
DROP TRIGGER IF EXISTS trg_sanitize_avisos ON public.avisos;
CREATE TRIGGER trg_sanitize_avisos
BEFORE INSERT OR UPDATE ON public.avisos
FOR EACH ROW EXECUTE FUNCTION public.sanitize_html();

-- 3. Registrar migración
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('052', 'fix_avisos_trigger_autor_column')
ON CONFLICT (version) DO NOTHING;

COMMIT;
