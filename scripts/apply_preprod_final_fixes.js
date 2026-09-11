#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');const write=(p,s)=>fs.writeFileSync(path.join(root,p),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error(m)};
const replaceOnce=(s,a,b,m)=>{must(s.includes(a),m);return s.replace(a,b)};

// Cache/PWA v134 y carga de configuración administrativa de Yape.
{
 let s=read('js/state.js').replace("window.NOTIGAS.CACHE_VERSION = '132';","window.NOTIGAS.CACHE_VERSION = '134';");
 const n="  if (typeof window.renderAdminPaymentsReview !== 'function') {\n    await window.loadScriptAsync('js/admin_payments.js');\n  }";
 if(!s.includes("admin_payment_config.js")) s=replaceOnce(s,n,n+"\n  if (typeof window.ensureAdminPaymentConfigPanel !== 'function') await window.loadScriptAsync('js/admin_payment_config.js');\n  if (typeof window.wrapAdminPaymentsWithConfig === 'function') window.wrapAdminPaymentsWithConfig();",'No se encontró loader admin payments');
 write('js/state.js',s);
}
{
 let s=read('sw.js').replace(/v133/g,'v134').replace(/\?v=132/g,'?v=134').replace(/\?v=133/g,'?v=134');
 if(!s.includes("./js/admin_payment_config.js?v=134")) s=replaceOnce(s,"  './js/admin_payments.js?v=134',","  './js/admin_payments.js?v=134',\n  './js/admin_payment_config.js?v=134',",'No se encontró admin_payments en SW');
 write('sw.js',s);
}
{
 let s=read('index.html').replace(/\?v=133/g,'?v=134').replace(/Cargando suscripciones premium\.\.\./gi,'Cargando pagos de repartidores...').replace(/\bOTB\b/g,'zona');
 write('index.html',s);
}
{
 const o=JSON.parse(read('manifest.json'));o.description='Plataforma vecinal en vivo con mapa GPS, mini páginas de negocio para repartidores y avisos de la zona.';write('manifest.json',JSON.stringify(o,null,2)+'\n');
}

// OCR del repartidor: destinatario obligatorio antes de llamar al RPC fail-closed.
{
 let s=read('js/driver_payments.js');
 const a="          Método: <strong>${esc(instructionsRes.metodo_entrega || 'Yape')}</strong><br>\n          Número Yape: <strong>${esc(yapeDestino)}</strong>";
 if(s.includes(a)) s=s.replace(a,"          Método: <strong>${esc(instructionsRes.metodo_entrega || 'Yape')}</strong><br>\n          Beneficiario: <strong>${esc(instructionsRes.beneficiario_nombre || '—')}</strong><br>\n          Número Yape: <strong>${esc(yapeDestino)}</strong>");
 const b="          if (!dateIso) missing.push('fecha y hora');\n          if (missing.length) {";
 if(!s.includes("missing.push('nombre del destinatario')")) s=replaceOnce(s,b,"          if (!dateIso) missing.push('fecha y hora');\n          if (!recipientName) missing.push('nombre del destinatario');\n          if (!recipientYape) missing.push('Yape del destinatario');\n          if (missing.length) {",'No se encontró validación OCR');
 write('js/driver_payments.js',s);
}

// Capa posterior: todo handler Premium/VIP heredado queda inactivo y redirige a Pagos.
{
 let s=read('js/admin_payment_config.js');
 const marker='  window.ensureAdminPaymentConfigPanel = ensurePanel;';
 if(!s.includes('disableLegacyPremiumAdmin')){
  const guard=`  function disableLegacyPremiumAdmin() {\n    if (typeof window.renderAdminPaymentsReview === 'function') window.renderAdminPremiumSubscriptions = window.renderAdminPaymentsReview;\n    const retired = function () {\n      if (typeof showToast === 'function') showToast('Función retirada', 'Las suscripciones PRO/VIP ya no existen. Usa el módulo Pagos.', 'info', 3000);\n      if (typeof window.renderAdminPaymentsReview === 'function') return window.renderAdminPaymentsReview();\n      return null;\n    };\n    window.aprobarSuscripcionPremiumAdmin = retired;\n    window.revocarSuscripcionPremiumAdmin = retired;\n    window.banearRepartidorDesdePremium = retired;\n  }\n\n`;
  s=replaceOnce(s,marker,guard+marker,'No se encontró punto de inserción admin config');
  s=s.replace('  wrapPaymentsRender();','  wrapPaymentsRender();\n  disableLegacyPremiumAdmin();');
 }
 write('js/admin_payment_config.js',s);
}

// Auth deja de solicitar columnas Premium obsoletas.
{
 let s=read('js/auth.js');
 s=s.replace(', es_premium, premium_vence_at, estado_pago_premium, comprobante_pago_url, tipo_plan, comisiones_pendientes',', comisiones_pendientes');
 s=s.replace(', es_premium, premium_vence_at, estado_pago_premium, comprobante_pago_url, tipo_plan','');
 write('js/auth.js',s);
}

// Runtime incluye módulo nuevo.
{
 let s=read('scripts/check_runtime.js');
 if(!s.includes("'js/admin_payment_config.js'")) s=replaceOnce(s,"  'js/admin_payments.js',","  'js/admin_payments.js',\n  'js/admin_payment_config.js',",'No se encontró lista runtime');
 write('scripts/check_runtime.js',s);
}

