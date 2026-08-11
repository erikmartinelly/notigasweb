-- 003_community_tables.sql
-- TABLAS DE COMUNIDAD Y MODERACIÓN (Avisos, Denuncias, Spam)

-- Tabla: avisos (Foro vecinal y Anuncios de Admin)
create table if not exists avisos (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
    tipo text default 'aviso',
    categoria text,
    titulo text not null,
    descripcion text not null,
    ciudad text default 'santacruz',
    barrio_otb text default 'Global',
    votos integer default 1,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: comentarios_avisos
create table if not exists comentarios_avisos (
    id uuid primary key default uuid_generate_v4(),
    aviso_id uuid not null references avisos(id) on delete cascade,
    user_id text,
    autor text not null default 'Vecino de la OTB',
    texto text not null,
    votos integer default 1,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: reportes_spam (Filtro Anti-Inglés y denuncias de contenido)
create table if not exists reportes_spam (
    id uuid primary key default uuid_generate_v4(),
    texto text,
    motivo text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: denuncias
create table if not exists denuncias (
    id uuid primary key default uuid_generate_v4(),
    denunciante_id text,
    denunciado_id text,
    motivo text,
    detalles text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: usuarios_baneados
create table if not exists usuarios_baneados (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
    motivo text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
