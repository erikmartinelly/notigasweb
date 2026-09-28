const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

const migrationPath = 'supabase/migrations/20260911022526_secure_order_radar_and_registered_driver_visibility.sql';
const roleMigrationPath = 'supabase/migrations/20260916005326_restrict_order_radar_to_active_drivers.sql';
const truckVisibilityMigrationPath = 'supabase/migrations/20260915191531_public_truck_and_price_visibility.sql';
const grantPath = 'supabase/migrations/20260911023909_allow_radar_policy_helper_for_authenticated.sql';
const migration = read(migrationPath);
const roleMigration = read(roleMigrationPath);
const truckVisibilityMigration = read(truckVisibilityMigrationPath);
const grantMigration = read(grantPath);
const privacy = read('js/order_privacy_layer.js');
const state = read('js/state.js');
const sw = read('sw.js');
const index = read('index.html');

assert(/create table if not exists public\.order_public_radar/i.test(migration), 'Existe radar sanitizado de pedidos');
assert(/radius_m integer not null default 50 check \(radius_m = 50\)/i.test(migration), 'El radio público está fijado en 50 m');
assert(/15\.0 \+ random\(\)\*20\.0/i.test(migration), 'El centro aproximado usa desplazamiento aleatorio servidor-side');
assert(!/md5\(p_id::text\s*\|\|\s*'dist_seed'/i.test(migration), 'No se usa blur reversible basado en UUID');
assert(/revoke all on function public\.rpc_get_driver_available_orders\(text,text\) from public, anon, authenticated/i.test(migration), 'El RPC antiguo que filtraba datos privados está revocado');
assert(/create policy pedidos_select_strict[\s\S]*user_id=.*auth\.uid[\s\S]*driver_id=.*auth\.uid/i.test(migration), 'La tabla pedidos solo expone propietario, recolector asignado o admin');
assert(/security_invoker=true/i.test(migration), 'Las vistas públicas usan SECURITY INVOKER');
assert(/grant select on public\.rutas_repartidores_publicas to anon, authenticated/i.test(truckVisibilityMigration), 'Visitantes y compradores leen camiones públicos');
assert(/grant select on public\.choferes_publicos to anon, authenticated/i.test(truckVisibilityMigration), 'Visitantes y compradores leen fichas públicas de recolector');
assert(!/precio_balon_10kg/i.test(read('js/vendors.js')), 'El directorio de recolectores no pide el precio del balón peruano');
assert(!/precio_balon_10kg/i.test(read('js/map.js')), 'El mapa no lee ni escribe el precio del balón peruano');
assert(/revoke all on public\.order_public_radar from anon/i.test(truckVisibilityMigration), 'Visitantes no leen el radar de pedidos');
assert(/revoke all on public\.pedidos_publicos from anon/i.test(truckVisibilityMigration), 'Visitantes no leen pedidos');
assert(/grant usage on schema private to authenticated/i.test(grantMigration), 'La policy puede resolver el helper del schema privado');
assert(/grant execute on function private\.can_view_order_radar\(uuid\) to authenticated/i.test(grantMigration), 'Authenticated puede evaluar el helper privado desde RLS');
assert(/if not found\s+or p\.user_id = v_uid[\s\S]*or p\.driver_id is not null/i.test(roleMigration), 'Radar excluye propietarios y pedidos ya tomados');
assert(/estado_verificacion[\s\S]*aprobado[\s\S]*estado_servicio[\s\S]*activo/i.test(roleMigration), 'Radar exige recolector aprobado y activo');
assert(/delete from public\.order_public_radar radar[\s\S]*p\.driver_id is not null/i.test(roleMigration), 'Pedidos tomados se purgan del radar');

assert(/from\('order_public_radar'\)/.test(privacy), 'Frontend consume exclusivamente el radar sanitizado para pedidos libres');
assert(/L\.circle\(\[lat, lng\]/.test(privacy), 'Pedidos libres se dibujan como área, no como pin exacto');
assert(/rpc_get_my_assigned_orders/.test(privacy), 'Datos exactos se obtienen desde pedidos asignados');
assert(!/\.from\('pedidos'\)[\s\S]{0,250}telefono/.test(privacy), 'La capa de privacidad no consulta teléfono desde pedidos libres');
assert(/rpc\('rpc_admin_list_assigned_orders'\)/.test(privacy), 'La vista admin de asignados usa el RPC administrado');

const adminRpcMigrationPath = 'supabase/migrations/20260918150000_admin_assigned_orders_rpc.sql';
const adminRpcMigration = read(adminRpcMigrationPath);
assert(/create or replace function public\.rpc_admin_list_assigned_orders[\s\S]*security definer/i.test(adminRpcMigration), 'RPC admin de asignados es SECURITY DEFINER');
assert(/if not public\.is_admin_email\(\)[\s\S]*raise exception/i.test(adminRpcMigration), 'RPC admin de asignados valida la sesión dentro del servidor');
assert(/grant execute on function public\.rpc_admin_list_assigned_orders\(\) to authenticated/i.test(adminRpcMigration), 'RPC admin de asignados queda fuera del alcance anónimo');
assert(/Los datos del pedido se habilitan únicamente si lo tomas/.test(privacy), 'La interfaz explica la regla de privacidad');
assert(/if \(!isRecolectorMode\(\)\) \{[\s\S]*clearRadarLayers\(\);[\s\S]*return;/i.test(privacy), 'Frontend no consulta radar desde interfaz de comprador');

// La version de assets se deriva de state.js y se compara en todas partes.
// Asi el guard no se rompe en cada bump de version, que es como sobreviven tres
// literales obsoletos (138/139) que dejaron de coincidir con el precache real.
const versionMatch = state.match(/CACHE_VERSION\s*=\s*'(\d+)'/);
assert(Boolean(versionMatch), 'State declara CACHE_VERSION');
const assetVersion = versionMatch ? versionMatch[1] : null;
assert(new RegExp(`notigas-cache-v${assetVersion}\\b`).test(sw), 'Service worker usa la misma versión de caché que State');
assert(new RegExp(`\\./styles/main\\.css\\?v=${assetVersion}\\b`).test(sw), 'El precache sirve el CSS con la versión vigente');
assert(new RegExp(`js/state\\.js\\?v=${assetVersion}\\b`).test(index), 'El HTML carga state.js con la versión vigente');

// La capa de privacidad se carga bajo demanda: no debe competir en el precache
// inicial, y si se versiona debe usar la misma version que el resto.
const privacyPrecached = new RegExp(`order_privacy_layer\\.js\\?v=\\d+`).test(sw);
assert(!privacyPrecached, 'La capa de privacidad no compite en el precache inicial');
assert(!/order_privacy_layer\.js/.test(sw), 'La capa de privacidad no se precachea en ninguna forma');
assert(!new RegExp(`\\?v=(?!${assetVersion}\\b)\\d+`).test(sw), 'El service worker no mezcla versiones de assets');
assert(/loadOrderPrivacyModule/.test(state) && /order_privacy_layer\.js/.test(state), 'State conserva carga dinámica de la capa de privacidad');
assert(/fetch\(event\.request\)/.test(sw), 'Los módulos usados se incorporan al cache progresivamente');

console.log('\n🔐 Contrato de privacidad de pedidos verificado.');
