-- 022_choferes_publicos_view.sql
-- Crea una vista pública para los choferes y revoca el acceso directo a la tabla.

-- 1. Eliminar acceso irrestricto de la tabla real
DROP POLICY IF EXISTS "Public SELECT choferes" ON public.choferes_habilitados;

-- 2. Asegurarse que solo dueños o admins la ven
CREATE POLICY "Auth SELECT choferes" ON public.choferes_habilitados 
FOR SELECT USING (
    auth.uid()::text = user_id OR is_admin_email()
);

-- 3. Crear vista pública filtrando datos no públicos
CREATE OR REPLACE VIEW public.choferes_publicos AS
SELECT 
    id, 
    user_id, 
    nombre_completo, 
    categoria, 
    ciudad, 
    zonas, 
    schedule, 
    placa, 
    productos
FROM public.choferes_habilitados ch
WHERE NOT EXISTS (SELECT 1 FROM public.usuarios_baneados WHERE user_id = ch.user_id);

-- 4. Dar acceso a la vista a todo el mundo
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;
