-- ============================================================================
-- MIGRACIÓN 061: OPTIMIZACIÓN DE RENDIMIENTO RLS E ÍNDICES CUBRIENTES
-- ============================================================================

-- 1. PROFILES RLS OPTIMIZATION (Fix auth_rls_initplan & Multiple Permissive Policies)
DROP POLICY IF EXISTS "Profiles User ALL" ON public.profiles;
DROP POLICY IF EXISTS "Profiles User SELECT" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete own or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select own or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own or admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles 
  FOR SELECT TO authenticated 
  USING ((SELECT auth.uid()) = id OR is_admin_email());

CREATE POLICY "profiles_insert" ON public.profiles 
  FOR INSERT TO authenticated 
  WITH CHECK ((SELECT auth.uid()) = id AND NOT is_banned());

CREATE POLICY "profiles_update" ON public.profiles 
  FOR UPDATE TO authenticated 
  USING ((SELECT auth.uid()) = id OR is_admin_email())
  WITH CHECK ((SELECT auth.uid()) = id OR is_admin_email());

CREATE POLICY "profiles_delete" ON public.profiles 
  FOR DELETE TO authenticated 
  USING ((SELECT auth.uid()) = id OR is_admin_email());

-- 2. PEDIDOS RLS OPTIMIZATION
DROP POLICY IF EXISTS "Insertar propio" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Insertar propio" ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos Dueño Driver Admin SELECT" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos_select" ON public.pedidos;

CREATE POLICY "pedidos_insert" ON public.pedidos 
  FOR INSERT TO authenticated 
  WITH CHECK ((SELECT auth.uid())::text = user_id AND NOT is_banned());

CREATE POLICY "pedidos_select" ON public.pedidos 
  FOR SELECT TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR (SELECT auth.uid())::text = driver_id OR is_admin_email());

-- 3. CHOFERES_HABILITADOS RLS OPTIMIZATION
DROP POLICY IF EXISTS "Choferes Own Admin SELECT" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Insertar propio" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Actualizar propio o Admin" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "Choferes Borrar propio o Admin" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "choferes_select" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "choferes_insert" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "choferes_update" ON public.choferes_habilitados;
DROP POLICY IF EXISTS "choferes_delete" ON public.choferes_habilitados;

CREATE POLICY "choferes_select" ON public.choferes_habilitados 
  FOR SELECT TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email());

CREATE POLICY "choferes_insert" ON public.choferes_habilitados 
  FOR INSERT TO authenticated 
  WITH CHECK ((SELECT auth.uid())::text = user_id AND NOT is_banned());

CREATE POLICY "choferes_update" ON public.choferes_habilitados 
  FOR UPDATE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email())
  WITH CHECK ((SELECT auth.uid())::text = user_id OR is_admin_email());

CREATE POLICY "choferes_delete" ON public.choferes_habilitados 
  FOR DELETE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email());

-- 4. AVISOS & COMENTARIOS RLS OPTIMIZATION
DROP POLICY IF EXISTS "Avisos User Update" ON public.avisos;
DROP POLICY IF EXISTS "Actualizar propio o Admin" ON public.avisos;
DROP POLICY IF EXISTS "Avisos User Insert" ON public.avisos;
DROP POLICY IF EXISTS "Borrar propio o Admin" ON public.avisos;
DROP POLICY IF EXISTS "avisos_insert" ON public.avisos;
DROP POLICY IF EXISTS "avisos_update" ON public.avisos;
DROP POLICY IF EXISTS "avisos_delete" ON public.avisos;

CREATE POLICY "avisos_insert" ON public.avisos 
  FOR INSERT TO authenticated 
  WITH CHECK ((SELECT auth.uid())::text = user_id AND NOT is_banned());

CREATE POLICY "avisos_update" ON public.avisos 
  FOR UPDATE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email())
  WITH CHECK ((SELECT auth.uid())::text = user_id OR is_admin_email());

CREATE POLICY "avisos_delete" ON public.avisos 
  FOR DELETE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email());

DROP POLICY IF EXISTS "Insertar propio" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "Actualizar propio o Admin" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "Borrar propio o Admin" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "comentarios_insert" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "comentarios_update" ON public.comentarios_avisos;
DROP POLICY IF EXISTS "comentarios_delete" ON public.comentarios_avisos;

CREATE POLICY "comentarios_insert" ON public.comentarios_avisos 
  FOR INSERT TO authenticated 
  WITH CHECK ((SELECT auth.uid())::text = user_id AND NOT is_banned());

CREATE POLICY "comentarios_update" ON public.comentarios_avisos 
  FOR UPDATE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email())
  WITH CHECK ((SELECT auth.uid())::text = user_id OR is_admin_email());

CREATE POLICY "comentarios_delete" ON public.comentarios_avisos 
  FOR DELETE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id OR is_admin_email());

-- 5. VOTOS_REGISTRO RLS OPTIMIZATION
DROP POLICY IF EXISTS "Auth SELECT votos_registro" ON public.votos_registro;
DROP POLICY IF EXISTS "Auth INSERT votos_registro" ON public.votos_registro;
DROP POLICY IF EXISTS "Auth DELETE votos_registro" ON public.votos_registro;
DROP POLICY IF EXISTS "votos_select" ON public.votos_registro;
DROP POLICY IF EXISTS "votos_insert" ON public.votos_registro;
DROP POLICY IF EXISTS "votos_delete" ON public.votos_registro;

CREATE POLICY "votos_select" ON public.votos_registro 
  FOR SELECT TO authenticated 
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY "votos_insert" ON public.votos_registro 
  FOR INSERT TO authenticated 
  WITH CHECK ((SELECT auth.uid())::text = user_id AND NOT is_banned());

CREATE POLICY "votos_delete" ON public.votos_registro 
  FOR DELETE TO authenticated 
  USING ((SELECT auth.uid())::text = user_id);

-- 6. ANUNCIOS & PUBLICIDAD ADMIN
DROP POLICY IF EXISTS "Admin Control Total Anuncios" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_admin" ON public.anuncios_nativos_sistema;

CREATE POLICY "anuncios_nativos_admin" ON public.anuncios_nativos_sistema 
  FOR ALL TO authenticated 
  USING (is_admin_email()) 
  WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "Publicidad Admin ALL" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "publicidad_admin" ON public.configuracion_publicidad;

CREATE POLICY "publicidad_admin" ON public.configuracion_publicidad 
  FOR ALL TO authenticated 
  USING (is_admin_email()) 
  WITH CHECK (is_admin_email());

-- 7. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_comentarios_avisos_aviso_id ON public.comentarios_avisos (aviso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_choferes_habilitados_user_id ON public.choferes_habilitados (user_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_user_estado ON public.pedidos (user_id, estado);
