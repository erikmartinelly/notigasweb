#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (m) => { throw new Error(m); };
const assertNo = (p, re, label) => { const t = read(p); if (re.test(t)) fail(`${label}: ${p}`); };
const assertHas = (p, re, label) => { const t = read(p); if (!re.test(t)) fail(`${label}: ${p}`); };

try {
  assertNo('js/device_security.js', /document\.cookie\s*=\s*\$\{/, 'Device security contiene template literal inválido');
  assertNo('js/promo.js', /59170000000|\+591|wa\.me\/591/, 'Quedó un fallback telefónico boliviano');
  assertNo('js/orders.js', /PRO_ORDER_ADVANTAGE_MS|3 minutos de ventaja|Plan PRO \(S\/ 15\/mes\)/i, 'Quedó ventaja PRO en pedidos');
  assertNo('js/orders.js', /S\/\s*1\.00\s+de\s+comisi[oó]n|Comisi[oó]n\s+fija\s+de\s+S\/\s*1\.00|S\/\s*50\.00|primeros\s+20\s+pedidos\s+confirmados\s+no\s+generan\s+comisi[oó]n|promo_pedidos_gratis_(?:total|usados)/i, 'orders.js conserva el contrato financiero antiguo');
  assertNo('index.html', /Comisi[oó]n\s+fija\s+de\s+S\/\s*1\.00\s+por\s+bal[oó]n|L[ií]mite\s+de\s+cr[eé]dito:\s*<strong>S\/\s*50\.00|onclick=["']ejecutar(?:CorteSemanal|BaneoSemanal)ManualAdmin\(\)["']/i, 'index.html conserva controles o textos financieros antiguos');
  assertNo('js/map.js', /PRO_BUYER_ADVANTAGE_MS|1 Minuto de Ventaja para Repartidores PRO/i, 'Quedó ventaja PRO en mapa');
  assertNo('js/voucher_ocr.js', /\.rpc\(\s*['"](?:rpc_registrar_ocr_pago|rpc_driver_submit_premium_payment)['"]|\.from\(\s*['"]vouchers-premium['"]/, 'OCR genérico todavía escribe pagos o Premium');

  for (const p of ['js/driver_payments.js','js/admin_payments.js']) {
    assertNo(p, /Bolivia|bolivian|\bBOB\b|monto_recibido_bob|Yape Bolivia/i, 'Quedó lógica activa Bolivia/BOB en pagos');
  }
  assertHas('js/driver_payments.js', /p_monto_enviado_pen/, 'Falta monto PEN en contrato OCR vigente');
  assertHas('js/driver_payments.js', /100 pedidos \(S\/ 20\)/, 'La interfaz no explica 100 pedidos = S/ 20');
  assertHas('js/driver_payments.js', /9\[0-9\]\{8\}/, 'El OCR no reconoce número Yape Perú de 9 dígitos');

  assertNo('js/driver_order_rules.js', /20\s+PEDIDOS\s+GRATIS|primeros\s+20\s+pedidos|penalizaci[oó]n\s+de\s+S\/\s*0[.,]10|100\s+botellones/i, 'Reglas del repartidor conservan el modelo financiero anterior');
  assertHas('js/driver_order_rules.js', /S\/\s*0\.20\s+por\s+cada\s+pedido\s+entregado/i, 'Falta comisión de S/ 0.20 por pedido entregado');
  assertHas('js/driver_order_rules.js', /100\s+pedidos[\s\S]{0,80}S\/\s*20/i, 'Falta regla 100 pedidos = S/ 20');
  assertHas('js/driver_order_rules.js', /no\s+genera\s+comisi[oó]n\s+ni\s+modifica\s+tu\s+saldo/i, 'Liberar pedido todavía puede parecer un cargo');
  assertHas('js/driver_order_rules.js', /normalizeLegacyPlanCopy/, 'No se neutraliza el texto HTML legado del Plan PRO');
  assertHas('js/driver_order_rules.js', /normalizeLegacyFinancialCopy/, 'No se neutraliza el texto financiero heredado');
  assertHas('js/driver_order_rules.js', /confirmarEntregaPedidoActual/, 'No se reemplaza la confirmación de entrega heredada');
  assertHas('js/driver_order_rules.js', /pedidos_credito_ciclo/, 'La UI no usa el contador vigente de pedidos');
  assertHas('js/driver_order_rules.js', /limite_pedidos_credito/, 'La UI no usa el límite vigente de pedidos');

  assertNo('js/admin_users.js', /Falta de pago de comisi[oó]n\s*\(S\/\s*1 por bal[oó]n\)|\.rpc\(\s*['"]rpc_ejecutar_(?:corte_semanal_comisiones|baneo_semanal_morosos)['"]/i, 'Administración conserva acciones financieras semanales o motivo S/1 obsoleto');
  assertHas('js/admin_users.js', /p_motivo:\s*['"]Suspensión administrativa['"]/, 'Baneo administrativo no usa motivo neutral vigente');
  assertHas('js/admin_users.js', /estado_servicio:\s*['"]activo['"]/, 'Desbloqueo administrativo no restaura el estado operativo');

  assertHas('js/supabase-config.js', /reconciliación de snapshot falló/i, 'Realtime no reconcilia snapshot después de reconectar');
  assertHas('.htaccess', /worker-src 'self' blob:/, 'CSP Apache no permite el worker OCR');

  const runtimeFiles = ['index.html','js/app.js','js/auth.js','js/forum.js','js/vendors.js','js/admin.js','js/orders.js','js/map.js','js/supabase-config.js','scripts/check_runtime.js'];
  for (const p of runtimeFiles) assertNo(p, /Cochabamba|COCHABAMBA/, 'Residuo activo de Cochabamba');
  assertNo('README.md', /The Origin: Bolivia|YPFB|state monopoly/i, 'README conserva el modelo boliviano como descripción vigente');

  const index = read('index.html');
  const htmlVersions = [...index.matchAll(/(?:styles|js)\/[^"']+\?v=(\d+)/g)].map(m => m[1]);
  if (!htmlVersions.length) fail('No se detectaron assets versionados en index.html');
  const uniqueHtmlVersions = [...new Set(htmlVersions)];
  if (uniqueHtmlVersions.length !== 1 || uniqueHtmlVersions[0] !== '130') {
    fail(`Versiones de assets mezcladas en index.html: ${uniqueHtmlVersions.join(',')}`);
  }

  const sw = read('sw.js');
  if (!/notigas-cache-v131/.test(sw)) fail('Service worker no fuerza renovación de caché v131');
  if (!/fetch\(asset, \{ cache: 'reload' \}\)/.test(sw)) fail('Service worker no fuerza recarga de assets en instalación');

  const runtime = read('scripts/check_runtime.js');
  for (const mod of ['js/admin_payments.js','js/driver_payments.js','js/driver_order_rules.js']) {
    if (!runtime.includes(`'${mod}'`)) fail(`Runtime test no carga ${mod}`);
  }

  const migrationDir = path.join(root, 'supabase', 'migrations');
  const migrationNames = fs.readdirSync(migrationDir);
  for (const required of [
    '20260910192243_credit_suspension_identifiers_and_reconciliation.sql',
    '20260910205311_fix_device_block_rpc_overload_ambiguity_v2.sql',
    '20260910205729_remove_release_penalty_align_credit_contract.sql',
    '20260910220052_remove_obsolete_weekly_financial_rpcs.sql'
  ]) {
    if (!migrationNames.includes(required)) fail(`Falta migración crítica: ${required}`);
  }

  const legacyHardware = read('supabase/migrations/20260908005000_device_id_dni_hardware_ban.sql');
  if (/rpc_banear_repartidor_completo|S\/\s*1\b/i.test(legacyHardware)) {
    fail('La migración histórica de hardware reintroduce lógica financiera/baneo obsoleta');
  }
  if (!/device_fingerprint/.test(legacyHardware)) fail('La migración histórica de hardware perdió su estructura base');

  const legacyFinance = read('supabase/migrations/20260908010000_financial_commission_rules.sql');
  if (/S\/\s*1\.00|S\/\s*50\.00|rpc_ejecutar_corte_semanal_comisiones|rpc_ejecutar_baneo_semanal_morosos/i.test(legacyFinance)) {
    fail('La migración financiera histórica reintroduce el contrato S/1-S/50 o procesos semanales');
  }
  if (!/DEFAULT\s+20\.00/i.test(legacyFinance) || !/DEFAULT\s+0\.20/i.test(legacyFinance)) {
    fail('La migración financiera histórica no conserva los defaults S/20 y S/0.20');
  }

  const overloadFix = read('supabase/migrations/20260910205311_fix_device_block_rpc_overload_ambiguity_v2.sql');
  if (/p_telefono\s+text\s+DEFAULT/i.test(overloadFix)) fail('La sobrecarga de 5 argumentos vuelve a tener defaults ambiguos');
  if (!/NEW\.telefono_whatsapp/.test(overloadFix)) fail('El trigger de bloqueo no valida teléfono');

  const releaseFix = read('supabase/migrations/20260910205729_remove_release_penalty_align_credit_contract.sql');
  if (/penalizacion_cancelacion|v_penalty\s*numeric/i.test(releaseFix)) fail('La migración final reintroduce penalización financiera');
  if (!/'penalizacion',0/.test(releaseFix)) fail('La liberación no conserva compatibilidad explícita con penalización 0');

  const weeklyCleanup = read('supabase/migrations/20260910220052_remove_obsolete_weekly_financial_rpcs.sql');
  if (!/DROP FUNCTION IF EXISTS public\.rpc_ejecutar_corte_semanal_comisiones\(\)/.test(weeklyCleanup)) fail('No se elimina el RPC de corte semanal');
  if (!/DROP FUNCTION IF EXISTS public\.rpc_ejecutar_baneo_semanal_morosos\(\)/.test(weeklyCleanup)) fail('No se elimina el RPC de baneo semanal');
  if (!/NOT public\.is_admin_email\(\)/.test(weeklyCleanup)) fail('El baneo administrativo no comprueba autorización');
  if (!/Suspensión administrativa/.test(weeklyCleanup)) fail('El baneo administrativo conserva un motivo financiero obsoleto');
  if (!/REVOKE ALL ON FUNCTION public\.rpc_banear_repartidor_completo/.test(weeklyCleanup)) fail('El RPC de baneo no revoca ejecución pública');

  console.log('✅ Audit hardening invariants OK');
} catch (err) {
  console.error('❌ Audit hardening check:', err.message);
  process.exit(1);
}
