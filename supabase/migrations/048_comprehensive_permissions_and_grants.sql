-- 048_comprehensive_permissions_and_grants.sql
-- Concesión completa de permisos en esquema public, tablas, secuencias y funciones RPC para Supabase.

BEGIN;

-- 1. Permisos en el esquema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

-- 2. Permisos en todas las tablas existentes
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon;

-- 3. Permisos en todas las secuencias
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, authenticated, anon;

-- 4. Permisos por defecto para futuras tablas y secuencias
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role, authenticated, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres, service_role, authenticated;

-- 5. Asegurar permisos de ejecución en funciones RPC
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_crear_aviso_vecinal(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_agregar_comentario_aviso(uuid, text, text) TO authenticated;

-- 6. Habilitar RLS en todas las tablas sensibles para garantizar seguridad
ALTER TABLE IF EXISTS public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rutas_repartidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comentarios_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choferes_habilitados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.anuncios_globales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reportes_spam ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios_baneados ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.votos_registro ENABLE ROW LEVEL SECURITY;

COMMIT;
