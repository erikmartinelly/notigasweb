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
  assertNo('js/map.js', /PRO_BUYER_ADVANTAGE_MS|1 Minuto de Ventaja para Repartidores PRO/i, 'Quedó ventaja PRO en mapa');
  assertNo('js/voucher_ocr.js', /\.rpc\(\s*['"](?:rpc_registrar_ocr_pago|rpc_driver_submit_premium_payment)['"]|\.from\(\s*['"]vouchers-premium['"]/, 'OCR genérico todavía escribe pagos o Premium');

  for (const p of ['js/driver_payments.js','js/admin_payments.js']) {
    assertNo(p, /Bolivia|bolivian|\bBOB\b|monto_recibido_bob|Yape Bolivia/i, 'Quedó lógica activa Bolivia/BOB en pagos');
  }
  assertHas('js/driver_payments.js', /p_monto_enviado_pen/, 'Falta monto PEN en contrato OCR vigente');
  assertHas('js/driver_payments.js', /100 pedidos \(S\/ 20\)/, 'La interfaz no explica 100 pedidos = S/ 20');
  assertHas('js/driver_payments.js', /9\[0-9\]\{8\}/, 'El OCR no reconoce número Yape Perú de 9 dígitos');

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
  if (!migrationNames.some(n => n.includes('credit_suspension_identifiers_and_reconciliation'))) {
    fail('Falta migración final de reconciliación Git/Supabase');
  }

  console.log('✅ Audit hardening invariants OK');
} catch (err) {
  console.error('❌ Audit hardening check:', err.message);
  process.exit(1);
}