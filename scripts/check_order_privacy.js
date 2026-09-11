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

const migrationPath = 'supabase/migrations/20260911022500_secure_order_radar_and_registered_driver_visibility.sql';
const migration = read(migrationPath);
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
assert(/revoke all on public\.rutas_repartidores_publicas from public, anon/i.test(migration), 'Usuarios no registrados no leen repartidores');
assert(/revoke all on public\.choferes_publicos from public, anon/i.test(migration), 'Usuarios no registrados no leen fichas de repartidor');

assert(/from\('order_public_radar'\)/.test(privacy), 'Frontend consume exclusivamente el radar sanitizado para pedidos libres');
assert(/L\.circle\(\[lat, lng\]/.test(privacy), 'Pedidos libres se dibujan como área, no como pin exacto');
assert(/rpc_get_my_assigned_orders/.test(privacy), 'Datos exactos se obtienen desde pedidos asignados');
assert(!/\.from\('pedidos'\)[\s\S]{0,250}telefono/.test(privacy), 'La capa de privacidad no consulta teléfono desde pedidos libres');
assert(/Los datos del pedido se habilitan únicamente si lo tomas/.test(privacy), 'La interfaz explica la regla de privacidad');

assert(/CACHE_VERSION = '135'/.test(state), 'State usa versión PWA 135');
assert(/order_privacy_layer\.js/.test(state), 'State carga la capa de privacidad');
assert(/notigas-cache-v135/.test(sw), 'Service worker usa caché v135');
assert(/order_privacy_layer\.js\?v=135/.test(sw), 'Service worker precachea la capa de privacidad');

console.log('\n🔐 Contrato de privacidad de pedidos verificado.');
