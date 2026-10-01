-- Sugerencias de los vecinos: estadistica de demanda, no pedidos.
--
-- Cuando una persona elige "otra solicitud" en el formulario, ya no se crea
-- un pedido. NOTIGAS no ofrece todavia ese material, asi que lo que interesa
-- es saber que pide la gente y con que frecuencia, para decidir que sumar al
-- catalogo. Por eso la peticion vive en su propia tabla y nunca se mezcla con
-- public.pedidos: un recolector no debe ver estos textos en el mapa ni tablero.
--
-- Lo que NO se guarda aqui, a proposito:
--   - La frase del vecino es texto libre y puede contener datos personales, asi
--     que se recorta a 200 caracteres y no se expone para lectura.
--   - No se guardan telefono, direccion, coordenadas ni foto. La peticion es
--     anonima; unicamente se conserva la ciudad y el momento.
--   - No hay columna de estado ni de asignacion: nadie trabaja estas filas.

-- unaccent vive en el esquema extensions en Supabase; se crea aqui para que
-- la normalizacion de acentos no dependa del orden de instalacion.
create extension if not exists unaccent with schema extensions;

create table if not exists public.solicitudes_otros (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  ciudad      text        not null default 'cochabamba',
  detalle     text        not null,
  created_at  timestamptz not null default now(),

  constraint solicitudes_otros_detalle_limite
    check (char_length(detalle) between 3 and 200),

  constraint solicitudes_otros_ciudad_limite
    check (char_length(ciudad) between 1 and 80)
);

comment on table public.solicitudes_otros is
  'Peticiones libres de los vecinos. Alimenta estadisticas de demanda; nunca genera pedidos.';

create index if not exists idx_solicitudes_otros_created
  on public.solicitudes_otros (created_at desc);

create index if not exists idx_solicitudes_otros_ciudad
  on public.solicitudes_otros (ciudad, created_at desc);

-- El detalle es texto libre del vecino: se normaliza a minusculas sin
-- acentos para poder agrupar ("Botellas", "botellas" y "BOTELLAS" cuentan
-- como la misma peticion) sin perder el texto original en detalle.
create or replace function public.normalizar_solicitud_otros(p_texto text)
returns text
language sql
immutable
set search_path to ''
as $fn$
  select left(
           trim(
             regexp_replace(
               translate(
                 lower(extensions.unaccent(coalesce(p_texto, ''))),
                 'áàäâãéèëêíìïîóòöôõúùüûñç',
                 'aaaaaeeeeiiiiooooouuuunc'
               ),
               '\s+', ' ', 'g'
             )
           ),
           200
         );
$fn$;

alter table public.solicitudes_otros
  add column if not exists detalle_normalizado text
  generated always as (public.normalizar_solicitud_otros(detalle)) stored;

create index if not exists idx_solicitudes_otros_normalizado
  on public.solicitudes_otros (detalle_normalizado);

-- Rate limit: evita que un vecino llene la tabla de basura. 5 por hora.
create or replace function public.guard_solicitud_otros_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_uid text := auth.uid()::text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes estar autenticado para enviar una solicitud';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No se puede registrar una solicitud en nombre de otra cuenta';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_uid AND activo IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Cuenta no autorizada para enviar solicitudes';
  END IF;

  NEW.ciudad  := left(lower(trim(coalesce(NEW.ciudad, 'cochabamba'))), 80);
  NEW.detalle := left(trim(coalesce(NEW.detalle, '')), 200);

  IF char_length(NEW.detalle) < 3 THEN
    RAISE EXCEPTION 'Escribe que te gustaria que recogamos (minimo 3 caracteres)';
  END IF;

  -- Bucket propio, y no el de pedidos: una peticion no es un pedido, asi que no
  -- debe gastar la cuota de quien acaba de encargar algo, ni viceversa.
  PERFORM public.enforce_action_rate_limit('solicitud_otros', 5, 3600);

  RETURN NEW;
END;
$$;

drop trigger if exists trg_solicitudes_otros_insert on public.solicitudes_otros;
create trigger trg_solicitudes_otros_insert
  before insert on public.solicitudes_otros
  for each row execute function public.guard_solicitud_otros_insert();

-- RLS: escribir si, leer no.
--
-- El vecino solo necesita el permiso de INSERT; el texto se devuelve con
-- .insert() sin .select(), asi que no necesita ninguna politica de lectura.
-- La lectura queda para el panel, que valida rol por separado, de modo que
-- ningun vecino autenticado puede enumerar lo que escribieron los demas.
alter table public.solicitudes_otros enable row level security;

revoke all on public.solicitudes_otros from anon, authenticated;
grant insert on public.solicitudes_otros to authenticated;

drop policy if exists "Solicitudes otros: insertar propias" on public.solicitudes_otros;
create policy "Solicitudes otros: insertar propias"
  on public.solicitudes_otros
  for insert
  to authenticated
  with check (user_id = (auth.uid())::text);

-- Vista de estadistica agregada. Sin datos personales y sin exposicion del
-- texto libre: cuenta peticiones por material y por ciudad.
--
-- La vista corre con los permisos de su dueno (no security_invoker) porque el
-- texto libre no se puede leer desde el cliente. Por eso NO se le concede
-- SELECT a authenticated: el panel la consulta a traves de
-- rpc_admin_solicitudes_otros_stats(), que si valida que quien llama sea admin.
create or replace view public.solicitudes_otros_stats
as
select
    detalle_normalizado                       as material,
    count(*)::int                             as veces_petido,
    count(distinct ciudad)::int               as ciudades,
    min(created_at)                           as primera_peticion,
    max(created_at)                           as ultima_peticion
  from public.solicitudes_otros
 group by detalle_normalizado;

comment on view public.solicitudes_otros_stats is
  'Frecuencia de cada peticion libre, sin identificacion ni texto original.';

-- CREATE OR REPLACE VIEW conserva las opciones de la vista existente, asi que
-- hay que fijar security_invoker de forma explicita: si la vista se creo
-- antes como security_invoker, el RPC de abajo no veria ninguna fila.
alter view public.solicitudes_otros_stats set (security_invoker = false);

revoke all on public.solicitudes_otros_stats from anon, authenticated;

-- Acceso del panel. El panel corre con la clave publicable, es decir con el JWT
-- del propio administrador, asi que la RLS de la tabla base le aplica igual que
-- a cualquier vecino. Por eso el conteo se expone por RPC y no por vista.
create or replace function public.rpc_admin_solicitudes_otros_stats(
  p_limite integer default 100
)
returns table (
  material           text,
  veces_petido       integer,
  ciudades           integer,
  primera_peticion   timestamptz,
  ultima_peticion    timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
BEGIN
  IF NOT public.is_admin_email() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN QUERY
    SELECT s.material,
           s.veces_petido,
           s.ciudades,
           s.primera_peticion,
           s.ultima_peticion
      FROM public.solicitudes_otros_stats s
     ORDER BY s.veces_petido DESC, s.material ASC
     LIMIT greatest(coalesce(p_limite, 100), 1);
END;
$$;

comment on function public.rpc_admin_solicitudes_otros_stats(integer) is
  'Materiales mas pedidos como peticion libre. Solo administradores.';

revoke all on function public.rpc_admin_solicitudes_otros_stats(integer) from anon;
grant execute on function public.rpc_admin_solicitudes_otros_stats(integer) to authenticated;
