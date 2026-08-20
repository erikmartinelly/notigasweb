-- ==============================================================================
-- NOTIGAS - MIGRACIÓN 070: PERMISOS DE EJECUCIÓN PARA FUNCIONES RLS Y VISTAS
-- ==============================================================================

-- 1. Permitir ejecución de funciones requeridas por las vistas públicas y políticas RLS
GRANT EXECUTE ON FUNCTION public.is_current_enabled_driver(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_delivery_category(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_banned() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated, service_role;
