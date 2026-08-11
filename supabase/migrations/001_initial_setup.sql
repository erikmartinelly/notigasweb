-- 001_initial_setup.sql
-- EXTENSIONES Y CONFIGURACIÓN BASE

create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- Nota: pg_cron normalmente debe activarse desde el Dashboard de Supabase (Database > Extensions)

/* 
-- TRABAJOS DE AUTO-PURGA (TTL)
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
*/
