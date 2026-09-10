#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (m) => { throw new Error(m); };
const assertNo = (p, re, label) => { if (re.test(read(p))) fail(`${label}: ${p}`); };
const assertHas = (p, re, label) => { if (!re.test(read(p))) fail(`${label}: ${p}`); };

try {
  // Seguridad base.
  assertNo('js/device_security.js', /document\.cookie\s*=\s*\$\{/, 'Device security contiene JavaScript inválido');
  assertNo('js/promo.js', /59170000000|\+591|wa\.me\/591/, 'Quedó un fallback telefónico boliviano');
  assertHas('.htaccess', /worker-src 'self' blob:/, 'CSP Apache no permite el worker OCR');
  assertHas('js/supabase-config.js', /reconciliación de snapshot falló/i, 'Realtime no reconcilia después de reconectar');

  // Perú y eliminación efectiva del modelo PRO/VIP.
  assertNo('js/map.js', /PRO_ORDER_ADVANTAGE_MS|PRO_BUYER_ADVANTAGE_MS|isCurrentDriverVip|Ventaja de 3 minutos para repartidores PRO/i, 'Mapa conserva prioridad PRO');
  assertNo('js/vendors.js', /Prioridad para repartidores PRO/i, 'Directorio conserva ordenamiento PRO');
  assertNo('js/auth.js', /Puedes pasar a PRO|Repartidor PRO Activado|3 minutos de ventaja en pedidos/i, 'Auth conserva promoción PRO');
  assertNo('index.html', /S\/\s*15(?:\.00)?(?:\s*PEN|\s*\/\s*mes|\/mes)|Ventaja de 3 Minutos en Pedidos|Baneo Definitivo de Dispositivo|Corte Semanal:/i, 'Registro o términos conservan contrato PRO/S15/semanal');

  // Contrato financiero vigente.
  for (const p of ['index.html', 'js/driver_order_rules.js', 'js/driver_payments.js']) {
    assertHas(p, /50\s+pedidos/i, 'Falta promoción de 50 pedidos gratis');
    assertHas(p, /S\/\s*0[.,]20/i, 'Falta comisión de S/0.20');
    assertHas(p, /S\/\s*20/i, 'Falta primer límite S/20');
    assertHas(p, /S\/\s*50/i, 'Falta segundo nivel S/50');
    assertHas(p, /S\/\s*100/i, 'Falta tope S/100');
  }
  assertHas('index.html', /Primeros 50 pedidos confirmados gratis/i, 'Aceptación de términos no informa los 50 pedidos gratis');
  assertHas('index.html', /primera remesa confirmada[\s\S]{0,120}S\/\s*50/i, 'Términos no explican la primera remesa');
  assertHas('index.html', /tercera remesa confirmada[\s\S]{0,120}S\/\s*100/i, 'Términos no explican el tope después de la tercera remesa');

  assertHas('js/driver_order_rules.js', /no\s+genera\s+comisi[oó]n\s+ni\s+modifica\s+tu\s+saldo/i, 'Liberar un pedido parece generar cargo');
  assertHas('js/driver_order_rules.js', /pedido_gratis/i, 'La UI de entrega no distingue pedidos promocionales');
  assertHas('js/driver_order_rules.js', /promo_pedidos_gratis_(?:total|usados)/i, 'La UI no consulta el contador promocional');
  assertHas('js/driver_order_rules.js', /remesas_confirmadas/i, 'La UI no conoce el nivel de remesas');

  // OCR de pagos: Perú/PEN, sin almacenamiento Premium.
  for (const p of ['js/driver_payments.js', 'js/admin_payments.js']) {
    assertNo(p, /Bolivia|bolivian|\bBOB\b|monto_recibido_bob|Yape Bolivia/i, 'Pagos conserva lógica Bolivia/BOB');
  }
  assertHas('js/driver_payments.js', /p_monto_enviado_pen/, 'Falta monto PEN en contrato OCR');
  assertHas('js/driver_payments.js', /9\[0-9\]\{8\}/, 'OCR no reconoce Yape Perú de 9 dígitos');
  assertNo('js/voucher_ocr.js', /\.rpc\(\s*['"](?:rpc_registrar_ocr_pago|rpc_driver_submit_premium_payment)['"]|\.from\(\s*['"]vouchers-premium['"]/, 'OCR genérico todavía persiste pagos o Premium');

  // Administración y baneo.
  assertNo('js/admin_users.js', /Falta de pago de comisi[oó]n\s*\(S\/\s*1 por bal[oó]n\)|\.rpc\(\s*['"]rpc_ejecutar_(?:corte_semanal_comisiones|baneo_semanal_morosos)['"]/i, 'Administración conserva el modelo semanal/S1');
  assertHas('js/admin_users.js', /p_motivo:\s*['"]Suspensión administrativa['"]/, 'Baneo administrativo no usa motivo neutral');
  assertHas('js/admin_users.js', /estado_servicio:\s*['"]activo['"]/, 'Desbloqueo administrativo no restaura estado activo');

  // Localización activa.
  const runtimeFiles = ['index.html','js/app.js','js/auth.js','js/forum.js','js/vendors.js','js/admin.js','js/orders.js','js/map.js','js/supabase-config.js','scripts/check_runtime.js'];
  for (const p of runtimeFiles) assertNo(p, /Cochabamba|COCHABAMBA/, 'Residuo activo de Cochabamba');
  assertNo('README.md', /The Origin: Bolivia|YPFB|state monopoly/i, 'README conserva descripción boliviana vigente');

  // PWA: una sola generación de assets.
  const index = read('index.html');
  const htmlVersions = [...index.matchAll(/(?:styles|js)\/[^"']+\?v=(\d+)/g)].map(m => m[1]);
  if (!htmlVersions.length) fail('No se detectaron assets versionados en index.html');
  const uniqueHtmlVersions = [...new Set(htmlVersions)];
  if (uniqueHtmlVersions.length !== 1 || uniqueHtmlVersions[0] !== '132') {
    fail(`Versiones de assets mezcladas: ${uniqueHtmlVersions.join(',')}`);
  }
  const sw = read('sw.js');
  if (!/notigas-cache-v132/.test(sw)) fail('Service worker no usa cache v132');
  if (!/fetch\(asset, \{ cache: 'reload' \}\)/.test(sw)) fail('Service worker no fuerza recarga durante instalación');

  // Runtime tests deben cargar los módulos críticos.
  const runtime = read('scripts/check_runtime.js');
  for (const mod of ['js/admin_payments.js','js/driver_payments.js','js/driver_order_rules.js']) {
    if (!runtime.includes(`'${mod}'`)) fail(`Runtime test no carga ${mod}`);
  }

  // Migraciones críticas y contrato progresivo reproducible.
  const migrationDir = path.join(root, 'supabase', 'migrations');
  const names = fs.readdirSync(migrationDir);
  for (const required of [
    '20260910192243_credit_suspension_identifiers_and_reconciliation.sql',
    '20260910205311_fix_device_block_rpc_overload_ambiguity_v2.sql',
    '20260910205729_remove_release_penalty_align_credit_contract.sql',
    '20260910220052_remove_obsolete_weekly_financial_rpcs.sql',
    '20260910225938_driver_50_free_and_progressive_credit_tiers.sql'
  ]) {
    if (!names.includes(required)) fail(`Falta migración crítica: ${required}`);
  }

  const tier = read('supabase/migrations/20260910225938_driver_50_free_and_progressive_credit_tiers.sql');
  if (!/promo_pedidos_gratis_total SET DEFAULT 50/i.test(tier)) fail('La migración no fija 50 pedidos gratis');
  if (!/remesas_confirmadas/.test(tier)) fail('La migración no registra remesas confirmadas');
  if (!/p_count,0\) >= 3 THEN 100\.00/.test(tier)) fail('La tercera remesa no eleva el crédito a S/100');
  if (!/p_count,0\) >= 1 THEN 50\.00/.test(tier)) fail('La primera remesa no eleva el crédito a S/50');
  if (!/ELSE 20\.00/.test(tier)) fail('El crédito inicial no es S/20');
  if (!/promo_entrega_gratis/.test(tier)) fail('No existe registro contable para pedidos gratuitos');
  if (!/v_full_payment/.test(tier)) fail('Las remesas parciales podrían subir indebidamente el nivel');

  const legacyFinance = read('supabase/migrations/20260908010000_financial_commission_rules.sql');
  if (/S\/\s*1\.00|S\/\s*50\.00|rpc_ejecutar_corte_semanal_comisiones|rpc_ejecutar_baneo_semanal_morosos/i.test(legacyFinance)) {
    fail('Migración histórica reintroduce S/1-S/50 o procesos semanales');
  }
  const legacyHardware = read('supabase/migrations/20260908005000_device_id_dni_hardware_ban.sql');
  if (/rpc_banear_repartidor_completo|S\/\s*1\b/i.test(legacyHardware)) fail('Migración histórica de hardware reintroduce baneo financiero antiguo');

  console.log('✅ Audit hardening invariants OK: 50 gratis, crédito S/20 -> S/50 -> S/100');
} catch (err) {
  console.error('❌ Audit hardening check:', err.message);
  process.exit(1);
}
