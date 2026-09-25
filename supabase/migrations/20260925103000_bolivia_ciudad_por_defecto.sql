-- =====================================================================
-- MIGRACION: Bolivia / Cochabamba como ciudad por defecto
-- Fecha: 2026-09-25
-- Objetivo:
--   El frontend ya operaba en Bolivia (9 ciudades, Bs, +591, CI/NIT), pero
--   la base seguia sembrando 'lima' como valor por defecto de ciudad. Eso
--   hacia que cualquier registro creado sin ciudad explicita cayera en
--   Lima y el mapa mostrara el area metropolitana peruana.
--   Esta migracion mueve los defaults y normaliza los datos heredados.
--
-- Alcance verificado antes de escribir (auditoria dinamica):
--   - 14 tablas tienen columna 'ciudad'.
--   - 6 tenian DEFAULT 'lima':
--       profiles, pedidos, avisos, choferes_habilitados,
--       rutas_repartidores, anuncios_globales
--   - Solo 3 tenian datos Peruanos (12 filas):
--       profiles.ciudad (7), pedidos_archivo.ciudad (4),
--       anuncios_globales.ciudad (1)
--   - Las vistas (pedidos_publicos, order_public_radar, choferes_publicos,
--     driver_public_presence, rutas_repartidores_publicas) derivan de las
--     tablas base, por lo que se corrigen solas. Ninguna definia 'lima'.
--   - Ninguna funcion, trigger, enum ni CHECK constraint contenia 'lima',
--     '+51', 'dni', soles ni 'PEN'. No habia que tocar logica.
--   - No habia coordenadas geograficas Peruanas que corregir (0 filas con
--     latitude/longitude).
--
-- Append-only: no modifica migraciones historicas.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Default de ciudad -> cochabamba en las 6 tablas base
-- ---------------------------------------------------------------------
alter table public.profiles
  alter column ciudad set default 'cochabamba';
alter table public.pedidos
  alter column ciudad set default 'cochabamba';
alter table public.avisos
  alter column ciudad set default 'cochabamba';
alter table public.choferes_habilitados
  alter column ciudad set default 'cochabamba';
alter table public.rutas_repartidores
  alter column ciudad set default 'cochabamba';
alter table public.anuncios_globales
  alter column ciudad set default 'cochabamba';

-- ---------------------------------------------------------------------
-- 2) Normalizar cualquier ciudad peruana heredada.
--    Se recorre de forma dinamica TODA columna 'ciudad' de las tablas
--    publicas, en vez de una lista fija, para que no se queden fuera
--    tablas como pedidos_archivo (sin default pero con datos).
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_actualizadas int;
  v_patron constant text :=
    '(^|[^a-z])(lima|arequipa|trujillo|piura|chiclayo|cusco|cuzco|tacna|juliaca|sullana|ayacucho|puno|huancayo|loreto|amazonas|tumbes|moquegua|huaraz|chimbote|pisco|iquitos|chachapoyas|callao|chiclayo)([^a-z]|$)';
begin
  for r in
    select c.relname::text  as tabla,
           a.attname::text  as columna
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind  = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = 'ciudad'
      and a.atttypid in ('text'::regtype, 'varchar'::regtype)
  loop
    execute format(
      'update public.%I set %I = ''cochabamba'' where %I ~* $1',
      r.tabla, r.columna, r.columna
    ) using v_patron;

    get diagnostics v_actualizadas = row_count;
    if v_actualizadas > 0 then
      raise notice 'ciudad -> cochabamba en %.%: % fila(s)',
        r.tabla, r.columna, v_actualizadas;
    end if;
  end loop;
end $$;

commit;
