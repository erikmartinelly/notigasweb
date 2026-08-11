-- fix_rls_policies.sql
-- 1. Borrar las políticas permisivas (antiguas)
drop policy if exists "Public INSERT" on pedidos;
drop policy if exists "Public INSERT" on rutas_repartidores;
drop policy if exists "Public INSERT" on avisos;
drop policy if exists "Public INSERT" on comentarios_avisos;

drop policy if exists "Public UPDATE" on pedidos;
drop policy if exists "Public UPDATE" on rutas_repartidores;
drop policy if exists "Public UPDATE" on avisos;
drop policy if exists "Public UPDATE" on comentarios_avisos;

drop policy if exists "Public DELETE" on pedidos;
drop policy if exists "Public DELETE" on rutas_repartidores;
drop policy if exists "Public DELETE" on avisos;
drop policy if exists "Public DELETE" on comentarios_avisos;

-- 2. Borrar preventivamente las políticas nuevas (para evitar error 42710 si se corre 2 veces)
drop policy if exists "Insertar propio" on pedidos;
drop policy if exists "Insertar propio" on rutas_repartidores;
drop policy if exists "Insertar propio" on avisos;
drop policy if exists "Insertar propio" on comentarios_avisos;

drop policy if exists "Actualizar propio" on pedidos;
drop policy if exists "Actualizar propio" on rutas_repartidores;
drop policy if exists "Actualizar propio" on avisos;
drop policy if exists "Actualizar propio" on comentarios_avisos;

drop policy if exists "Borrar cualquier autenticado" on pedidos;
drop policy if exists "Borrar propio" on rutas_repartidores;
drop policy if exists "Borrar propio" on avisos;
drop policy if exists "Borrar propio" on comentarios_avisos;

-- 3. Restablecer políticas estrictas pero correctas para las 4 tablas principales
create policy "Insertar propio" on pedidos for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on rutas_repartidores for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on avisos for insert with check (auth.uid()::text = user_id);
create policy "Insertar propio" on comentarios_avisos for insert with check (auth.uid()::text = user_id);

create policy "Actualizar propio" on pedidos for update using (auth.uid()::text = user_id);
create policy "Actualizar propio" on rutas_repartidores for update using (auth.uid()::text = user_id);
create policy "Actualizar propio" on avisos for update using (auth.uid()::text = user_id);
create policy "Actualizar propio" on comentarios_avisos for update using (auth.uid()::text = user_id);

-- Para pedidos permitimos DELETE a cualquier autenticado para el flujo actual "aceptar = borrar"
create policy "Borrar cualquier autenticado" on pedidos for delete using (auth.uid() is not null);
create policy "Borrar propio" on rutas_repartidores for delete using (auth.uid()::text = user_id);
create policy "Borrar propio" on avisos for delete using (auth.uid()::text = user_id);
create policy "Borrar propio" on comentarios_avisos for delete using (auth.uid()::text = user_id);
