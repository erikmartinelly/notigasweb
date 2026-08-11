-- 002_core_tables.sql
-- TABLAS PRINCIPALES DEL CICLO DE VIDA (Pedidos, Rutas y Admin)

-- Tabla: pedidos (Solicitudes de gas de los vecinos)
create table if not exists pedidos (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
    categoria text not null,
    titulo text,
    descripcion text,
    cantidad text default '1 unidad',
    direccion text,
    telefono text,
    estado text default 'pendiente' check (estado in ('pendiente', 'visto', 'asignado', 'entregado', 'cancelado')),
    driver_id text,
    ciudad text default 'santacruz',
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_pedidos_ciudad_otb_created on pedidos(ciudad, barrio_otb, created_at desc);

-- Tabla: rutas_repartidores (Ubicación GPS de los camiones en vivo)
create table if not exists rutas_repartidores (
    id uuid primary key default uuid_generate_v4(),
    user_id text unique,
    distribuidor_nombre text,
    categoria text default 'gas',
    titulo text,
    ciudad text default 'santacruz',
    latitude double precision,
    longitude double precision,
    garrafas_agotadas boolean default false,
    last_active timestamp with time zone default timezone('utc'::text, now()),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index if not exists idx_rutas_ciudad_last_active on rutas_repartidores(ciudad, last_active desc);

-- Tabla: credenciales de administrador
create table if not exists admin_credentials (
    id uuid primary key default uuid_generate_v4(),
    email text unique not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
