-- =============================================================================
-- NOTIGAS Bolivia - Eliminacion definitiva de residuos de la era Peru
-- =============================================================================
-- Cierra el contrato "todo es Bolivia":
--   1. Las seis funciones reintroducidas sin search_path vuelven a fijarlo.
--   2. Se eliminan los dos RPC de Peru (gas y Yape) que seguian ejecutables.
--   3. Se retira la columna precio_balon_10kg de tablas y vistas publicas.
--      El precio lo acuerdan las partes fuera de la plataforma; NOTIGAS no lo
--      almacena ni lo publica.
--   4. Se retira yape_numero: el pago es QR local entre las partes.
--   5. La vista publica deja de anunciar la modalidad Peru 'credito' y expone
--      'sin_comision', que es la unica modalidad admitida en Bolivia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. search_path explicito en las seis funciones del catalogo/contrato
-- -----------------------------------------------------------------------------
-- Los cuerpos solo referencian objetos cualificados (public.*, auth.uid), por
-- lo que search_path vacio es seguro y coincide con el estandar del proyecto.
alter function public.notigas_catalogo_categorias()
  set search_path = '';
alter function public.notigas_categoria_valida(text)
  set search_path = '';
alter function public.notigas_tipo_de_categoria(text)
  set search_path = '';
alter function public.is_current_enabled_driver(text, text)
  set search_path = '';
alter function public.normalize_delivery_category(text)
  set search_path = '';
alter function public.rpc_public_schema_contract()
  set search_path = '';

-- -----------------------------------------------------------------------------
-- 2. RPC de Peru: precio del gas y Yape
-- -----------------------------------------------------------------------------
-- No los invoca el frontend (verificado sobre el arbol de Bolivia) y escribian
-- datos de la plataforma de Peru en la fila y la ruta publica del repartidor.
drop function if exists public.rpc_actualizar_precio_gas_chofer(numeric);
drop function if exists public.rpc_actualizar_yape_chofer(text);

-- -----------------------------------------------------------------------------
-- 3. Retirar precio_balon_10kg de las vistas publicas
-- -----------------------------------------------------------------------------
-- Se recrean sin la columna. CREATE OR REPLACE no admite quitar columnas, asi
-- que se reconstruyen y se restauran reloptions (security_invoker) y grants.
drop view if exists public.choferes_publicos;
drop view if exists public.rutas_repartidores_publicas;

create view public.choferes_publicos as
  select driver_profile_id      as id,
         nombre_completo,
         categoria,
         ciudad,
         null::text               as telefono,
         null::text               as descripcion,
         null::text               as foto_url,
         estado_verificacion,
         created_at,
         color_camion,
         false                    as es_premium,
         zonas,
         schedule,
         productos
  from public.driver_public_profiles;

create view public.rutas_repartidores_publicas as
  select route_id                 as id,
         null::text               as user_id,
         distribuidor_nombre,
         categoria,
         titulo,
         ciudad,
         latitude,
         longitude,
         garrafas_agotadas,
         last_active,
         null::text               as telefono,
         null::text               as placa,
         productos,
         garrafas_agotadas       as balones_agotados,
         color_camion,
         false                    as es_premium,
         route_created_at,
         'sin_comision'::text     as tipo_plan
  from public.driver_public_presence;

alter view public.choferes_publicos set (security_invoker = true);
alter view public.rutas_repartidores_publicas set (security_invoker = true);

-- Grants exactos del estado previo: anon solo lee. No usar "grant all to anon",
-- abriria INSERT/UPDATE/DELETE sobre las vistas publicas.
grant select on table public.choferes_publicos to anon;
grant select, references, trigger, truncate on table public.choferes_publicos to authenticated;
grant all on table public.choferes_publicos to service_role;

grant select on table public.rutas_repartidores_publicas to anon;
grant select, references, trigger, truncate on table public.rutas_repartidores_publicas to authenticated;
grant all on table public.rutas_repartidores_publicas to service_role;

-- -----------------------------------------------------------------------------
-- 4. Retirar la columna de las tablas base
-- -----------------------------------------------------------------------------
alter table public.driver_public_profiles drop column if exists precio_balon_10kg;
alter table public.driver_public_presence   drop column if exists precio_balon_10kg;
alter table public.choferes_habilitados     drop column if exists precio_balon_10kg;
alter table public.rutas_repartidores       drop column if exists precio_balon_10kg;

-- -----------------------------------------------------------------------------
-- 5. Retirar yape_numero (pago por QR local, sin monedero electronico)
-- -----------------------------------------------------------------------------
alter table public.choferes_habilitados drop column if exists yape_numero;
