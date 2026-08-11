-- Archivo para aplicar el parche en la base de datos de producción (SQL Editor en Supabase)

-- 1. Eliminar la política defectuosa que impedía al repartidor actualizar pedidos
drop policy if exists "Actualizar propio o Admin" on pedidos;

-- 2. Crear la nueva política que permite al comprador, al admin, y a cualquier chofer habilitado actualizar el estado
create policy "Actualizar propio o Admin o Repartidor" on pedidos for update using (
  auth.uid()::text = user_id 
  or is_admin_email()
  or exists (select 1 from choferes_habilitados where user_id = auth.uid()::text)
);
