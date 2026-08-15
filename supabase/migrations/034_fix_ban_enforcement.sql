-- 034_fix_ban_enforcement.sql
-- Corrige el sistema de baneo, que hoy está roto en 2 capas independientes:
--
-- 1) DATOS: usuarios_baneados solo tiene (id, user_id, motivo, created_at) según
--    003_community_tables.sql, pero admin_users.js / admin.js insertan también
--    email, nombre, placa, telefono. Si esas columnas no existen en la BD real,
--    el INSERT falla en silencio (las funciones JS no revisan el error) y el
--    admin cree que baneó a alguien cuando en realidad no se guardó nada.
--
-- 2) LÓGICA: is_banned() solo compara contra la columna user_id. banearUsuarioAdmin()
--    en admin.js ya guarda el email en su propia columna 'email' para bloqueos de
--    compradores, pero is_banned() nunca la consulta, así que esos baneos por email
--    tampoco bloquean nada a nivel de base de datos.
--
-- (El bug de banearRepartidorAdmin() guardando un ID equivocado se corrige en el
--  JS, ver admin_users.js / admin.js / events.js — este script solo prepara el
--  esquema y la función para que, una vez el JS mande el dato correcto, sí bloquee).

-- 1. Completar columnas que el frontend ya asume que existen (idempotente)
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS placa text;
ALTER TABLE public.usuarios_baneados ADD COLUMN IF NOT EXISTS telefono text;

-- Índice para que la verificación por email no dependa de un full scan
CREATE INDEX IF NOT EXISTS idx_usuarios_baneados_email ON public.usuarios_baneados (email);

-- 2. is_banned() ahora también verifica la columna email
CREATE OR REPLACE FUNCTION is_banned()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u_email text;
  u_id text;
BEGIN
  u_id := auth.uid()::text;
  u_email := auth.jwt() ->> 'email';

  RETURN EXISTS (
    SELECT 1 FROM usuarios_baneados
    WHERE user_id = u_id
       OR user_id = u_email
       OR email = u_email
  );
END;
$$;

-- 3. Cierra el hueco de privacidad: un chofer baneado ya NO puede leer la tabla
--    cruda 'pedidos' (dirección real, teléfono, coordenadas exactas), aunque su
--    fila en choferes_habilitados siga existiendo.
DROP POLICY IF EXISTS "Choferes select active orders" ON public.pedidos;
CREATE POLICY "Choferes select active orders" ON public.pedidos
FOR SELECT USING (
    EXISTS (SELECT 1 FROM choferes_habilitados WHERE user_id = auth.uid()::text)
    AND NOT is_banned()
);
