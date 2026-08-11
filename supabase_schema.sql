-- ESQUEMA DE BASE DE DATOS PROFESIONAL PARA NOTIGAS
-- ARQUITECTURA A PRUEBA DE FALLOS: UUIDs, RPCs, constraints, deletes y sincronización con frontend.

-- 1. DROPS INICIALES REMOVIDOS PARA PRODUCCIÓN
-- Eliminamos los "drop table if exists cascade" para evitar destrucción accidental de datos en producción.
-- NOTIGAS v2.0+ utiliza migraciones no destructivas.

-- 2. EXTENSIONES
create extension if not exists "uuid-ossp";
-- Nota: pg_cron normalmente debe activarse desde el Dashboard de Supabase (Database > Extensions)
create extension if not exists "pg_cron";

-- TRABAJOS DE AUTO-PURGA (TTL)
-- NOTA: Debes habilitar pg_cron en el Dashboard de Supabase (Database -> Extensions).
-- Si da error de permisos al ejecutar esto, configúralo directamente desde la interfaz gráfica de Supabase.

-- TTL Pedidos (> 2 días)
select cron.schedule(
  'purge-old-pedidos',
  '0 0 * * *',
  $$ delete from pedidos where created_at < now() - interval '2 days'; $$
);

-- TTL Avisos Vecinales (> 72 horas)
select cron.schedule(
  'purge-old-avisos',
  '0 0 * * *',
  $$ delete from avisos where created_at < now() - interval '72 hours'; $$
);

-- 3. CREACIÓN DE TABLAS (Con UUIDs)

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
    estado text default 'pendiente' check (estado in ('pendiente', 'visto', 'entregado', 'cancelado')),
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

-- Tabla: usuarios_baneados
create table if not exists usuarios_baneados (
    id uuid primary key default uuid_generate_v4(),
    user_id text,
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



-- Tabla: credenciales de administrador
create table if not exists admin_credentials (
    id uuid primary key default uuid_generate_v4(),
    email text unique not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. FUNCIONES RPC (Stored Procedures para Votos Seguros)
create or replace function incrementar_votos_aviso(aviso_id uuid, incremento integer)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  
  if exists (select 1 from usuarios_baneados where user_id = auth.uid()::text) then
    raise exception 'Usuario baneado';
  end if;
  
  if incremento not in (-1, 1) then
    raise exception 'Incremento inválido';
  end if;

  update avisos set votos = votos + incremento where id = aviso_id;
end;
$$;

create or replace function incrementar_votos_comentario(comentario_id uuid, incremento integer)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from usuarios_baneados where user_id = auth.uid()::text) then
    raise exception 'Usuario baneado';
  end if;

  if incremento not in (-1, 1) then
    raise exception 'Incremento inválido';
  end if;

  update comentarios_avisos set votos = votos + incremento where id = comentario_id;
end;
$$;

-- Función auxiliar para políticas RLS de Administradores
create or replace function is_admin_email()
returns boolean language plpgsql security definer as $$
begin
  return exists (
    select 1 from admin_credentials 
    where email = auth.jwt() ->> 'email'
  );
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


-- Políticas de LECTURA: Solo usuarios autenticados o administradores
create policy "Auth SELECT pedidos" on pedidos for select using (auth.uid() is not null);
create policy "Auth SELECT rutas" on rutas_repartidores for select using (auth.uid() is not null);
create policy "Auth SELECT avisos" on avisos for select using (auth.uid() is not null);
create policy "Auth SELECT comentarios" on comentarios_avisos for select using (auth.uid() is not null);
create policy "Auth SELECT choferes" on choferes_habilitados for select using (auth.uid() is not null);
create policy "Auth SELECT baneados" on usuarios_baneados for select using (auth.uid() is not null);
create policy "Auth SELECT denuncias" on denuncias for select using (auth.uid() is not null);
create policy "Auth SELECT reportes" on reportes_spam for select using (auth.uid() is not null);

-- Políticas de INSERCIÓN
create policy "Insertar propio" on pedidos for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on rutas_repartidores for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on avisos for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on comentarios_avisos for insert with check (auth.uid()::text = user_id);
create policy "Insertar chofer" on choferes_habilitados for insert with check (auth.uid()::text = user_id);
create policy "Insertar denuncia" on denuncias for insert with check (auth.uid() is not null);
create policy "Insertar spam" on reportes_spam for insert with check (auth.uid() is not null);
-- Administradores pueden insertar baneos o cualquier cosa
create policy "Admin INSERT baneados" on usuarios_baneados for insert with check (is_admin_email());

create policy "Actualizar propio o Admin o Repartidor" on pedidos for update using (auth.uid()::text = user_id or is_admin_email() or exists (select 1 from choferes_habilitados where user_id = auth.uid()::text));
create policy "Actualizar propio o Admin" on rutas_repartidores for update using (auth.uid()::text = user_id or is_admin_email());
create policy "Actualizar propio o Admin" on avisos for update using (auth.uid()::text = user_id or is_admin_email());
create policy "Actualizar propio o Admin" on comentarios_avisos for update using (auth.uid()::text = user_id or is_admin_email());
create policy "Actualizar propio o Admin" on choferes_habilitados for update using (auth.uid()::text = user_id or is_admin_email());
create policy "Admin UPDATE baneados" on usuarios_baneados for update using (is_admin_email());
create policy "Admin UPDATE denuncias" on denuncias for update using (is_admin_email());
create policy "Admin UPDATE reportes" on reportes_spam for update using (is_admin_email());

-- Políticas de ELIMINACIÓN
-- Solo creador, repartidor o Admin pueden borrar pedidos
create policy "Borrar pedido seguro" on pedidos for delete using (auth.uid()::text = user_id or auth.uid()::text = driver_id or is_admin_email());
create policy "Borrar propio o Admin" on rutas_repartidores for delete using (auth.uid()::text = user_id or is_admin_email());
create policy "Borrar propio o Admin" on avisos for delete using (auth.uid()::text = user_id or is_admin_email());
create policy "Borrar propio o Admin" on comentarios_avisos for delete using (auth.uid()::text = user_id or is_admin_email());
create policy "Borrar propio o Admin" on choferes_habilitados for delete using (auth.uid()::text = user_id or is_admin_email());
create policy "Admin DELETE baneados" on usuarios_baneados for delete using (is_admin_email());
create policy "Admin DELETE denuncias" on denuncias for delete using (is_admin_email());
create policy "Admin DELETE reportes" on reportes_spam for delete using (is_admin_email());


-- 6. HABILITAR REALTIME (Websockets para que el mapa se mueva en vivo)
drop publication if exists supabase_realtime;
create publication supabase_realtime for table 
    pedidos, 
    rutas_repartidores, 
    avisos,
    comentarios_avisos;
