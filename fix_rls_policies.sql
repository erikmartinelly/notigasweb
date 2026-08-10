-- fix_rls_policies.sql
-- Borrar las políticas permisivas actuales
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

-- Restablecer políticas estrictas pero correctas para las 4 tablas principales
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
