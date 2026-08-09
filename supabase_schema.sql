-- ─────────────────────────────────────────────────────────────
-- NOTIGAS - Script de Base de Datos Supabase (PostgreSQL) Seguro
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLES DE USUARIO
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    role VARCHAR(30) DEFAULT 'comprador'
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura publica user_roles" ON public.user_roles FOR SELECT USING (true);
-- Solo admin puede actualizar roles o triggers
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
CREATE POLICY "Lectura publica perfiles" ON public.perfiles FOR SELECT USING (true);
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


-- 3. SANITIZACIÓN (Triggers)
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

-- Función is_banned mejorada (por user_id)
CREATE OR REPLACE FUNCTION auth.is_banned() RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.usuarios_baneados WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Pedidos
CREATE POLICY "Lectura publica pedidos" ON public.pedidos FOR SELECT USING (true);
CREATE POLICY "Insertar pedidos autenticados" ON public.pedidos FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT auth.is_banned());
CREATE POLICY "Actualizar propio pedido" ON public.pedidos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Borrar propio pedido" ON public.pedidos FOR DELETE USING (auth.uid() = user_id);

-- Avisos
CREATE POLICY "Lectura publica avisos" ON public.avisos FOR SELECT USING (true);
CREATE POLICY "Insertar avisos autenticados" ON public.avisos FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT auth.is_banned());
CREATE POLICY "Actualizar propio aviso" ON public.avisos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Borrar propio aviso" ON public.avisos FOR DELETE USING (auth.uid() = user_id);

-- Rutas Repartidores
CREATE POLICY "Lectura publica rutas" ON public.rutas_repartidores FOR SELECT USING (true);
CREATE POLICY "Insertar rutas repartidores" ON public.rutas_repartidores FOR INSERT WITH CHECK (
    auth.uid() = user_id AND NOT auth.is_banned() AND 
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'repartidor')
);
CREATE POLICY "Actualizar propia ruta" ON public.rutas_repartidores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Borrar propia ruta" ON public.rutas_repartidores FOR DELETE USING (auth.uid() = user_id);

-- Chats
CREATE POLICY "Lectura publica chats" ON public.mensajes_chat_privados FOR SELECT USING (true);
CREATE POLICY "Insertar chats autenticados" ON public.mensajes_chat_privados FOR INSERT WITH CHECK (auth.uid() = autor_id AND NOT auth.is_banned());

-- Choferes
CREATE POLICY "Lectura publica choferes" ON public.choferes_habilitados FOR SELECT USING (true);
CREATE POLICY "Insertar propio chofer" ON public.choferes_habilitados FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT auth.is_banned());
CREATE POLICY "Actualizar propio perfil chofer" ON public.choferes_habilitados FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Borrar propio perfil chofer" ON public.choferes_habilitados FOR DELETE USING (auth.uid() = user_id);

-- Baneos
CREATE POLICY "Lectura publica baneos" ON public.usuarios_baneados FOR SELECT USING (true);

-- Denuncias
CREATE POLICY "Insertar denuncia" ON public.denuncias FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 12. FUNCIONES ATÓMICAS (Votos)
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
