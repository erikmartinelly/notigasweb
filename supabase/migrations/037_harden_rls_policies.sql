-- 037_harden_rls_policies.sql
-- Eliminar políticas residuales públicas con permisos totales (INSERT/UPDATE/DELETE abiertos)

-- 1. usuarios_baneados: solo admins pueden insertar/actualizar/borrar
DROP POLICY IF EXISTS "Public INSERT" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Public UPDATE" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Public DELETE" ON public.usuarios_baneados;

-- 2. choferes_habilitados: solo el propio chofer o admin pueden modificar/borrar
DROP POLICY IF EXISTS "Public INSERT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Public UPDATE" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Public DELETE" ON public.choferes_habilitados;

DROP POLICY IF EXISTS "Insertar chofer" ON public.choferes_habilitados;
CREATE POLICY "Insertar chofer" ON public.choferes_habilitados
FOR INSERT WITH CHECK (
  (auth.uid())::text = user_id AND NOT is_banned()
);

-- 3. denuncias y reportes_spam: solo inserción de usuarios autenticados, modificación solo admin
DROP POLICY IF EXISTS "Public INSERT" ON public.denuncias;
DROP POLICY IF EXISTS "Public UPDATE" ON public.denuncias;
DROP POLICY IF EXISTS "Public DELETE" ON public.denuncias;

DROP POLICY IF EXISTS "Public INSERT" ON public.reportes_spam;
DROP POLICY IF EXISTS "Public UPDATE" ON public.reportes_spam;
DROP POLICY IF EXISTS "Public DELETE" ON public.reportes_spam;
