-- ─────────────────────────────────────────────────────────────────────────────
-- NOTIGAS - Script de Base de Datos Supabase (PostgreSQL) - MODO MVP / HACKATHON
-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA: Este esquema ha sido adaptado para permitir operaciones (INSERT/UPDATE/DELETE)
-- desde el frontend JavaScript sin requerir autenticación nativa con JWT de Supabase,
-- ya que la aplicación utiliza Google Identity Services (manejando emails localmente).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PUBLICACIONES (Tabla Principal Unificada para Pedidos, Avisos y Rutas)
CREATE TABLE IF NOT EXISTS public.publicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL, -- 'pedido', 'aviso', 'ruta', 'anuncio', etc.
    categoria VARCHAR(50),
    titulo TEXT,
    descripcion TEXT,
    ciudad VARCHAR(100),
    barrio_otb VARCHAR(100),
    user_email TEXT, -- Se utiliza email en lugar de auth.uid()
    user_role VARCHAR(50),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distribuidor_nombre TEXT,
    garrafas_agotadas BOOLEAN DEFAULT FALSE,
    imagen_url TEXT,
    enlace_url TEXT,
    votos INT DEFAULT 0,
    comentarios JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publicaciones_tipo_ciudad ON public.publicaciones (tipo, ciudad);
CREATE INDEX IF NOT EXISTS idx_publicaciones_created_at ON public.publicaciones (created_at);

ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total publicaciones" ON public.publicaciones;
-- PERMITE ACCESO TOTAL (Lectura y Escritura) PARA MVP
CREATE POLICY "Acceso total publicaciones" ON public.publicaciones FOR ALL USING (true) WITH CHECK (true);


-- 2. CHATS PRIVADOS VECINALES
CREATE TABLE IF NOT EXISTS public.mensajes_chat_privados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria_servicio VARCHAR(50) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    autor_email TEXT, -- Se guarda el email de Google
    alias_protegido TEXT NOT NULL,
    texto TEXT NOT NULL,
    denunciado BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_categoria_otb ON public.mensajes_chat_privados (categoria_servicio, barrio_otb);

ALTER TABLE public.mensajes_chat_privados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total chats" ON public.mensajes_chat_privados;
CREATE POLICY "Acceso total chats" ON public.mensajes_chat_privados FOR ALL USING (true) WITH CHECK (true);


-- 3. CHOFERES HABILITADOS (Ficha de Repartidor)
CREATE TABLE IF NOT EXISTS public.choferes_habilitados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email TEXT UNIQUE NOT NULL, -- Email como llave de identidad primaria
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

ALTER TABLE public.choferes_habilitados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total choferes" ON public.choferes_habilitados;
CREATE POLICY "Acceso total choferes" ON public.choferes_habilitados FOR ALL USING (true) WITH CHECK (true);


-- 4. BANEOS Y DENUNCIAS
CREATE TABLE IF NOT EXISTS public.usuarios_baneados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email TEXT UNIQUE NOT NULL,
    motivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.usuarios_baneados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura y Admin baneos" ON public.usuarios_baneados;
CREATE POLICY "Lectura y Admin baneos" ON public.usuarios_baneados FOR ALL USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS public.denuncias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email TEXT,
    tipo VARCHAR(50) NOT NULL,
    detalles TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total denuncias" ON public.denuncias;
CREATE POLICY "Acceso total denuncias" ON public.denuncias FOR ALL USING (true) WITH CHECK (true);


-- 5. REPORTES DE SPAM EN PUBLICACIONES
CREATE TABLE IF NOT EXISTS public.reportes_spam (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id TEXT,
    motivo TEXT,
    reporter_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.reportes_spam ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total spam" ON public.reportes_spam;
CREATE POLICY "Acceso total spam" ON public.reportes_spam FOR ALL USING (true) WITH CHECK (true);


-- 6. CREDENCIALES DE ADMINISTRACIÓN (Para el Panel Admin)
CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso lectura admin_credentials" ON public.admin_credentials;
CREATE POLICY "Acceso lectura admin_credentials" ON public.admin_credentials FOR SELECT USING (true);


-- 7. CONFIGURACIÓN DE REALTIME (Suscripciones Websocket de Supabase)
-- Elimina tablas antiguas si existieran en la publicación
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.pedidos; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.avisos; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.rutas_repartidores; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Agrega las tablas unificadas actuales
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.publicaciones; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat_privados; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 8. FUNCIONES ATÓMICAS (Votos)
CREATE OR REPLACE FUNCTION incrementar_votos_publicacion(pub_id UUID, incremento INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.publicaciones SET votos = votos + incremento WHERE id = pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. SANITIZACIÓN HTML (Prevenir Inyecciones XSS)
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

DROP TRIGGER IF EXISTS sanitize_publicaciones ON public.publicaciones;
CREATE TRIGGER sanitize_publicaciones
  BEFORE INSERT OR UPDATE ON public.publicaciones
  FOR EACH ROW EXECUTE PROCEDURE public.sanitize_html();
