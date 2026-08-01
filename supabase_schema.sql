-- ─────────────────────────────────────────────────────────────
-- NOTIGAS - Script de Base de Datos Supabase (PostgreSQL)
-- Copia y pega todo este script en el SQL Editor de tu Dashboard de Supabase
-- ─────────────────────────────────────────────────────────────

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Publicaciones (Pedidos de Garrafas, Chatarra, Detergentes, Agua, Frutas y Encargos)
CREATE TABLE IF NOT EXISTS public.publicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo VARCHAR(50) NOT NULL, -- 'pedido', 'avisoBarrio', 'rutaDistribuidor'
    categoria VARCHAR(50) NOT NULL, -- 'gas', 'chatarra', 'detergentes', 'agua', 'frutas', 'otras'
    titulo TEXT NOT NULL,
    descripcion TEXT,
    ciudad VARCHAR(100) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    user_email TEXT NOT NULL,
    user_role VARCHAR(30) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    distribuidor_nombre TEXT,
    distribuidor_ci TEXT,
    horario_recorrido TEXT,
    puntos_trazo_ruta JSONB, -- Array de coordenadas LatLng para la ruta GPS
    garrafas_agotadas BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexar por expiración (72 horas) y ciudad/OTB para lecturas ultrarrápidas
CREATE INDEX IF NOT EXISTS idx_publicaciones_ciudad_otb ON public.publicaciones (ciudad, barrio_otb);
CREATE INDEX IF NOT EXISTS idx_publicaciones_created_at ON public.publicaciones (created_at);

-- 3. Tabla de Mensajes de Chat Privado Opcional (Compradores <-> Vendedores)
CREATE TABLE IF NOT EXISTS public.mensajes_chat_privados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    categoria_servicio VARCHAR(50) NOT NULL,
    barrio_otb VARCHAR(100) NOT NULL,
    autor_email TEXT NOT NULL,
    autor_role VARCHAR(30) NOT NULL,
    alias_protegido TEXT NOT NULL,
    texto TEXT NOT NULL,
    denunciado BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_categoria_otb ON public.mensajes_chat_privados (categoria_servicio, barrio_otb);

-- 4. Tabla de Habilitación de Choferes por WhatsApp
CREATE TABLE IF NOT EXISTS public.choferes_habilitados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_completo TEXT NOT NULL,
    ci_carnet TEXT UNIQUE NOT NULL,
    telefono_whatsapp TEXT,
    estado_verificacion VARCHAR(30) DEFAULT 'aprobado', -- 'pendiente', 'aprobado', 'rechazado'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Habilitar Supabase Realtime para actualización automática del Mapa HD sin recargar
ALTER PUBLICATION supabase_realtime ADD TABLE public.publicaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat_privados;

-- 6. Políticas de Seguridad RLS (Row Level Security) - Permitir Lectura y Escritura Pública Anónima
ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_chat_privados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choferes_habilitados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura publica de publicaciones" ON public.publicaciones FOR SELECT USING (true);
CREATE POLICY "Permitir insercion publica de publicaciones" ON public.publicaciones FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir actualizacion publica de publicaciones" ON public.publicaciones FOR UPDATE USING (true);

CREATE POLICY "Permitir lectura publica de chats" ON public.mensajes_chat_privados FOR SELECT USING (true);
CREATE POLICY "Permitir insercion publica de chats" ON public.mensajes_chat_privados FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir lectura publica de choferes" ON public.choferes_habilitados FOR SELECT USING (true);
CREATE POLICY "Permitir insercion de choferes" ON public.choferes_habilitados FOR INSERT WITH CHECK (true);
