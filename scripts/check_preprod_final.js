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
const legacyCleanup = read('supabase/migrations/20260910182449_legacy_cleanup_retention_and_privileges.sql');
const hardening = read('supabase/migrations/20260913003000_security_surface_hardening.sql');
const adminWrites = read('supabase/migrations/20260913004500_require_real_auth_for_administration_writes.sql');
const recheck = read('supabase/migrations/20260913085148_recheck_retention_and_internal_rpc.sql');
const forumIntegrity = read('supabase/migrations/20260913190218_fix_forum_vote_integrity.sql');
const contentGuard = read('supabase/migrations/20260913190239_fix_content_guard_and_report_identity.sql');
const guardReconcile = read('supabase/migrations/20260913190352_reconcile_content_guard_definition.sql');
const noticeRpc = read('supabase/migrations/20260913190817_fix_notice_rpc_current_schema.sql');
const deleteAccount = read('supabase/migrations/20260913191235_fix_delete_account_current_schema.sql');
const splitGuards = read('supabase/migrations/20260913191441_split_content_guards_by_table.sql');
const adsSeparation = read('supabase/migrations/20260824043251_separate_ads_from_notices.sql');
const integration = read('scripts/test_db_integration.js');
const ci = read('.github/workflows/ci.yml');
const server = read('server.js');
const adminPaymentConfig = read('js/admin_payment_config.js');

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

must(/CREATE OR REPLACE FUNCTION public\.rpc_purge_old_records/i.test(legacyCleanup), 'migración histórica legacy_cleanup contiene el SQL remoto real');
must(/CREATE OR REPLACE FUNCTION public\.delete_user_account/i.test(legacyCleanup), 'migración histórica conserva borrado de cuenta aplicado');
must(/180 days/i.test(legacyCleanup), 'migración histórica conserva retención de archivo aplicada');

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
]) must(adminWrites.includes(policy), `escritura administrativa ${policy} queda redefinida`);
must((adminWrites.match(/is_anonymous/g) || []).length >= 12, 'todas las escrituras administrativas exigen sesión no anónima');
must(/CREATE POLICY "storage_anuncios_read"[\s\S]*FOR SELECT TO public/i.test(adsSeparation), 'lectura pública de media publicitaria se conserva');

must((recheck.match(/interval '24 hours'/g) || []).length >= 5, 'purga final usa contrato de 24 horas');
must(/'entregado','cancelado','recibido'/i.test(recheck), 'purga final contempla todos los estados terminales');
must(/trg_estado_pago_ocr_automatico\(\).*FROM PUBLIC, anon, authenticated/is.test(recheck), 'trigger OCR interno no queda expuesto como RPC');
must(/rpc_purge_old_records\(\).*FROM PUBLIC, anon, authenticated/is.test(recheck), 'purga administrativa no queda expuesta al cliente');

must(/ADD COLUMN IF NOT EXISTS valor smallint/i.test(forumIntegrity), 'ledger de votos guarda el sentido del voto');
must(/CHECK \(valor IN \(-1, 1\)\)/i.test(forumIntegrity), 'valor de voto solo admite -1 o +1');
must(/sync_forum_vote_ledger_internal/i.test(forumIntegrity), 'altas y borrados del muro sincronizan el ledger');
must((forumIntegrity.match(/is_anonymous/g) || []).length >= 2, 'RPCs de voto rechazan sesiones anónimas');
must(/IF v_old = v_new THEN RETURN;/i.test(forumIntegrity), 'repetir el mismo voto es idempotente');
must(/SUM\(valor\)/i.test(forumIntegrity), 'contador se recalcula desde el ledger y no deriva por decrementos repetidos');

