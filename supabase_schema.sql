-- ESQUEMA DE BASE DE DATOS PROFESIONAL PARA NOTIGAS
-- ARQUITECTURA A PRUEBA DE FALLOS: UUIDs, RPCs, constraints, deletes y sincronización con frontend.

-- 1. DROPS INICIALES (Limpieza para evitar conflictos)
drop publication if exists supabase_realtime;
drop table if exists comentarios_avisos cascade;
drop table if exists pedidos cascade;
drop table if exists rutas_repartidores cascade;
drop table if exists avisos cascade;
drop table if exists choferes_habilitados cascade;
drop table if exists usuarios_baneados cascade;
drop table if exists denuncias cascade;
drop table if exists reportes_spam cascade;
drop table if exists mensajes_chat_privados cascade;
drop table if exists publicaciones cascade;
drop table if exists admin_credentials cascade;

-- 2. EXTENSIONES
create extension if not exists "uuid-ossp";
-- Nota: pg_cron normalmente debe activarse desde el Dashboard de Supabase (Database > Extensions)
create extension if not exists "pg_cron";

/* 
-- Trabajo de auto-purga (TTL) para borrar pedidos antiguos (> 2 días) todos los días a medianoche
-- NOTA: Debes habilitar pg_cron en el Dashboard de Supabase (Database -> Extensions).
-- Si da error de permisos al ejecutar esto, configúralo directamente desde la interfaz gráfica de Supabase.
select cron.schedule(
  'purge-old-pedidos',
  '0 0 * * *',
  $$ delete from pedidos where created_at < now() - interval '2 days'; $$
);
*/

-- 3. CREACIÓN DE TABLAS (Con UUIDs)

