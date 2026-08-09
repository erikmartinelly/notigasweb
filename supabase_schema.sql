-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- NOTIGAS - Script de Base de Datos Supabase (PostgreSQL) Seguro
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLES DE USUARIO
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    role VARCHAR(30) DEFAULT 'comprador'
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica user_roles" ON public.user_roles;
CREATE POLICY "Lectura publica user_roles" ON public.user_roles FOR SELECT USING (true);
-- Solo admin puede actualizar roles o triggers
DROP POLICY IF EXISTS "Actualizar user_roles admin" ON public.user_roles;
CREATE POLICY "Actualizar user_roles admin" ON public.user_roles FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Trigger para asignar rol inicial
CREATE OR REPLACE FUNCTION public.handle_new_user_role() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'comprador');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_role();


-- 2. PERFILES
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica perfiles" ON public.perfiles;
CREATE POLICY "Lectura publica perfiles" ON public.perfiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Actualizar propio perfil" ON public.perfiles;
CREATE POLICY "Actualizar propio perfil" ON public.perfiles FOR UPDATE USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user_profile() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();


-- 3. SANITIZACIÃ“N (Triggers)
CREATE OR REPLACE FUNCTION public.sanitize_html()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.titulo IS NOT NULL THEN
    NEW.titulo = REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g');
  END IF;
  IF NEW.descripcion IS NOT NULL THEN
    NEW.descripcion = REGEXP_REPLACE(NEW.descripcion, '<[^>]*>', '', 'g');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sanitize_html_chat()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.texto IS NOT NULL THEN
    NEW.texto = REGEXP_REPLACE(NEW.texto, '<[^>]*>', '', 'g');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 4. PEDIDOS (Separado de publicaciones)
CREATE TABLE IF NOT EXISTS public.pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria VARCHAR(50) NOT NULL, 
    titulo TEXT NOT NULL,
    descripcion TEXT,
    ciudad VARCHAR(100) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    votos INT DEFAULT 0,
    comentarios JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_ciudad_otb ON public.pedidos (ciudad, barrio_otb);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos (created_at);

CREATE TRIGGER sanitize_pedidos
  BEFORE INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE PROCEDURE public.sanitize_html();


-- 5. AVISOS (Separado de publicaciones)
CREATE TABLE IF NOT EXISTS public.avisos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria VARCHAR(50) NOT NULL, 
    titulo TEXT NOT NULL,
    descripcion TEXT,
    ciudad VARCHAR(100) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    votos INT DEFAULT 0,
    comentarios JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avisos_ciudad_otb ON public.avisos (ciudad, barrio_otb);

CREATE TRIGGER sanitize_avisos
  BEFORE INSERT OR UPDATE ON public.avisos
  FOR EACH ROW EXECUTE PROCEDURE public.sanitize_html();


-- 6. RUTAS REPARTIDORES (Separado de publicaciones)
CREATE TABLE IF NOT EXISTS public.rutas_repartidores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria VARCHAR(50) NOT NULL, 
    titulo TEXT NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    distribuidor_nombre TEXT,
    garrafas_agotadas BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rutas_ciudad ON public.rutas_repartidores (ciudad);


-- 7. CHATS PRIVADOS
CREATE TABLE IF NOT EXISTS public.mensajes_chat_privados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria_servicio VARCHAR(50) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    autor_id UUID REFERENCES auth.users(id),
    alias_protegido TEXT NOT NULL,
    texto TEXT NOT NULL,
    denunciado BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_categoria_otb ON public.mensajes_chat_privados (categoria_servicio, barrio_otb);

CREATE TRIGGER sanitize_chat
  BEFORE INSERT OR UPDATE ON public.mensajes_chat_privados
  FOR EACH ROW EXECUTE PROCEDURE public.sanitize_html_chat();


-- 8. CHOFERES HABILITADOS
CREATE TABLE IF NOT EXISTS public.choferes_habilitados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    nombre_completo TEXT NOT NULL,
    telefono_whatsapp TEXT,
    estado_verificacion VARCHAR(30) DEFAULT 'pendiente',
    placa TEXT,
    categoria TEXT,
    productos TEXT,
    zonas TEXT,
    schedule TEXT,
    ciudad TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 9. BANEOS Y DENUNCIAS
CREATE TABLE IF NOT EXISTS public.usuarios_baneados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) UNIQUE,
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.denuncias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    tipo VARCHAR(50) NOT NULL,
    detalles TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 10. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.avisos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rutas_repartidores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat_privados;


-- 11. RLS (Row Level Security) ESTRICTO
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rutas_repartidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat_privados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes_habilitados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_baneados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;

-- FunciÃ³n is_banned mejorada (por user_id)
CREATE OR REPLACE FUNCTION public.is_banned() RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.usuarios_baneados WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Pedidos
DROP POLICY IF EXISTS "Lectura publica pedidos" ON public.pedidos;
CREATE POLICY "Lectura publica pedidos" ON public.pedidos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Insertar pedidos autenticados" ON public.pedidos;
CREATE POLICY "Insertar pedidos autenticados" ON public.pedidos FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS "Actualizar propio pedido" ON public.pedidos;
CREATE POLICY "Actualizar propio pedido" ON public.pedidos FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Borrar propio pedido" ON public.pedidos;
CREATE POLICY "Borrar propio pedido" ON public.pedidos FOR DELETE USING (auth.uid() = user_id);

