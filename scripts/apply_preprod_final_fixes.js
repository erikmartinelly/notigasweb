#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, 'utf8');
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

function replaceOnce(text, from, to, label) {
  must(text.includes(from), `No se encontró bloque esperado: ${label}`);
  return text.replace(from, to);
}

{
  const p = 'js/state.js';
  let s = read(p);
  s = s.replace("window.NOTIGAS.CACHE_VERSION = '132';", "window.NOTIGAS.CACHE_VERSION = '134';");
  const needle = "  if (typeof window.renderAdminPaymentsReview !== 'function') {\n    await window.loadScriptAsync('js/admin_payments.js');\n  }";
  const replacement = `${needle}\n  if (typeof window.ensureAdminPaymentConfigPanel !== 'function') {\n    await window.loadScriptAsync('js/admin_payment_config.js');\n  }\n  if (typeof window.wrapAdminPaymentsWithConfig === 'function') window.wrapAdminPaymentsWithConfig();`;
  s = replaceOnce(s, needle, replacement, 'state admin payment config loader');
  write(p, s);
}

{
  const p = 'sw.js';
  let s = read(p).replace(/v133/g, 'v134').replace(/\?v=132/g, '?v=134').replace(/\?v=133/g, '?v=134');
  if (!s.includes("./js/admin_payment_config.js?v=134")) {
    s = replaceOnce(s, "  './js/admin_payments.js?v=134',", "  './js/admin_payments.js?v=134',\n  './js/admin_payment_config.js?v=134',", 'SW admin payment config asset');
  }
  write(p, s);
}

{
  const p = 'index.html';
  let s = read(p).replace(/\?v=133/g, '?v=134');
  s = s.replace(/Cargando suscripciones premium\.\.\./gi, 'Cargando pagos de repartidores...');
  s = s.replace(/\bOTB\b/g, 'zona');
  write(p, s);
}

{
  const p = 'manifest.json';
  const obj = JSON.parse(read(p));
  obj.description = 'Plataforma vecinal en vivo con mapa GPS, mini páginas de negocio para repartidores y avisos de la zona.';
  write(p, JSON.stringify(obj, null, 2) + '\n');
}

{
  const p = 'js/driver_payments.js';
  let s = read(p);
  s = replaceOnce(
    s,
    "          Método: <strong>${esc(instructionsRes.metodo_entrega || 'Yape')}</strong><br>\n          Número Yape: <strong>${esc(yapeDestino)}</strong>",
    "          Método: <strong>${esc(instructionsRes.metodo_entrega || 'Yape')}</strong><br>\n          Beneficiario: <strong>${esc(instructionsRes.beneficiario_nombre || '—')}</strong><br>\n          Número Yape: <strong>${esc(yapeDestino)}</strong>",
    'driver payment beneficiary display'
  );
  s = replaceOnce(
    s,
    "          if (!dateIso) missing.push('fecha y hora');\n          if (missing.length) {",
    "          if (!dateIso) missing.push('fecha y hora');\n          if (!recipientName) missing.push('nombre del destinatario');\n          if (!recipientYape) missing.push('Yape del destinatario');\n          if (missing.length) {",
    'driver payment strict recipient OCR'
  );
  write(p, s);
}

