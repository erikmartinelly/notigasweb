-- 005_functions_rls.sql
-- FUNCIONES RPC Y POLÍTICAS DE SEGURIDAD (RLS)

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
declare
  user_email text;
begin
  user_email := auth.jwt() ->> 'email';
  -- Verificamos contra la lista estática (igual que en frontend) o la tabla heredada
  if user_email in ('erikmartinelly@gmail.com', 'leonmartinelly13@gmail.com') then
    return true;
  end if;

  return exists (
    select 1 from admin_credentials 
    where email = user_email
  );
end;
$$;

-- Función auxiliar para verificar si un usuario está baneado
create or replace function is_banned()
returns boolean language plpgsql security definer as $$
declare
  u_email text;
  u_id text;
begin
  u_id := auth.uid()::text;
  u_email := auth.jwt() ->> 'email';
  
  return exists (
    select 1 from usuarios_baneados 
    where user_id = u_id or user_id = u_email
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
alter table anuncios_globales enable row level security;


-- Políticas de LECTURA: Solo usuarios autenticados o administradores
drop policy if exists "Auth SELECT pedidos" on pedidos;
create policy "Auth SELECT pedidos" on pedidos for select using (auth.uid() is not null);
drop policy if exists "Auth SELECT rutas" on rutas_repartidores;
create policy "Auth SELECT rutas" on rutas_repartidores for select using (auth.uid() is not null);
drop policy if exists "Auth SELECT avisos" on avisos;
create policy "Auth SELECT avisos" on avisos for select using (auth.uid() is not null);
drop policy if exists "Auth SELECT comentarios" on comentarios_avisos;
create policy "Auth SELECT comentarios" on comentarios_avisos for select using (auth.uid() is not null);
drop policy if exists "Auth SELECT choferes" on choferes_habilitados;
create policy "Auth SELECT choferes" on choferes_habilitados for select using (auth.uid() is not null);
drop policy if exists "Auth SELECT baneados" on usuarios_baneados;
create policy "Auth SELECT baneados" on usuarios_baneados for select using (auth.uid() is not null);
drop policy if exists "Auth SELECT denuncias" on denuncias;
create policy "Auth SELECT denuncias" on denuncias for select using (is_admin_email());
drop policy if exists "Auth SELECT reportes" on reportes_spam;
create policy "Auth SELECT reportes" on reportes_spam for select using (is_admin_email());
drop policy if exists "Auth SELECT anuncios" on anuncios_globales;
create policy "Auth SELECT anuncios" on anuncios_globales for select using (true); -- Public access

-- Políticas de INSERCIÓN
drop policy if exists "Insertar propio" on pedidos;
create policy "Insertar propio" on pedidos for insert with check (auth.uid()::text = user_id and not is_banned());
drop policy if exists "Insertar propio" on rutas_repartidores;
create policy "Insertar propio" on rutas_repartidores for insert with check (auth.uid()::text = user_id and not is_banned());
drop policy if exists "Insertar propio" on avisos;
create policy "Insertar propio" on avisos for insert with check (auth.uid()::text = user_id and not is_banned());
drop policy if exists "Insertar propio" on comentarios_avisos;
create policy "Insertar propio" on comentarios_avisos for insert with check (auth.uid()::text = user_id and not is_banned());
drop policy if exists "Insertar chofer" on choferes_habilitados;
create policy "Insertar chofer" on choferes_habilitados for insert with check (auth.uid()::text = user_id and not is_banned());
drop policy if exists "Insertar denuncia" on denuncias;
create policy "Insertar denuncia" on denuncias for insert with check (auth.uid() is not null);
drop policy if exists "Insertar spam" on reportes_spam;
create policy "Insertar spam" on reportes_spam for insert with check (auth.uid() is not null);
-- Administradores pueden insertar baneos o cualquier cosa
drop policy if exists "Admin INSERT baneados" on usuarios_baneados;
create policy "Admin INSERT baneados" on usuarios_baneados for insert with check (is_admin_email());
drop policy if exists "Admin INSERT anuncios" on anuncios_globales;
create policy "Admin INSERT anuncios" on anuncios_globales for insert with check (is_admin_email());

drop policy if exists "Actualizar propio o Admin o Repartidor" on pedidos;
-- Un repartidor puede actualizar un pedido si no tiene driver_id (está tomando el pedido), o si es el driver asignado, o si es un nuevo pedido pendiente
create policy "Actualizar propio o Admin o Repartidor" on pedidos for update using (
    auth.uid()::text = user_id or 
    is_admin_email() or 
    (
        exists (
            select 1 from choferes_habilitados 
            where user_id = auth.uid()::text 
              and ciudad = pedidos.ciudad 
              and categoria = pedidos.categoria
        ) 
        and (driver_id is null or driver_id = auth.uid()::text or estado = 'pendiente')
    )
);
drop policy if exists "Actualizar propio o Admin" on rutas_repartidores;
create policy "Actualizar propio o Admin" on rutas_repartidores for update using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Actualizar propio o Admin" on avisos;
create policy "Actualizar propio o Admin" on avisos for update using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Actualizar propio o Admin" on comentarios_avisos;
create policy "Actualizar propio o Admin" on comentarios_avisos for update using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Actualizar propio o Admin" on choferes_habilitados;
create policy "Actualizar propio o Admin" on choferes_habilitados for update using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Admin UPDATE baneados" on usuarios_baneados;
create policy "Admin UPDATE baneados" on usuarios_baneados for update using (is_admin_email());
drop policy if exists "Admin UPDATE denuncias" on denuncias;
create policy "Admin UPDATE denuncias" on denuncias for update using (is_admin_email());
drop policy if exists "Admin UPDATE reportes" on reportes_spam;
create policy "Admin UPDATE reportes" on reportes_spam for update using (is_admin_email());
drop policy if exists "Admin UPDATE anuncios" on anuncios_globales;
create policy "Admin UPDATE anuncios" on anuncios_globales for update using (is_admin_email());

-- Políticas de ELIMINACIÓN
-- Solo creador, repartidor o Admin pueden borrar pedidos
drop policy if exists "Borrar pedido seguro" on pedidos;
create policy "Borrar pedido seguro" on pedidos for delete using (auth.uid()::text = user_id or auth.uid()::text = driver_id or is_admin_email());
drop policy if exists "Borrar propio o Admin" on rutas_repartidores;
create policy "Borrar propio o Admin" on rutas_repartidores for delete using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Borrar propio o Admin" on avisos;
create policy "Borrar propio o Admin" on avisos for delete using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Borrar propio o Admin" on comentarios_avisos;
create policy "Borrar propio o Admin" on comentarios_avisos for delete using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Borrar propio o Admin" on choferes_habilitados;
create policy "Borrar propio o Admin" on choferes_habilitados for delete using (auth.uid()::text = user_id or is_admin_email());
drop policy if exists "Admin DELETE baneados" on usuarios_baneados;
create policy "Admin DELETE baneados" on usuarios_baneados for delete using (is_admin_email());
drop policy if exists "Admin DELETE denuncias" on denuncias;
create policy "Admin DELETE denuncias" on denuncias for delete using (is_admin_email());
drop policy if exists "Admin DELETE reportes" on reportes_spam;
create policy "Admin DELETE reportes" on reportes_spam for delete using (is_admin_email());
drop policy if exists "Admin DELETE anuncios" on anuncios_globales;
create policy "Admin DELETE anuncios" on anuncios_globales for delete using (is_admin_email());
