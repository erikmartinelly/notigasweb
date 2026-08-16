-- ==============================================================================
-- 037_harden_rls_policies.sql
-- Eliminación exhaustiva de políticas residuales inseguras y permisos abiertos en RLS
-- ==============================================================================

-- 1. TABLA: pedidos
-- Eliminar políticas inseguras y duplicadas
DROP POLICY IF EXISTS "Borrar cualquier autenticado" ON public.pedidos;
DROP POLICY IF EXISTS "Public SELECT" ON public.pedidos;
DROP POLICY IF EXISTS "Auth SELECT pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Actualizar propio" ON public.pedidos;
DROP POLICY IF EXISTS "Users can delete own orders" ON public.pedidos;
DROP POLICY IF EXISTS "Borrar pedido seguro" ON public.pedidos;
DROP POLICY IF EXISTS "Actualizar propio o Admin o Repartidor" ON public.pedidos;
DROP POLICY IF EXISTS "Choferes select active orders" ON public.pedidos;
DROP POLICY IF EXISTS "Dueño Driver Admin SELECT" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Dueño Driver Admin SELECT" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Insertar propio" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Actualizar propio o asignado" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Borrar propio o admin" ON public.pedidos;

-- Recrear políticas estrictas para pedidos
CREATE POLICY "Pedidos Dueño Driver Admin SELECT" ON public.pedidos
FOR SELECT USING (
    (auth.uid())::text = user_id 
    OR (auth.uid())::text = driver_id 
    OR is_admin_email()
);

CREATE POLICY "Pedidos Insertar propio" ON public.pedidos
FOR INSERT WITH CHECK (
    (auth.uid())::text = user_id 
    AND NOT is_banned()
);

CREATE POLICY "Pedidos Actualizar propio o asignado" ON public.pedidos
FOR UPDATE USING (
    (auth.uid())::text = user_id 
    OR (auth.uid())::text = driver_id 
    OR is_admin_email()
);

CREATE POLICY "Pedidos Borrar propio o admin" ON public.pedidos
FOR DELETE USING (
    (auth.uid())::text = user_id 
    OR is_admin_email()
);

-- 2. TABLA: usuarios_baneados
DROP POLICY IF EXISTS "Public SELECT" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Public INSERT" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Public UPDATE" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Public DELETE" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Auth SELECT baneados" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Admin INSERT baneados" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Admin UPDATE baneados" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Admin DELETE baneados" ON public.usuarios_baneados;
DROP POLICY IF EXISTS "Baneados Admin ALL" ON public.usuarios_baneados;

CREATE POLICY "Baneados Admin ALL" ON public.usuarios_baneados
FOR ALL USING (is_admin_email());

-- 3. TABLA: choferes_habilitados
DROP POLICY IF EXISTS "Public INSERT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Public UPDATE" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Public DELETE" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Public SELECT choferes" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Public SELECT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Auth SELECT choferes" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Insertar chofer" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Actualizar propio o Admin" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Borrar propio o Admin" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Public SELECT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Insertar propio" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Actualizar propio o Admin" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Borrar propio o Admin" ON public.choferes_habilitados;

CREATE POLICY "Choferes Public SELECT" ON public.choferes_habilitados
FOR SELECT USING (true);

CREATE POLICY "Choferes Insertar propio" ON public.choferes_habilitados
FOR INSERT WITH CHECK (
    (auth.uid())::text = user_id 
    AND NOT is_banned()
);

CREATE POLICY "Choferes Actualizar propio o Admin" ON public.choferes_habilitados
FOR UPDATE USING (
    (auth.uid())::text = user_id 
    OR is_admin_email()
);

CREATE POLICY "Choferes Borrar propio o Admin" ON public.choferes_habilitados
FOR DELETE USING (
    (auth.uid())::text = user_id 
    OR is_admin_email()
);

-- 4. TABLAS: denuncias y reportes_spam
DROP POLICY IF EXISTS "Public SELECT" ON public.denuncias;
DROP POLICY IF EXISTS "Public INSERT" ON public.denuncias;
DROP POLICY IF EXISTS "Public UPDATE" ON public.denuncias;
DROP POLICY IF EXISTS "Public DELETE" ON public.denuncias;
DROP POLICY IF EXISTS "Auth SELECT denuncias" ON public.denuncias;
DROP POLICY IF EXISTS "Insertar denuncia" ON public.denuncias;
DROP POLICY IF EXISTS "Admin UPDATE denuncias" ON public.denuncias;
DROP POLICY IF EXISTS "Admin DELETE denuncias" ON public.denuncias;
DROP POLICY IF EXISTS "Denuncias Insertar auth" ON public.denuncias;
DROP POLICY IF EXISTS "Denuncias Admin ALL" ON public.denuncias;

CREATE POLICY "Denuncias Insertar auth" ON public.denuncias
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Denuncias Admin ALL" ON public.denuncias
FOR ALL USING (is_admin_email());

DROP POLICY IF EXISTS "Public SELECT" ON public.reportes_spam;
DROP POLICY IF EXISTS "Public INSERT" ON public.reportes_spam;
DROP POLICY IF EXISTS "Public UPDATE" ON public.reportes_spam;
DROP POLICY IF EXISTS "Public DELETE" ON public.reportes_spam;
DROP POLICY IF EXISTS "Auth SELECT reportes" ON public.reportes_spam;
DROP POLICY IF EXISTS "Insertar spam" ON public.reportes_spam;
DROP POLICY IF EXISTS "Admin UPDATE reportes" ON public.reportes_spam;
DROP POLICY IF EXISTS "Admin DELETE reportes" ON public.reportes_spam;
DROP POLICY IF EXISTS "Reportes Insertar auth" ON public.reportes_spam;
DROP POLICY IF EXISTS "Reportes Admin ALL" ON public.reportes_spam;

CREATE POLICY "Reportes Insertar auth" ON public.reportes_spam
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Reportes Admin ALL" ON public.reportes_spam
FOR ALL USING (is_admin_email());

-- 5. TABLAS: avisos y comentarios_avisos (limpiar políticas duplicadas)
DROP POLICY IF EXISTS "Actualizar propio" ON public.avisos;
DROP POLICY IF EXISTS "Borrar propio" ON public.avisos;
DROP POLICY IF EXISTS "Auth SELECT avisos" ON public.avisos;

DROP POLICY IF EXISTS "Actualizar propio" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "Borrar propio" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "Auth SELECT comentarios" ON public.comentarios_avisos;

-- 6. TABLA: rutas_repartidores (limpiar políticas duplicadas)
DROP POLICY IF EXISTS "Actualizar propio" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Borrar propio" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Auth SELECT rutas" ON public.rutas_repartidores;