{
  const p = 'js/admin.js';
  let s = read(p);
  const startMatch = /async\s+function\s+renderAdminPremiumSubscriptions\s*\(\s*\)\s*\{/.exec(s);
  const endMatch = /async\s+function\s+renderAdminOrdersList\s*\(\s*\)\s*\{/.exec(s);
  must(startMatch && endMatch && endMatch.index > startMatch.index, 'No se pudo localizar el bloque Premium de admin.js');
  const start = startMatch.index;
  const ordersStart = endMatch.index;
  const shim = `async function renderAdminPremiumSubscriptions() {\n  if (typeof window.renderAdminPaymentsReview === 'function') {\n    return window.renderAdminPaymentsReview();\n  }\n  const container = document.getElementById('adminPremiumSubscriptionsContainer');\n  if (container) container.innerHTML = '<div style="color:#94A3B8;text-align:center;padding:20px;">Cargando pagos...</div>';\n}\nwindow.renderAdminPremiumSubscriptions = renderAdminPremiumSubscriptions;\n\n/* INSPECCIÓN Y ELIMINACIÓN DE PEDIDOS PARA EL ADMINISTRADOR */\n\n`;
  s = s.slice(0, start) + shim + s.slice(ordersStart);
  s = s.replace("      'premium': 3,\n      'vip': 3,", "      'pagos': 3,");
  s = s.replace(/\bOTB\b/g, 'zona');
  write(p, s);
}

{
  const p = 'js/auth.js';
  let s = read(p);
  s = s.replace(', es_premium, premium_vence_at, estado_pago_premium, comprobante_pago_url, tipo_plan, comisiones_pendientes', ', comisiones_pendientes');
  s = s.replace(', es_premium, premium_vence_at, estado_pago_premium, comprobante_pago_url, tipo_plan', '');
  write(p, s);
}

{
  const p = 'scripts/check_runtime.js';
  let s = read(p);
  if (!s.includes("'js/admin_payment_config.js'")) {
    s = replaceOnce(s, "  'js/admin_payments.js',", "  'js/admin_payments.js',\n  'js/admin_payment_config.js',", 'runtime admin payment config');
  }
  write(p, s);
}

{
  const p = 'package.json';
  const obj = JSON.parse(read(p));
  obj.dependencies = obj.dependencies || {};
  obj.dependencies.express = '^4.22.2';
  obj.packageManager = 'pnpm@10.15.0';
  const fullTest = 'node scripts/check_syntax.js && node scripts/check_runtime.js && node scripts/test_rls_security.js && node scripts/check_audit_hardening.js && node scripts/test_driver_plans.js && python3 test_financial_parameters.py';
  obj.scripts.test = fullTest;
  obj.scripts.build = fullTest;
  write(p, JSON.stringify(obj, null, 2) + '\n');

  const lock = 'pnpm-lock.yaml';
  let l = read(lock);
  l = l.replace('specifier: ^4.19.2', 'specifier: ^4.22.2');
  must(l.includes('specifier: ^4.22.2'), 'No se actualizó specifier de Express en pnpm-lock');
  write(lock, l);
}

{
  const p = '.github/workflows/ci.yml';
  let s = read(p);
  if (!s.includes('pnpm/action-setup@v4')) {
    const needle = "      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n";
    const extra = `${needle}\n      - name: Setup pnpm\n        uses: pnpm/action-setup@v4\n        with:\n          version: 10.15.0\n\n      - name: Install dependencies (frozen lockfile)\n        run: pnpm install --frozen-lockfile\n\n      - name: Smoke test HTTP server\n        run: |\n          node server.js > /tmp/notigas-server.log 2>&1 &\n          PID=$!\n          trap 'kill $PID || true' EXIT\n          for i in {1..20}; do\n            if curl -fsS http://127.0.0.1:3000/health | grep -q '^OK$'; then exit 0; fi\n            sleep 0.5\n          done\n          cat /tmp/notigas-server.log\n          exit 1\n`;
    s = replaceOnce(s, needle, extra, 'CI dependency/smoke steps');
  }
  write(p, s);
}

{
  const p = 'scripts/check_audit_hardening.js';
  let s = read(p).replace(/!== '133'/g, "!== '134'").replace(/notigas-cache-v133/g, 'notigas-cache-v134').replace(/cache v132/g, 'cache v134');
  if (!s.includes('admin_payment_config.js')) {
    s = replaceOnce(s, "for (const mod of ['js/admin_payments.js','js/driver_payments.js','js/driver_order_rules.js'])", "for (const mod of ['js/admin_payments.js','js/admin_payment_config.js','js/driver_payments.js','js/driver_order_rules.js'])", 'hardening runtime modules');
  }
  const anchor = "  assertHas('js/driver_payments.js', /p_monto_enviado_pen/, 'Falta monto PEN en contrato OCR');";
  if (!s.includes('OCR cliente no exige nombre del destinatario')) {
    s = replaceOnce(s, anchor, `${anchor}\n  assertHas('js/driver_payments.js', /missing\.push\('nombre del destinatario'\)/, 'OCR cliente no exige nombre del destinatario');\n  assertHas('js/driver_payments.js', /missing\.push\('Yape del destinatario'\)/, 'OCR cliente no exige Yape del destinatario');\n  assertNo('js/admin.js', /rpc_admin_verify_premium_payment|S\/\s*15\.00|aprobarSuscripcionPremiumAdmin|revocarSuscripcionPremiumAdmin/i, 'Admin conserva flujo Premium/S15');`, 'hardening strict OCR/admin legacy');
  }
  const migrationAnchor = "    '20260910234110_make_payment_suspensions_reversible_on_full_payment.sql'";
  if (!s.includes('20260911011500_preprod_security_payment_hardening.sql')) {
    s = replaceOnce(s, migrationAnchor, `${migrationAnchor},\n    '20260911011500_preprod_security_payment_hardening.sql'`, 'hardening migration list');
  }
  const beforeLog = "  console.log('✅ Audit hardening invariants OK: 50 gratis, crédito S/20 -> S/50 -> S/100');";
  if (!s.includes("const preprod = read('supabase/migrations/20260911011500_preprod_security_payment_hardening.sql')")) {
    const checks = `  const preprod = read('supabase/migrations/20260911011500_preprod_security_payment_hardening.sql');\n  if (!/suspendido_mora/.test(preprod) || !/suspendido_pago/.test(preprod)) fail('Migración final no permite estados reversibles de suspensión');\n  if (!/rutas_select_own_or_admin/.test(preprod)) fail('Migración final no restringe tabla base de rutas');\n  if (!/No se detectó el nombre del destinatario/.test(preprod) || !/No se detectó un Yape destinatario válido/.test(preprod)) fail('RPC OCR no falla cerrado ante destinatario incompleto');\n  if (!/987654321/.test(preprod) || !/numero_cuenta = NULL/.test(preprod)) fail('Placeholder Yape no se invalida');\n  assertHas('js/admin_payment_config.js', /rpc_admin_set_payment_config/, 'No existe configuración administrativa segura del receptor Yape');\n\n${beforeLog}`;
    s = replaceOnce(s, beforeLog, checks, 'hardening preprod migration checks');
  }
  write(p, s);
}

const admin = read('js/admin.js');
must(!/rpc_admin_verify_premium_payment|S\/\s*15\.00|aprobarSuscripcionPremiumAdmin|revocarSuscripcionPremiumAdmin/i.test(admin), 'Quedó flujo Premium en admin.js');
must(/CACHE_VERSION = '134'/.test(read('js/state.js')), 'state.js no quedó en v134');
must(/notigas-cache-v134/.test(read('sw.js')) && !/\?v=132|\?v=133/.test(read('sw.js')), 'SW conserva assets de otra versión');
must(!/Cargando suscripciones premium/i.test(read('index.html')), 'index conserva texto Premium');
must(!/noticias de la OTB/i.test(read('manifest.json')), 'manifest conserva OTB visible');
console.log('✅ Transformación preproducción aplicada');
