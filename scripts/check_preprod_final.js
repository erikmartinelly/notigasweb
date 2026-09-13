#!/usr/bin/env node
'use strict';

const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
const must = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`OK: ${msg}`);
};

const orders = read('js/orders.js');
const privacy = read('js/order_privacy_layer.js');
const readme = read('README.md');
const snapshot = read('supabase/full_production_schema.sql');
const migration = read('supabase/migrations/20260911205957_preprod_final_security_and_credit_messages.sql');
const legacyDrivers = read('supabase/migrations/20260911210832_close_legacy_repartidores_public_read.sql');
const hardening = read('supabase/migrations/20260913003000_security_surface_hardening.sql');
const adminWrites = read('supabase/migrations/20260913004500_require_real_auth_for_administration_writes.sql');
const adsSeparation = read('supabase/migrations/20260824043251_separate_ads_from_notices.sql');
const integration = read('scripts/test_db_integration.js');
const ci = read('.github/workflows/ci.yml');

must(orders.includes("estado_servicio === 'suspendido_mora'"), 'UI legacy reconoce suspendido_mora');
must(orders.includes("estado_servicio === 'suspendido_pago'"), 'UI legacy reconoce suspendido_pago');
must(orders.includes('secureRenderDriverOrdersList'), 'lista legacy delega al radar seguro');
must(privacy.includes("'suspendido_mora'"), 'radar seguro reconoce suspendido_mora');
must(privacy.includes("'suspendido_pago'"), 'radar seguro reconoce suspendido_pago');
must(privacy.includes('driverCanTakeOrders'), 'radar controla permiso de tomar pedidos');
must(/tomarPedidoDesdeZonaPrivada\s*=\s*async/.test(privacy), 'acción Tomar revalida estado en servidor');
must(/if \(!access\.canTake\)/.test(privacy), 'acción Tomar se detiene para cuentas suspendidas');
must(/Cuenta suspendida para nuevos pedidos/.test(privacy), 'lista segura informa suspensión sin ocultar pedidos asignados');
must(/const takeButton = access\.canTake/.test(privacy), 'lista segura oculta botón Tomar al suspendido');

must(/Canonical deployment/i.test(readme), 'README usa migraciones como fuente canónica');
must(/intentionally deprecated/i.test(readme), 'README marca snapshot obsoleto');
must(/RAISE EXCEPTION/i.test(snapshot) && /obsoleto/i.test(snapshot), 'snapshot obsoleto falla de forma segura');
must(/is_admin_email\(\).*FROM PUBLIC, anon/is.test(migration), 'helper admin no es endpoint anónimo');
must(/is_banned\(\).*FROM PUBLIC, anon/is.test(migration), 'helper de bloqueo no es endpoint anónimo');
must(/is_current_enabled_driver\(text,text\).*FROM PUBLIC, anon/is.test(migration), 'helper de repartidor no es endpoint anónimo');
must(/Alcanzaste tu límite de crédito: % pedidos cobrables \/ S\/ %/i.test(migration), 'mensaje de crédito es dinámico');
must(/DROP POLICY IF EXISTS "Lectura publica repartidores"/i.test(legacyDrivers), 'tabla repartidores legacy ya no es pública');
must(/REVOKE ALL ON public\.repartidores FROM PUBLIC, anon, authenticated/i.test(legacyDrivers), 'teléfono/placa legacy quedan cerrados');

must(/private\.is_admin_email_internal/i.test(hardening), 'autorización admin privilegiada vive fuera del API público');
must(/public\.is_admin_email\(\)[\s\S]*SECURITY INVOKER/i.test(hardening), 'wrapper admin público usa privilegios del invocador');
must(/internal_pre_auth\.check_device_block/i.test(hardening), 'chequeo de dispositivo privilegiado vive en esquema no expuesto');
must(/rpc_verificar_bloqueo_dispositivo[\s\S]*SECURITY INVOKER/i.test(hardening), 'RPC pre-registro público deja de ser SECURITY DEFINER');
must(/DROP FUNCTION IF EXISTS public\.rpc_verificar_bloqueo_dispositivo\(text, text, text, text\)/i.test(hardening), 'sobrecarga legacy de bloqueo queda eliminada');
must(/REVOKE ALL ON TABLE public\.mensajes_foro FROM anon, authenticated/i.test(hardening), 'tabla legacy mensajes_foro queda cerrada');
must(/REVOKE ALL ON TABLE public\.publicaciones FROM anon, authenticated/i.test(hardening), 'tabla legacy publicaciones queda cerrada');
must(/ALTER DEFAULT PRIVILEGES[\s\S]*REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i.test(hardening), 'funciones futuras no nacen como RPC públicos');
must(/config_pagos_service_access/i.test(hardening), 'config_pagos documenta acceso RPC-only');

for (const policy of [
  'anuncios_admin_insert', 'anuncios_admin_update', 'anuncios_admin_delete',
  'anuncios_nativos_insert', 'anuncios_nativos_update', 'anuncios_nativos_delete',
  'config_publicidad_insert', 'config_publicidad_update', 'config_publicidad_delete',
  'storage_anuncios_admin_insert', 'storage_anuncios_admin_update', 'storage_anuncios_admin_delete'
]) {
  must(adminWrites.includes(policy), `escritura administrativa ${policy} queda redefinida`);
}
must((adminWrites.match(/is_anonymous/g) || []).length >= 12, 'todas las escrituras administrativas exigen sesión no anónima');
must(/CREATE POLICY "storage_anuncios_read"[\s\S]*FOR SELECT TO public/i.test(adsSeparation), 'lectura pública de media publicitaria se conserva');

for (const required of [
  '20260911020205_preprod_states_routes_privacy.sql',
  '20260911020222_preprod_public_views_privacy.sql',
  '20260911020236_preprod_payment_configuration.sql',
  '20260911020258_preprod_ocr_fail_closed.sql',
  '20260911020308_preprod_remove_legacy_premium_rpcs.sql',
  '20260911211132_preprod_financial_rls_reconcile.sql',
  '20260911211150_preprod_roles_insert_rls_reconcile.sql',
  '20260911211159_preprod_roles_update_rls_reconcile.sql',
  '20260911211211_preprod_roles_delete_rls_reconcile.sql',
  '20260911211400_require_real_auth_for_denuncias_insert.sql',
  '20260911211410_require_real_auth_for_spam_reports.sql',
  '20260911211419_require_real_auth_for_rate_limits.sql',
  '20260911211430_require_real_auth_for_banned_admin.sql',
  '20260911211439_require_real_auth_for_vote_records.sql',
  '20260913003000_security_surface_hardening.sql',
  '20260913004500_require_real_auth_for_administration_writes.sql'
]) {
  must(exists(`supabase/migrations/${required}`), `Git contiene migración remota ${required}`);
}

must(integration.includes('order_public_radar'), 'integración verifica radar');
must(integration.includes('rpc_get_driver_available_orders'), 'integración verifica RPC legacy revocado');
must(integration.includes('mensajes_foro'), 'integración verifica cierre de mensajes_foro');
must(integration.includes('publicaciones'), 'integración verifica cierre de publicaciones');
must(integration.includes('telefono_bloqueado'), 'integración verifica que RPC pre-registro no filtre coincidencias');
must(ci.includes('Verify Live Supabase Public Boundary'), 'CI ejecuta integración real');
must(ci.includes('Verify Final Preproduction Guardrails'), 'CI ejecuta guardrail final');

console.log('Preproducción: guardrail final OK');