// Dependencias reproducibles.
{
 const o=JSON.parse(read('package.json'));o.dependencies=o.dependencies||{};o.dependencies.express='^4.22.2';o.packageManager='pnpm@10.15.0';
 const t='node scripts/check_syntax.js && node scripts/check_runtime.js && node scripts/test_rls_security.js && node scripts/check_audit_hardening.js && node scripts/test_driver_plans.js && python3 test_financial_parameters.py';o.scripts.test=t;o.scripts.build=t;write('package.json',JSON.stringify(o,null,2)+'\n');
 let l=read('pnpm-lock.yaml').replace('specifier: ^4.19.2','specifier: ^4.22.2');must(l.includes('specifier: ^4.22.2'),'Lockfile no sincronizado');write('pnpm-lock.yaml',l);
}

// CI instala lockfile y arranca servidor real.
{
 let s=read('.github/workflows/ci.yml');
 if(!s.includes('pnpm/action-setup@v4')){
  const n="      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n";
  const x=n+"\n      - name: Setup pnpm\n        uses: pnpm/action-setup@v4\n        with:\n          version: 10.15.0\n\n      - name: Install dependencies (frozen lockfile)\n        run: pnpm install --frozen-lockfile\n\n      - name: Smoke test HTTP server\n        run: |\n          node server.js > /tmp/notigas-server.log 2>&1 &\n          PID=$!\n          trap 'kill $PID || true' EXIT\n          for i in {1..20}; do\n            if curl -fsS http://127.0.0.1:3000/health | grep -q '^OK$'; then exit 0; fi\n            sleep 0.5\n          done\n          cat /tmp/notigas-server.log\n          exit 1\n";
  s=replaceOnce(s,n,x,'No se encontró Setup Node en CI');
 }
 write('.github/workflows/ci.yml',s);
}

// Guardrails actualizados.
{
 let s=read('scripts/check_audit_hardening.js').replace(/!== '133'/g,"!== '134'").replace(/notigas-cache-v133/g,'notigas-cache-v134').replace(/cache v132/g,'cache v134');
 if(!s.includes("'js/admin_payment_config.js'")) s=s.replace("['js/admin_payments.js','js/driver_payments.js','js/driver_order_rules.js']","['js/admin_payments.js','js/admin_payment_config.js','js/driver_payments.js','js/driver_order_rules.js']");
 const a="  assertHas('js/driver_payments.js', /p_monto_enviado_pen/, 'Falta monto PEN en contrato OCR');";
 if(!s.includes('OCR cliente no exige nombre del destinatario')) s=s.replace(a,a+"\n  assertHas('js/driver_payments.js', /missing\\.push\\('nombre del destinatario'\\)/, 'OCR cliente no exige nombre del destinatario');\n  assertHas('js/driver_payments.js', /missing\\.push\\('Yape del destinatario'\\)/, 'OCR cliente no exige Yape del destinatario');\n  assertHas('js/admin_payment_config.js', /disableLegacyPremiumAdmin/, 'No se neutraliza el admin Premium heredado');");
 const m="    '20260910234110_make_payment_suspensions_reversible_on_full_payment.sql'";
 if(!s.includes('20260911011500_preprod_security_payment_hardening.sql')) s=s.replace(m,m+",\n    '20260911011500_preprod_security_payment_hardening.sql'");
 const log="  console.log('✅ Audit hardening invariants OK: 50 gratis, crédito S/20 -> S/50 -> S/100');";
 if(!s.includes("const preprod = read('supabase/migrations/20260911011500_preprod_security_payment_hardening.sql')")){
  const q="  const preprod = read('supabase/migrations/20260911011500_preprod_security_payment_hardening.sql');\n  if (!/suspendido_mora/.test(preprod) || !/suspendido_pago/.test(preprod)) fail('Migración final no permite estados reversibles');\n  if (!/rutas_select_own_or_admin/.test(preprod)) fail('Tabla base de rutas no está restringida');\n  if (!/No se detectó el nombre del destinatario/.test(preprod) || !/No se detectó un Yape destinatario válido/.test(preprod)) fail('OCR servidor no falla cerrado');\n  if (!/numero_cuenta = NULL/.test(preprod)) fail('Placeholder de pago no se invalida');\n  assertHas('js/admin_payment_config.js', /rpc_admin_set_payment_config/, 'Falta configuración segura del receptor');\n\n"+log;
  s=s.replace(log,q);
 }
 write('scripts/check_audit_hardening.js',s);
}

must(/CACHE_VERSION = '134'/.test(read('js/state.js')),'state no v134');
must(/notigas-cache-v134/.test(read('sw.js'))&&!/\?v=132|\?v=133/.test(read('sw.js')),'SW mezclado');
must(/missing\.push\('nombre del destinatario'\)/.test(read('js/driver_payments.js')),'OCR cliente incompleto');
must(/disableLegacyPremiumAdmin/.test(read('js/admin_payment_config.js')),'Admin Premium no neutralizado');
must(!/noticias de la OTB/i.test(read('manifest.json')),'Manifest conserva OTB');
console.log('✅ Transformación preproducción aplicada');
