-- 065_security_and_performance_advisors_hardening.sql
-- Optimización integral de RLS, vistas con security_invoker y consolidación de políticas permisivas.

BEGIN;

-- =====================================================================
-- 1. VISTAS PÚBLICAS CON SECURITY INVOKER (Postgres 15+)
-- =====================================================================

DROP VIEW IF EXISTS public.choferes_publicos CASCADE;
CREATE VIEW public.choferes_publicos WITH (security_invoker = true) AS
SELECT 
    ch.id, 
    ch.user_id, 
    ch.nombre_completo, 
    ch.categoria, 
    ch.ciudad, 
    ch.schedule, 
    ch.placa, 
    ch.productos,
    ch.telefono_whatsapp AS telefono,
    NULL::text AS descripcion,
    NULL::text AS foto_url,
    ch.estado_verificacion,
    ch.created_at
FROM public.choferes_habilitados ch
WHERE NOT EXISTS (
    SELECT 1 FROM public.usuarios_baneados ub WHERE ub.user_id = ch.user_id
);

GRANT SELECT ON public.choferes_publicos TO anon, authenticated;

DROP VIEW IF EXISTS public.rutas_repartidores_publicas CASCADE;
CREATE VIEW public.rutas_repartidores_publicas WITH (security_invoker = true) AS
SELECT
    r.id,
    CASE
        WHEN r.user_id = (SELECT auth.uid())::text THEN r.user_id
        ELSE NULL::text
    END AS user_id,
    COALESCE(r.distribuidor_nombre, ch.nombre_completo, 'Repartidor NOTIGAS') AS distribuidor_nombre,
    COALESCE(r.categoria, ch.categoria, 'Gas GLP') AS categoria,
    COALESCE(r.titulo, 'En ruta de distribución') AS titulo,
    r.ciudad,
    r.latitude,
    r.longitude,
    COALESCE(r.garrafas_agotadas, false) AS garrafas_agotadas,
    r.last_active,
    COALESCE(NULLIF(TRIM(r.telefono), ''), NULLIF(TRIM(ch.telefono_whatsapp), '')) AS telefono,
    ch.placa,
    ch.productos
FROM public.rutas_repartidores r
JOIN public.choferes_habilitados ch ON ch.user_id = r.user_id
WHERE r.last_active >= (now() - interval '10 minutes')
  AND LOWER(TRIM(COALESCE(ch.estado_verificacion, ''))) = 'aprobado'
  AND NOT EXISTS (
      SELECT 1
      FROM public.usuarios_baneados ub
      WHERE ub.user_id = r.user_id
  );

GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;
CREATE VIEW public.pedidos_publicos WITH (security_invoker = true) AS
SELECT
    p.id,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text THEN p.user_id
        ELSE NULL::text
    END AS user_id,
    p.categoria,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    p.cantidad,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.direccion
        ELSE NULL::text
    END AS direccion,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.telefono
        ELSE NULL::text
    END AS telefono,
    p.estado,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR p.driver_id = (SELECT auth.uid())::text THEN p.driver_id
        ELSE NULL::text
    END AS driver_id,
    p.ciudad,
    COALESCE(p.barrio_otb, 'Zona indicada en el mapa') AS barrio_otb,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.latitude
        ELSE round(p.latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.longitude
        ELSE round(p.longitude::numeric, 3)::double precision
    END AS longitude,
    CASE
        WHEN p.user_id = (SELECT auth.uid())::text OR public.is_current_enabled_driver(p.ciudad, NULL) THEN p.descripcion
        ELSE NULL::text
    END AS descripcion,
    COALESCE(p.visto, false) AS visto,
    p.created_at
FROM public.pedidos p
WHERE p.estado IN ('pendiente', 'visto');

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;

-- =====================================================================
-- 2. OPTIMIZACIÓN DE PLANES RLS (auth_rls_initplan) Y CONSOLIDACIÓN
-- =====================================================================

-- Admin Credentials
DROP POLICY IF EXISTS "admin_credentials_select_own" ON public.admin_credentials;
DROP POLICY IF EXISTS "Admin Credentials SELECT" ON public.admin_credentials;
CREATE POLICY "admin_credentials_select_own" ON public.admin_credentials
FOR SELECT TO anon, authenticated
USING (
    LOWER(TRIM(email)) = LOWER(TRIM(COALESCE(((SELECT auth.jwt()) ->> 'email'), '')))
);

-- Usuarios Roles (Consolidar en 1 política por acción)
DROP POLICY IF EXISTS "usuarios_roles_admin_all" ON public.usuarios_roles;
DROP POLICY IF EXISTS "usuarios_roles_admin_mod" ON public.usuarios_roles;
DROP POLICY IF EXISTS "usuarios_roles_select_public" ON public.usuarios_roles;
DROP POLICY IF EXISTS "usuarios_roles_select" ON public.usuarios_roles;
DROP POLICY IF EXISTS "usuarios_roles_insert" ON public.usuarios_roles;
DROP POLICY IF EXISTS "usuarios_roles_update" ON public.usuarios_roles;
DROP POLICY IF EXISTS "usuarios_roles_delete" ON public.usuarios_roles;

CREATE POLICY "usuarios_roles_select" ON public.usuarios_roles
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "usuarios_roles_insert" ON public.usuarios_roles
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_email());