must(/TG_TABLE_NAME = 'denuncias'[\s\S]*NEW\.motivo[\s\S]*NEW\.detalles/i.test(contentGuard), 'migración intermedia corrigió columnas de denuncias');
must(/TG_TABLE_NAME = 'reportes_spam'[\s\S]*NEW\.motivo[\s\S]*NEW\.texto/i.test(contentGuard), 'migración intermedia corrigió columnas anti-spam');
must(/user_id = auth\.uid\(\)::text[\s\S]*denunciante_id = auth\.uid\(\)::text/i.test(contentGuard), 'denuncias fijan identidad real del reportante');
must(/reportes_spam_insert[\s\S]*user_id = auth\.uid\(\)::text/i.test(contentGuard), 'spam fija identidad real del reportante');
must(/normalize_delivery_category\(text\).*FROM PUBLIC, anon, authenticated/is.test(contentGuard), 'normalizador interno deja de ser RPC público');
must(/trg_estado_pago_ocr_automatico\(\).*FROM PUBLIC, anon, authenticated/is.test(contentGuard), 'trigger OCR conserva cierre explícito');
must(/NEW\.direccion := LEFT\(REGEXP_REPLACE\(COALESCE\(NEW\.direccion, ''\), '<\[\^>\]\*>', '', 'g'\)/i.test(guardReconcile), 'reconciliación sanea HTML de dirección');

must(/CREATE OR REPLACE FUNCTION public\.rpc_crear_aviso_vecinal/i.test(noticeRpc), 'RPC de publicación vecinal queda versionado');
must(/INSERT INTO public\.avisos\([\s\S]*mensaje, activo, votos, created_at/i.test(noticeRpc), 'RPC de aviso usa las columnas actuales');
must(!/imagen_url/i.test(noticeRpc), 'RPC de aviso no referencia columna eliminada imagen_url');
must(/is_anonymous/i.test(noticeRpc), 'RPC de aviso exige sesión real');

must(/CREATE OR REPLACE FUNCTION public\.delete_user_account/i.test(deleteAccount), 'borrado total de cuenta queda reconciliado');
must(!/anuncios_globales\s+WHERE\s+user_id/i.test(deleteAccount), 'borrado de cuenta no referencia user_id inexistente en anuncios');
must(/is_anonymous/i.test(deleteAccount), 'borrado de cuenta exige sesión real');
must(/DELETE FROM public\.usuarios_baneados[\s\S]*permanente,false\)=false/i.test(deleteAccount), 'borrado conserva bloqueos permanentes antifraude');

for (const fn of [
  'guard_avisos_insert_internal',
  'guard_comentarios_insert_internal',
  'guard_votos_insert_internal',
  'guard_denuncias_insert_internal',
  'guard_reportes_spam_insert_internal',
  'guard_driver_registration_insert_internal',
  'guard_driver_route_insert_internal'
]) {
  must(splitGuards.includes(`private.${fn}`), `guard privado ${fn} queda definido`);
  must(new RegExp(`REVOKE ALL ON FUNCTION private\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated, service_role`, 'i').test(splitGuards), `${fn} no es RPC de cliente`);
}
must(/DROP FUNCTION IF EXISTS public\.guard_limited_content_insert\(\)/i.test(splitGuards), 'guard heterogéneo defectuoso queda eliminado');
must((splitGuards.match(/EXECUTE FUNCTION private\.guard_/g) || []).length === 7, 'los siete triggers usan guards tipados privados');

must(server.includes(".replace('🌍 Todos', '🌍 Todos')"), 'servidor corrige mojibake visible del filtro Todos');
must(/express\.static\(__dirname,\s*\{[\s\S]*?index:\s*false[\s\S]*?maxAge:\s*STATIC_CACHE_MAX_AGE_MS/.test(server), 'index se sirve por ruta saneada y estáticos usan cache explícito');
must(/stale-while-revalidate=86400/.test(server), 'servidor permite reutilizar estáticos mientras revalida en segundo plano');
must(adminPaymentConfig.includes('window.rechazarSuscripcionPremiumAdmin = retired'), 'rechazo Premium legacy ya no llama RPC eliminado');

for (const required of [
  '20260910182449_legacy_cleanup_retention_and_privileges.sql',
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
  '20260913004500_require_real_auth_for_administration_writes.sql',
  '20260913043142_optimize_security_rls_initplans.sql',
  '20260913044520_revoke_anon_internal_table_reads.sql',
  '20260913085148_recheck_retention_and_internal_rpc.sql',
  '20260913190218_fix_forum_vote_integrity.sql',
  '20260913190239_fix_content_guard_and_report_identity.sql',
  '20260913190352_reconcile_content_guard_definition.sql',
  '20260913190817_fix_notice_rpc_current_schema.sql',
  '20260913191235_fix_delete_account_current_schema.sql',
  '20260913191441_split_content_guards_by_table.sql'
]) must(exists(`supabase/migrations/${required}`), `Git contiene migración remota ${required}`);

must(integration.includes('order_public_radar'), 'integración verifica radar');
must(integration.includes('rpc_get_driver_available_orders'), 'integración verifica RPC legacy revocado');
must(integration.includes('mensajes_foro'), 'integración verifica cierre de mensajes_foro');
must(integration.includes('publicaciones'), 'integración verifica cierre de publicaciones');
must(integration.includes('telefono_bloqueado'), 'integración verifica que RPC pre-registro no filtre coincidencias');
must(integration.includes('normalize_delivery_category'), 'integración verifica cierre del normalizador interno');
must(ci.includes('Verify Live Supabase Public Boundary'), 'CI ejecuta integración real');
must(ci.includes('Verify Final Preproduction Guardrails'), 'CI ejecuta guardrail final');
must(ci.includes('actions/checkout@v7'), 'CI usa checkout con runtime actual');
must(ci.includes('actions/setup-node@v7'), 'CI usa setup-node con runtime actual');
must(ci.includes('pnpm/action-setup@v6'), 'CI usa pnpm action actual');
must(ci.includes("grep -q '🌍 Todos'"), 'CI verifica el HTML realmente servido');

console.log('Preproducción: guardrail final OK');
