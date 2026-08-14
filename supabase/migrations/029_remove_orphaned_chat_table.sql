-- 029_remove_orphaned_chat_table.sql
-- Elimina la tabla huérfana de chat que ya no se utiliza en el frontend.
-- Resuelve el riesgo de seguridad por políticas de lectura pública en código legado.

DROP TABLE IF EXISTS public.mensajes_chat_privados CASCADE;
