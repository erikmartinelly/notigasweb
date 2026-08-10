-- ESQUEMA DE BASE DE DATOS PROFESIONAL PARA NOTIGAS
-- Diseñado basándose en los requerimientos nativos de la aplicación JavaScript.
-- Creado para ser copiado y pegado en el SQL Editor de Supabase.

-- 1. DROPS INICIALES (Limpieza para evitar conflictos)
drop publication if exists supabase_realtime;
drop table if exists pedidos cascade;
drop table if exists rutas_repartidores cascade;
drop table if exists avisos cascade;
drop table if exists choferes_habilitados cascade;
drop table if exists usuarios_baneados cascade;
drop table if exists denuncias cascade;
drop table if exists reportes_spam cascade;
drop table if exists mensajes_chat_privados cascade;
drop table if exists publicaciones cascade;
drop table if exists perfiles cascade;
drop table if exists user_roles cascade;

-- 2. CREACIÓN DE TABLAS

-- Tabla: pedidos (Solicitudes de gas de los vecinos)
create table pedidos (
    id bigint primary key generated always as identity,
    user_id text,
    categoria text,
    titulo text,
    descripcion text,
    ciudad text default 'Cochabamba',
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: rutas_repartidores (Ubicación GPS de los camiones en vivo)
create table rutas_repartidores (
    id bigint primary key generated always as identity,
    user_id text unique, -- UNIQUE es esencial para que funcione el UPSERT
    distribuidor_nombre text,
    categoria text default 'gas',
    titulo text,
    ciudad text default 'Cochabamba',
    latitude double precision,
    longitude double precision,
    garrafas_agotadas boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: avisos (Foro vecinal)
create table avisos (
    id bigint primary key generated always as identity,
    user_id text,
    categoria text,
    titulo text,
    descripcion text,
    ciudad text default 'Cochabamba',
    barrio_otb text default 'Global',
    votos integer default 1,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: reportes_spam (Filtro Anti-Inglés y denuncias de contenido)
create table reportes_spam (
    id bigint primary key generated always as identity,
    texto text,
    motivo text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: choferes_habilitados (Repartidores registrados)
create table choferes_habilitados (
    id bigint primary key generated always as identity,
    user_id text,
    nombre text,
    placa text,
    telefono text,
    estado text default 'activo',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: usuarios_baneados
create table usuarios_baneados (
    id bigint primary key generated always as identity,
    user_id text,
    motivo text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: denuncias
create table denuncias (
    id bigint primary key generated always as identity,
    denunciante_id text,
    denunciado_id text,
    motivo text,
    detalles text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: mensajes_chat_privados
create table mensajes_chat_privados (
    id bigint primary key generated always as identity,
    remitente_id text,
    destinatario_id text,
    mensaje text,
    leido boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: publicaciones (Uso exclusivo para Anuncios Globales del Administrador)
create table publicaciones (
    id bigint primary key generated always as identity,
    tipo text default 'anuncioGlobal',
    titulo text,
    descripcion text,
    user_id text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. HABILITAR SEGURIDAD (RLS)
alter table pedidos enable row level security;
alter table rutas_repartidores enable row level security;
alter table avisos enable row level security;
alter table choferes_habilitados enable row level security;
alter table usuarios_baneados enable row level security;
alter table denuncias enable row level security;
alter table reportes_spam enable row level security;
alter table mensajes_chat_privados enable row level security;
alter table publicaciones enable row level security;

-- 4. POLÍTICAS DE ACCESO (Públicas, ya que la app usa Google Identity JS client-side y no supabase auth nativo)
-- Esto permite que el JS inserte y lea sin que Supabase lo bloquee.
create policy "Allow all operations for pedidos" on pedidos for all using (true) with check (true);
create policy "Allow all operations for rutas_repartidores" on rutas_repartidores for all using (true) with check (true);
create policy "Allow all operations for avisos" on avisos for all using (true) with check (true);
create policy "Allow all operations for choferes_habilitados" on choferes_habilitados for all using (true) with check (true);
create policy "Allow all operations for usuarios_baneados" on usuarios_baneados for all using (true) with check (true);
create policy "Allow all operations for denuncias" on denuncias for all using (true) with check (true);
create policy "Allow all operations for reportes_spam" on reportes_spam for all using (true) with check (true);
create policy "Allow all operations for mensajes_chat_privados" on mensajes_chat_privados for all using (true) with check (true);
create policy "Allow all operations for publicaciones" on publicaciones for all using (true) with check (true);

-- 5. HABILITAR REALTIME (Websockets para que el mapa se mueva en vivo)
create publication supabase_realtime for table 
    pedidos, 
    rutas_repartidores, 
    avisos;
