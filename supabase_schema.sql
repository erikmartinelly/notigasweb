-- ─────────────────────────────────────────────────────────────
-- NOTIGAS - Script de Base de Datos Supabase (PostgreSQL) Seguro
-- Copia y pega todo este script en el SQL Editor de tu Dashboard
-- ─────────────────────────────────────────────────────────────

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Perfiles vinculada a Supabase Auth
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role VARCHAR(30) DEFAULT 'comprador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS en perfiles
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura pública de perfiles" ON public.perfiles FOR SELECT USING (true);
CREATE POLICY "Actualización propia de perfiles" ON public.perfiles FOR UPDATE USING (auth.uid() = id);

-- Trigger para crear perfil automáticamente al registrarse en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Tabla de Publicaciones (Pedidos, Avisos, Rutas, etc.)
CREATE TABLE IF NOT EXISTS public.publicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL, 
    categoria VARCHAR(50) NOT NULL, 
    titulo TEXT NOT NULL,
    descripcion TEXT,
    ciudad VARCHAR(100) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    user_email TEXT NOT NULL,
    user_role VARCHAR(30) NOT NULL,
    user_id UUID REFERENCES auth.users(id), -- Vinculado a Supabase Auth
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    distribuidor_nombre TEXT,
    distribuidor_ci TEXT,
    horario_recorrido TEXT,
    puntos_trazo_ruta JSONB, 
    garrafas_agotadas BOOLEAN DEFAULT FALSE,
    votos INT DEFAULT 0,
    comentarios JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexar por expiración y ciudad
CREATE INDEX IF NOT EXISTS idx_publicaciones_ciudad_otb ON public.publicaciones (ciudad, barrio_otb);
CREATE INDEX IF NOT EXISTS idx_publicaciones_created_at ON public.publicaciones (created_at);

-- 4. Tabla de Mensajes Privados
CREATE TABLE IF NOT EXISTS public.mensajes_chat_privados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria_servicio VARCHAR(50) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    autor_email TEXT NOT NULL,
    autor_role VARCHAR(30) NOT NULL,
    autor_id UUID REFERENCES auth.users(id),
    alias_protegido TEXT NOT NULL,
    texto TEXT NOT NULL,
    denunciado BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_categoria_otb ON public.mensajes_chat_privados (categoria_servicio, barrio_otb);

-- 5. Tabla de Choferes
CREATE TABLE IF NOT EXISTS public.choferes_habilitados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    nombre_completo TEXT NOT NULL,
    ci_carnet TEXT UNIQUE NOT NULL,
    telefono_whatsapp TEXT,
    estado_verificacion VARCHAR(30) DEFAULT 'aprobado',
    placa TEXT,
    categoria TEXT,
    productos TEXT,
    zonas TEXT,
    schedule TEXT,
    ciudad TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Denuncias y Moderación
CREATE TABLE IF NOT EXISTS public.denuncias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    tipo VARCHAR(50) NOT NULL,
    detalles TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usuarios_baneados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identificador TEXT NOT NULL,
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reportes_spam (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    texto TEXT,
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.publicaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat_privados;

-- =========================================================================
-- 8. POLÍTICAS RLS ESTRICTAS (Validación con JWT de Supabase Auth)
-- =========================================================================
ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat_privados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes_habilitados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_baneados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_spam ENABLE ROW LEVEL SECURITY;

-- Función auxiliar para verificar baneos
CREATE OR REPLACE FUNCTION auth.is_banned() RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.usuarios_baneados 
    WHERE identificador = auth.jwt()->>'email'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Publicaciones
DROP POLICY IF EXISTS "Permitir lectura publica de publicaciones" ON public.publicaciones;
CREATE POLICY "Lectura publica de publicaciones" ON public.publicaciones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica de publicaciones" ON public.publicaciones;
CREATE POLICY "Inserción solo autenticados y no baneados" ON public.publicaciones 
FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT auth.is_banned());

DROP POLICY IF EXISTS "Permitir actualizacion publica de publicaciones" ON public.publicaciones;
CREATE POLICY "Actualización solo dueño" ON public.publicaciones 
FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Permitir borrado publico de publicaciones" ON public.publicaciones;
CREATE POLICY "Borrado solo dueño" ON public.publicaciones 
FOR DELETE USING (auth.uid() = user_id);

-- Chats
DROP POLICY IF EXISTS "Permitir lectura publica de chats" ON public.mensajes_chat_privados;
CREATE POLICY "Lectura publica de chats" ON public.mensajes_chat_privados FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion publica de chats" ON public.mensajes_chat_privados;
CREATE POLICY "Inserción solo autenticados" ON public.mensajes_chat_privados 
FOR INSERT WITH CHECK (auth.uid() = autor_id AND NOT auth.is_banned());

-- Choferes (Todos leen, solo autenticados insertan su perfil, solo ellos lo borran)
DROP POLICY IF EXISTS "Permitir lectura publica de choferes" ON public.choferes_habilitados;
CREATE POLICY "Lectura publica choferes" ON public.choferes_habilitados FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion de choferes" ON public.choferes_habilitados;
CREATE POLICY "Inserción choferes autenticados" ON public.choferes_habilitados 
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Permitir borrado de choferes" ON public.choferes_habilitados;
CREATE POLICY "Borrado choferes dueños" ON public.choferes_habilitados 
FOR DELETE USING (auth.uid() = user_id);

-- Denuncias y Spam (Solo autenticados pueden crear)
DROP POLICY IF EXISTS "Permitir lectura publica de denuncias" ON public.denuncias;
CREATE POLICY "Nadie lee denuncias" ON public.denuncias FOR SELECT USING (false); -- Solo admin con service key

DROP POLICY IF EXISTS "Permitir insercion publica de denuncias" ON public.denuncias;
CREATE POLICY "Inserción de denuncias" ON public.denuncias FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RPC (Funciones)
-- FIX #9: Incrementar votos de manera atómica (Seguro contra Race Conditions)
CREATE OR REPLACE FUNCTION incrementar_votos(publicacion_id UUID, incremento INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.publicaciones 
  SET votos = votos + incremento
  WHERE id = publicacion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Tareas Automáticas (pg_cron) - Ahorro de espacio
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('limpiar_pedidos_viejos', '0 * * * *', $$
  DELETE FROM public.publicaciones WHERE tipo = 'pedido' AND created_at < NOW() - INTERVAL '72 hours';
$$);

SELECT cron.schedule('limpiar_avisos_viejos', '0 0 * * *', $$
  DELETE FROM public.publicaciones WHERE tipo = 'avisoBarrio' AND created_at < NOW() - INTERVAL '7 days';
$$);

SELECT cron.schedule('limpiar_chats_viejos', '0 0 * * *', $$
  DELETE FROM public.mensajes_chat_privados WHERE timestamp < NOW() - INTERVAL '7 days';
$$);

SELECT cron.schedule('limpiar_camiones_fantasma', '0 * * * *', $$
  DELETE FROM public.publicaciones WHERE tipo = 'rutaDistribuidor' AND created_at < NOW() - INTERVAL '6 hours';
$$);
