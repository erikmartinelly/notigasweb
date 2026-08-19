-- ============================================================================
-- MIGRACIÓN 064: OPTIMIZACIÓN INTEGRAL DE POLÍTICAS RLS & RENDIMIENTO
-- ============================================================================

-- 1. Optimizar public.rutas_repartidores
-- Eliminar política SELECT redundante que causaba evaluación doble en cada fila
DROP POLICY IF EXISTS "Rutas Own Admin SELECT" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Public SELECT" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Insertar propio" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Actualizar propio o Admin" ON public.rutas_repartidores;
DROP POLICY IF EXISTS "Borrar propio o Admin" ON public.rutas_repartidores;

CREATE POLICY "rutas_select_public" ON public.rutas_repartidores
  FOR SELECT TO public
  USING (true);

CREATE POLICY "rutas_insert_own" ON public.rutas_repartidores
  FOR INSERT TO public
  WITH CHECK (
    (((SELECT auth.uid())::text = user_id) AND (NOT is_banned()))
  );

CREATE POLICY "rutas_update_own_or_admin" ON public.rutas_repartidores
  FOR UPDATE TO public
  USING (
    (((SELECT auth.uid())::text = user_id) OR is_admin_email())
  )
  WITH CHECK (
    (((SELECT auth.uid())::text = user_id) OR is_admin_email())
  );

CREATE POLICY "rutas_delete_own_or_admin" ON public.rutas_repartidores
  FOR DELETE TO public
  USING (
    (((SELECT auth.uid())::text = user_id) OR is_admin_email())
  );

-- 2. Optimizar public.usuarios_roles
DROP POLICY IF EXISTS "Admin Control Total Roles" ON public.usuarios_roles;
DROP POLICY IF EXISTS "Lectura publica usuarios_roles" ON public.usuarios_roles;

CREATE POLICY "usuarios_roles_select_public" ON public.usuarios_roles
  FOR SELECT TO public
  USING (true);

CREATE POLICY "usuarios_roles_admin_all" ON public.usuarios_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_roles u
      WHERE u.email = (SELECT (auth.jwt() ->> 'email'))
        AND u.rol = 'administrador'
        AND u.baneado = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios_roles u
      WHERE u.email = (SELECT (auth.jwt() ->> 'email'))
        AND u.rol = 'administrador'
        AND u.baneado = false
    )
  );

-- 3. Optimizar public.denuncias
DROP POLICY IF EXISTS "Denuncias Admin ALL" ON public.denuncias;
DROP POLICY IF EXISTS "Denuncias Insertar auth" ON public.denuncias;

CREATE POLICY "denuncias_insert_auth" ON public.denuncias
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "denuncias_admin_all" ON public.denuncias
  FOR ALL TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

-- 4. Optimizar public.reportes_spam
DROP POLICY IF EXISTS "Reportes Admin ALL" ON public.reportes_spam;
DROP POLICY IF EXISTS "Reportes Insertar auth" ON public.reportes_spam;

CREATE POLICY "reportes_spam_insert_auth" ON public.reportes_spam
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "reportes_spam_admin_all" ON public.reportes_spam
  FOR ALL TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

-- 5. Optimizar public.anuncios_nativos_sistema & configuracion_publicidad
DROP POLICY IF EXISTS "Lectura publica anuncios" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_admin" ON public.anuncios_nativos_sistema;

CREATE POLICY "anuncios_nativos_select_public" ON public.anuncios_nativos_sistema
  FOR SELECT TO public
  USING (true);

CREATE POLICY "anuncios_nativos_admin_mod" ON public.anuncios_nativos_sistema
  FOR ALL TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

DROP POLICY IF EXISTS "Publicidad Public SELECT" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "publicidad_admin" ON public.configuracion_publicidad;

CREATE POLICY "config_publicidad_select_public" ON public.configuracion_publicidad
  FOR SELECT TO public
  USING (true);

CREATE POLICY "config_publicidad_admin_mod" ON public.configuracion_publicidad
  FOR ALL TO authenticated
  USING (is_admin_email())
  WITH CHECK (is_admin_email());

-- 6. Optimizar public.admin_credentials
DROP POLICY IF EXISTS "Admins select own record" ON public.admin_credentials;

CREATE POLICY "admin_credentials_select_own" ON public.admin_credentials
  FOR SELECT TO public
  USING (
    lower(TRIM(email)) = lower(TRIM(COALESCE((SELECT (auth.jwt() ->> 'email')), '')))
  );
