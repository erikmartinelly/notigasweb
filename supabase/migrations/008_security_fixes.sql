-- =============================================================================
-- MIGRACIÓN 008: PARCHES DE SEGURIDAD CRÍTICOS
-- 1. Restricción de GPS en pedidos.
-- 2. Sistema de unicidad de votos para evitar manipulación.
-- =============================================================================

-- 1. Restringir visibilidad de ubicación (GPS) de pedidos
-- Protege las coordenadas de los usuarios. Solo el propio usuario, los admins
-- y los repartidores habilitados de la misma zona pueden leer los pedidos.
drop policy if exists "Auth SELECT pedidos" on pedidos;
create policy "Auth SELECT pedidos" on pedidos for select using (
  auth.uid()::text = user_id 
  OR is_admin_email() 
  OR (exists (
    select 1 from choferes_habilitados
    where user_id = auth.uid()::text
    and ciudad = pedidos.ciudad
    and categoria = pedidos.categoria
  ))
);

-- 2. Sistema seguro de votos con tracking por usuario
create table if not exists votos_registro (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    entidad_id uuid not null,
    tipo_entidad text not null check (tipo_entidad in ('aviso', 'comentario', 'pedido')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id, entidad_id)
);

alter table votos_registro enable row level security;
drop policy if exists "Auth SELECT votos_registro" on votos_registro;
create policy "Auth SELECT votos_registro" on votos_registro for select using (auth.uid()::text = user_id or is_admin_email());

drop policy if exists "Auth INSERT votos_registro" on votos_registro;
create policy "Auth INSERT votos_registro" on votos_registro for insert with check (auth.uid()::text = user_id);

drop policy if exists "Auth DELETE votos_registro" on votos_registro;
create policy "Auth DELETE votos_registro" on votos_registro for delete using (auth.uid()::text = user_id);


-- Actualizar función de votos de avisos
create or replace function incrementar_votos_aviso(aviso_id uuid, incremento integer)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id text;
begin
  v_user_id := auth.uid()::text;
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if incremento > 0 then
    begin
      insert into votos_registro (user_id, entidad_id, tipo_entidad) values (v_user_id, aviso_id, 'aviso');
    exception when unique_violation then
      raise exception 'Ya has votado esta publicación';
    end;
    update avisos set votos = votos + 1 where id = aviso_id;
  else
    delete from votos_registro where user_id = v_user_id and entidad_id = aviso_id and tipo_entidad = 'aviso';
    update avisos set votos = greatest(0, votos - 1) where id = aviso_id;
  end if;
end;
$$;

-- Actualizar función de votos de comentarios
create or replace function incrementar_votos_comentario(comentario_id uuid, incremento integer)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id text;
begin
  v_user_id := auth.uid()::text;
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if incremento > 0 then
    begin
      insert into votos_registro (user_id, entidad_id, tipo_entidad) values (v_user_id, comentario_id, 'comentario');
    exception when unique_violation then
      raise exception 'Ya has votado este comentario';
    end;
    update comentarios_avisos set votos = votos + 1 where id = comentario_id;
  else
    delete from votos_registro where user_id = v_user_id and entidad_id = comentario_id and tipo_entidad = 'comentario';
    update comentarios_avisos set votos = greatest(0, votos - 1) where id = comentario_id;
  end if;
end;
$$;
