-- Permite que la policy RLS de order_public_radar evalúe el helper privado.
-- El schema private no está expuesto por la Data API; el permiso existe solo
-- para que PostgreSQL pueda ejecutar la función desde la policy.
grant usage on schema private to authenticated;
grant execute on function private.can_view_order_radar(uuid) to authenticated;
notify pgrst, 'reload schema';