-- Tabla: pedidos (Solicitudes de gas de los vecinos)
create table pedidos (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
    categoria text not null,
    titulo text,
    descripcion text,
    cantidad text default '1 unidad',
    direccion text,
    telefono text,
    estado text default 'pendiente' check (estado in ('pendiente', 'visto', 'entregado', 'cancelado')),
    driver_id text,
    ciudad text default 'Cochabamba',
    barrio_otb text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: rutas_repartidores (Ubicación GPS de los camiones en vivo)
create table rutas_repartidores (
    id uuid primary key default uuid_generate_v4(),
    user_id text unique,
    distribuidor_nombre text,
    categoria text default 'gas',
    titulo text,
    ciudad text default 'Cochabamba',
    latitude double precision,
    longitude double precision,
    garrafas_agotadas boolean default false,
    last_active timestamp with time zone default timezone('utc'::text, now()),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: avisos (Foro vecinal y Anuncios de Admin)
create table avisos (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
    tipo text default 'aviso',
    categoria text,
    titulo text not null,
    descripcion text not null,
    ciudad text default 'Cochabamba',
    barrio_otb text default 'Global',
    votos integer default 1,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: comentarios_avisos
create table comentarios_avisos (
    id uuid primary key default uuid_generate_v4(),
    aviso_id uuid not null references avisos(id) on delete cascade,
    user_id text,
    autor text not null default 'Vecino de la OTB',
    texto text not null,
    votos integer default 1,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: reportes_spam (Filtro Anti-Inglés y denuncias de contenido)
create table reportes_spam (
    id uuid primary key default uuid_generate_v4(),
    texto text,
    motivo text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: choferes_habilitados (Repartidores registrados)
create table choferes_habilitados (
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

-- Tabla: usuarios_baneados
create table usuarios_baneados (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
    motivo text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla: denuncias
create table denuncias (
    id uuid primary key default uuid_generate_v4(),
    denunciante_id text,
    denunciado_id text,
    motivo text,
    detalles text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);



-- (Tabla publicaciones eliminada: fusionada con avisos usando la columna 'tipo')

-- Tabla: credenciales de administrador
create table if not exists admin_credentials (
    id uuid primary key default uuid_generate_v4(),
    email text unique not null,
    password_hash text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. FUNCIONES RPC (Stored Procedures para Votos Seguros)
create or replace function incrementar_votos_aviso(aviso_id uuid, incremento integer)
returns void language plpgsql security definer as $$
begin
  update avisos set votos = votos + incremento where id = aviso_id;
end;
$$;

create or replace function incrementar_votos_comentario(comentario_id uuid, incremento integer)
returns void language plpgsql security definer as $$
begin
  update comentarios_avisos set votos = votos + incremento where id = comentario_id;
end;
$$;

-- RPC: Autenticación segura de administrador
create or replace function validar_admin(p_email text, p_password text)
returns boolean language plpgsql security definer as $$
declare
  is_valid boolean;
begin
  select exists (
    select 1 from admin_credentials 
    where email = p_email and password_hash = p_password
  ) into is_valid;
  return is_valid;
end;
$$;

-- 5. HABILITAR SEGURIDAD (RLS)
alter table pedidos enable row level security;
alter table rutas_repartidores enable row level security;
alter table avisos enable row level security;
alter table comentarios_avisos enable row level security;
alter table choferes_habilitados enable row level security;
alter table usuarios_baneados enable row level security;
alter table denuncias enable row level security;
alter table reportes_spam enable row level security;


-- Políticas Universales (MVP Público): Permitir lectura, inserción y borrado, basándose en la confianza del cliente.
create policy "Public SELECT" on pedidos for select using (true);
create policy "Public SELECT" on rutas_repartidores for select using (true);
create policy "Public SELECT" on avisos for select using (true);
create policy "Public SELECT" on comentarios_avisos for select using (true);
create policy "Public SELECT" on choferes_habilitados for select using (true);
create policy "Public SELECT" on usuarios_baneados for select using (true);
create policy "Public SELECT" on denuncias for select using (true);
create policy "Public SELECT" on reportes_spam for select using (true);

create policy "Insertar propio" on pedidos for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on rutas_repartidores for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on avisos for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on comentarios_avisos for insert with check (auth.uid()::text = user_id);
create policy "Public INSERT" on choferes_habilitados for insert with check (true);
create policy "Public INSERT" on usuarios_baneados for insert with check (true);
create policy "Public INSERT" on denuncias for insert with check (true);
create policy "Public INSERT" on reportes_spam for insert with check (true);

create policy "Actualizar propio" on pedidos for update using (auth.uid()::text = user_id);
create policy "Actualizar propio" on rutas_repartidores for update using (auth.uid()::text = user_id);
create policy "Actualizar propio" on avisos for update using (auth.uid()::text = user_id);
create policy "Actualizar propio" on comentarios_avisos for update using (auth.uid()::text = user_id);
create policy "Public UPDATE" on choferes_habilitados for update using (true);
create policy "Public UPDATE" on usuarios_baneados for update using (true);
create policy "Public UPDATE" on denuncias for update using (true);
create policy "Public UPDATE" on reportes_spam for update using (true);

create policy "Borrar cualquier autenticado" on pedidos for delete using (auth.uid() is not null);
create policy "Borrar propio" on rutas_repartidores for delete using (auth.uid()::text = user_id);
create policy "Borrar propio" on avisos for delete using (auth.uid()::text = user_id);
create policy "Borrar propio" on comentarios_avisos for delete using (auth.uid()::text = user_id);
create policy "Public DELETE" on choferes_habilitados for delete using (true);
create policy "Public DELETE" on usuarios_baneados for delete using (true);
create policy "Public DELETE" on denuncias for delete using (true);
create policy "Public DELETE" on reportes_spam for delete using (true);


-- 6. HABILITAR REALTIME (Websockets para que el mapa se mueva en vivo)
create publication supabase_realtime for table 
    pedidos, 
    rutas_repartidores, 
    avisos,
    comentarios_avisos;
