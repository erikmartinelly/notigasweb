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

assert(/create table if not exists public\.order_public_radar/i.test(migration), 'Existe radar sanitizado de pedidos');
assert(/radius_m integer not null default 50 check \(radius_m = 50\)/i.test(migration), 'El radio público está fijado en 50 m');
assert(/15\.0 \+ random\(\)\*20\.0/i.test(migration), 'El centro aproximado usa desplazamiento aleatorio servidor-side');
assert(!/md5\(p_id::text\s*\|\|\s*'dist_seed'/i.test(migration), 'No se usa blur reversible basado en UUID');
assert(/revoke all on function public\.rpc_get_driver_available_orders\(text,text\) from public, anon, authenticated/i.test(migration), 'El RPC antiguo que filtraba datos privados está revocado');
assert(/create policy pedidos_select_strict[\s\S]*user_id=.*auth\.uid[\s\S]*driver_id=.*auth\.uid/i.test(migration), 'La tabla pedidos solo expone propietario, repartidor asignado o admin');
assert(/security_invoker=true/i.test(migration), 'Las vistas públicas usan SECURITY INVOKER');
assert(/grant select on public\.rutas_repartidores_publicas to anon, authenticated/i.test(truckVisibilityMigration), 'Visitantes y compradores leen camiones públicos');
assert(/grant select on public\.choferes_publicos to anon, authenticated/i.test(truckVisibilityMigration), 'Visitantes y compradores leen fichas públicas con precio');
assert(/precio_balon_10kg/i.test(migration), 'La presencia pública incluye el precio del balón');
assert(/revoke all on public\.order_public_radar from anon/i.test(truckVisibilityMigration), 'Visitantes no leen el radar de pedidos');
assert(/revoke all on public\.pedidos_publicos from anon/i.test(truckVisibilityMigration), 'Visitantes no leen pedidos');
assert(/grant usage on schema private to authenticated/i.test(grantMigration), 'La policy puede resolver el helper del schema privado');
assert(/grant execute on function private\.can_view_order_radar\(uuid\) to authenticated/i.test(grantMigration), 'Authenticated puede evaluar el helper privado desde RLS');
assert(/if not found\s+or p\.user_id = v_uid[\s\S]*or p\.driver_id is not null/i.test(roleMigration), 'Radar excluye propietarios y pedidos ya tomados');
assert(/estado_verificacion[\s\S]*aprobado[\s\S]*estado_servicio[\s\S]*activo/i.test(roleMigration), 'Radar exige repartidor aprobado y activo');
assert(/delete from public\.order_public_radar radar[\s\S]*p\.driver_id is not null/i.test(roleMigration), 'Pedidos tomados se purgan del radar');

assert(/from\('order_public_radar'\)/.test(privacy), 'Frontend consume exclusivamente el radar sanitizado para pedidos libres');
assert(/L\.circle\(\[lat, lng\]/.test(privacy), 'Pedidos libres se dibujan como área, no como pin exacto');
assert(/rpc_get_my_assigned_orders/.test(privacy), 'Datos exactos se obtienen desde pedidos asignados');
assert(!/\.from\('pedidos'\)[\s\S]{0,250}telefono/.test(privacy), 'La capa de privacidad no consulta teléfono desde pedidos libres');
assert(/Los datos del pedido se habilitan únicamente si lo tomas/.test(privacy), 'La interfaz explica la regla de privacidad');
assert(/if \(!isDriverMode\(\)\) \{[\s\S]*clearRadarLayers\(\);[\s\S]*return;/i.test(privacy), 'Frontend no consulta radar desde interfaz de comprador');

assert(/CACHE_VERSION = '136'/.test(state), 'State mantiene la versión de assets del HTML');
assert(/loadOrderPrivacyModule/.test(state) && /order_privacy_layer\.js/.test(state), 'State conserva carga dinámica de la capa de privacidad');
assert(/notigas-cache-v137/.test(sw), 'Service worker usa caché progresiva v137');
assert(!/order_privacy_layer\.js\?v=136/.test(sw), 'La capa de privacidad no compite en el precache inicial');
assert(/fetch\(event\.request\)/.test(sw), 'Los módulos usados se incorporan al cache progresivamente');

console.log('\n🔐 Contrato de privacidad de pedidos verificado.');
