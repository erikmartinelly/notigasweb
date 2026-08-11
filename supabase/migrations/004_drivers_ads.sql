-- 004_drivers_ads.sql
-- TABLAS DE CONDUCTORES Y ANUNCIOS

-- Tabla: choferes_habilitados (Repartidores registrados)
create table if not exists choferes_habilitados (
    id uuid primary key default uuid_generate_v4(),
    user_id text unique,
    nombre_completo text,
    telefono_whatsapp text,
    placa text,
    categoria text,
    productos text,
    zonas text,
    schedule text,
    ciudad text default 'santacruz',
    estado_verificacion text default 'pendiente',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: anuncios_globales (Anuncios administrados por la plataforma)
create table if not exists anuncios_globales (
    id uuid primary key default uuid_generate_v4(),
    titulo text,
    descripcion text,
    url text,
    image_url text,
    activo boolean default true,
    ciudad text default 'santacruz',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
