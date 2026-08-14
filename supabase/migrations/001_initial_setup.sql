-- 001_initial_setup.sql
-- EXTENSIONES Y CONFIGURACIÓN BASE

create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- Nota: pg_cron normalmente debe activarse desde el Dashboard de Supabase (Database > Extensions)