CREATE POLICY "usuarios_roles_update" ON public.usuarios_roles
FOR UPDATE TO authenticated
USING (public.is_admin_email())
WITH CHECK (public.is_admin_email());

CREATE POLICY "usuarios_roles_delete" ON public.usuarios_roles
FOR DELETE TO authenticated
USING (public.is_admin_email());

-- Denuncias (Consolidar políticas permisivas redundantes)
DROP POLICY IF EXISTS "denuncias_admin_all" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_admin_mod" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_insert_auth" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_select" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_insert" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_update" ON public.denuncias;
DROP POLICY IF EXISTS "denuncias_delete" ON public.denuncias;

CREATE POLICY "denuncias_select" ON public.denuncias
FOR SELECT TO authenticated
USING (public.is_admin_email());

CREATE POLICY "denuncias_insert" ON public.denuncias
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "denuncias_update" ON public.denuncias
FOR UPDATE TO authenticated
USING (public.is_admin_email())
WITH CHECK (public.is_admin_email());

CREATE POLICY "denuncias_delete" ON public.denuncias
FOR DELETE TO authenticated
USING (public.is_admin_email());

-- Reportes Spam (Consolidar políticas permisivas redundantes)
DROP POLICY IF EXISTS "reportes_spam_admin_all" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_admin_mod" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_insert_auth" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_select" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_insert" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_update" ON public.reportes_spam;
DROP POLICY IF EXISTS "reportes_spam_delete" ON public.reportes_spam;

CREATE POLICY "reportes_spam_select" ON public.reportes_spam
FOR SELECT TO authenticated
USING (public.is_admin_email());

CREATE POLICY "reportes_spam_insert" ON public.reportes_spam
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "reportes_spam_update" ON public.reportes_spam
FOR UPDATE TO authenticated
USING (public.is_admin_email())
WITH CHECK (public.is_admin_email());

CREATE POLICY "reportes_spam_delete" ON public.reportes_spam
FOR DELETE TO authenticated
USING (public.is_admin_email());

-- Anuncios Nativos Sistema
DROP POLICY IF EXISTS "anuncios_nativos_admin_mod" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_select_public" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_select" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_insert" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_update" ON public.anuncios_nativos_sistema;
DROP POLICY IF EXISTS "anuncios_nativos_delete" ON public.anuncios_nativos_sistema;

CREATE POLICY "anuncios_nativos_select" ON public.anuncios_nativos_sistema
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "anuncios_nativos_insert" ON public.anuncios_nativos_sistema
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_email());

CREATE POLICY "anuncios_nativos_update" ON public.anuncios_nativos_sistema
FOR UPDATE TO authenticated
USING (public.is_admin_email())
WITH CHECK (public.is_admin_email());

CREATE POLICY "anuncios_nativos_delete" ON public.anuncios_nativos_sistema
FOR DELETE TO authenticated
USING (public.is_admin_email());

-- Configuración Publicidad
DROP POLICY IF EXISTS "config_publicidad_admin_mod" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_select_public" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_select" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_insert" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_update" ON public.configuracion_publicidad;
DROP POLICY IF EXISTS "config_publicidad_delete" ON public.configuracion_publicidad;

CREATE POLICY "config_publicidad_select" ON public.configuracion_publicidad
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "config_publicidad_insert" ON public.configuracion_publicidad
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_email());

CREATE POLICY "config_publicidad_update" ON public.configuracion_publicidad
FOR UPDATE TO authenticated
USING (public.is_admin_email())
WITH CHECK (public.is_admin_email());

CREATE POLICY "config_publicidad_delete" ON public.configuracion_publicidad
FOR DELETE TO authenticated
USING (public.is_admin_email());

-- =====================================================================
-- 3. SEARCH_PATH SEGURO EN FUNCIONES PERSONALIZADAS
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin_email' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.is_admin_email() SET search_path = public, pg_temp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_banned' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.is_banned() SET search_path = public, pg_temp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_user_account' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.delete_user_account() SET search_path = public, pg_temp;
    END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('065', 'security_and_performance_advisors_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