-- Avisos
DROP POLICY IF EXISTS "Lectura publica avisos" ON public.avisos;
CREATE POLICY "Lectura publica avisos" ON public.avisos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Insertar avisos autenticados" ON public.avisos;
CREATE POLICY "Insertar avisos autenticados" ON public.avisos FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS "Actualizar propio aviso" ON public.avisos;
CREATE POLICY "Actualizar propio aviso" ON public.avisos FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Borrar propio aviso" ON public.avisos;
CREATE POLICY "Borrar propio aviso" ON public.avisos FOR DELETE USING (auth.uid() = user_id);

-- Rutas Repartidores
DROP POLICY IF EXISTS "Lectura publica rutas" ON public.rutas_repartidores;
CREATE POLICY "Lectura publica rutas" ON public.rutas_repartidores FOR SELECT USING (true);
DROP POLICY IF EXISTS "Insertar rutas repartidores" ON public.rutas_repartidores;
CREATE POLICY "Insertar rutas repartidores" ON public.rutas_repartidores FOR INSERT WITH CHECK (
    auth.uid() = user_id AND NOT public.is_banned() AND 
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'repartidor')
);
DROP POLICY IF EXISTS "Actualizar propia ruta" ON public.rutas_repartidores;
CREATE POLICY "Actualizar propia ruta" ON public.rutas_repartidores FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Borrar propia ruta" ON public.rutas_repartidores;
CREATE POLICY "Borrar propia ruta" ON public.rutas_repartidores FOR DELETE USING (auth.uid() = user_id);

-- Chats
DROP POLICY IF EXISTS "Lectura publica chats" ON public.mensajes_chat_privados;
CREATE POLICY "Lectura publica chats" ON public.mensajes_chat_privados FOR SELECT USING (true);
DROP POLICY IF EXISTS "Insertar chats autenticados" ON public.mensajes_chat_privados;
CREATE POLICY "Insertar chats autenticados" ON public.mensajes_chat_privados FOR INSERT WITH CHECK (auth.uid() = autor_id AND NOT public.is_banned());

-- Choferes
DROP POLICY IF EXISTS "Lectura publica choferes" ON public.choferes_habilitados;
CREATE POLICY "Lectura publica choferes" ON public.choferes_habilitados FOR SELECT USING (true);
DROP POLICY IF EXISTS "Insertar propio chofer" ON public.choferes_habilitados;
CREATE POLICY "Insertar propio chofer" ON public.choferes_habilitados FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned());
DROP POLICY IF EXISTS "Actualizar propio perfil chofer" ON public.choferes_habilitados;
CREATE POLICY "Actualizar propio perfil chofer" ON public.choferes_habilitados FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Borrar propio perfil chofer" ON public.choferes_habilitados;
CREATE POLICY "Borrar propio perfil chofer" ON public.choferes_habilitados FOR DELETE USING (auth.uid() = user_id);

-- Baneos
DROP POLICY IF EXISTS "Lectura publica baneos" ON public.usuarios_baneados;
CREATE POLICY "Lectura publica baneos" ON public.usuarios_baneados FOR SELECT USING (true);

-- Denuncias
DROP POLICY IF EXISTS "Insertar denuncia" ON public.denuncias;
CREATE POLICY "Insertar denuncia" ON public.denuncias FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 12. FUNCIONES ATÃ“MICAS (Votos)
CREATE OR REPLACE FUNCTION incrementar_votos_pedido(pedido_id UUID, incremento INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.pedidos SET votos = votos + incremento WHERE id = pedido_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION incrementar_votos_aviso(aviso_id UUID, incremento INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.avisos SET votos = votos + incremento WHERE id = aviso_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 13. TABLAS FALTANTES SEGÃšN USO EN CLIENTE JS

-- PUBLICACIONES
CREATE TABLE IF NOT EXISTS public.publicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL,
    categoria VARCHAR(50),
    titulo TEXT,
    descripcion TEXT,
    ciudad VARCHAR(100),
    barrio_otb VARCHAR(100),
    user_email TEXT,
    user_role VARCHAR(50),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distribuidor_nombre TEXT,
    garrafas_agotadas BOOLEAN DEFAULT FALSE,
    imagen_url TEXT,
    enlace_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica publicaciones" ON public.publicaciones;
CREATE POLICY "Lectura publica publicaciones" ON public.publicaciones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Insertar publicaciones anon" ON public.publicaciones;
CREATE POLICY "Insertar publicaciones anon" ON public.publicaciones FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Actualizar publicaciones anon" ON public.publicaciones;
CREATE POLICY "Actualizar publicaciones anon" ON public.publicaciones FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Borrar publicaciones anon" ON public.publicaciones;
CREATE POLICY "Borrar publicaciones anon" ON public.publicaciones FOR DELETE USING (true);

-- ADMIN_CREDENTIALS
CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica admin_credentials" ON public.admin_credentials;
CREATE POLICY "Lectura publica admin_credentials" ON public.admin_credentials FOR SELECT USING (true);

-- REPORTES_SPAM
CREATE TABLE IF NOT EXISTS public.reportes_spam (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id TEXT,
    motivo TEXT,
    reporter_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.reportes_spam ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insertar reportes_spam anon" ON public.reportes_spam;
CREATE POLICY "Insertar reportes_spam anon" ON public.reportes_spam FOR INSERT WITH CHECK (true);

-- REPARTIDORES
CREATE TABLE IF NOT EXISTS public.repartidores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    telefono TEXT,
    placa TEXT,
    zona TEXT,
    estado VARCHAR(30) DEFAULT 'activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.repartidores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura publica repartidores" ON public.repartidores;
CREATE POLICY "Lectura publica repartidores" ON public.repartidores FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.publicaciones;



