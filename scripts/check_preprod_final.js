#!/usr/bin/env node
'use strict';

const fs = require('fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const must = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`OK: ${msg}`);
};

const orders = read('js/orders.js');
const readme = read('README.md');
const snapshot = read('supabase/full_production_schema.sql');
const migration = read('supabase/migrations/20260911205957_preprod_final_security_and_credit_messages.sql');
const integration = read('scripts/test_db_integration.js');
const ci = read('.github/workflows/ci.yml');

must(orders.includes("estado_servicio === 'suspendido_mora'"), 'UI reconoce suspendido_mora');
must(orders.includes("estado_servicio === 'suspendido_pago'"), 'UI reconoce suspendido_pago');
must(orders.includes('secureRenderDriverOrdersList'), 'lista legacy delega al radar seguro');
must(/Canonical deployment/i.test(readme), 'README usa migraciones como fuente canónica');
must(/intentionally deprecated/i.test(readme), 'README marca snapshot obsoleto');
must(/RAISE EXCEPTION/i.test(snapshot) && /obsoleto/i.test(snapshot), 'snapshot obsoleto falla de forma segura');
must(/is_admin_email\(\).*FROM PUBLIC, anon/is.test(migration), 'helper admin no es endpoint anónimo');
must(/is_banned\(\).*FROM PUBLIC, anon/is.test(migration), 'helper de bloqueo no es endpoint anónimo');
must(/is_current_enabled_driver\(text,text\).*FROM PUBLIC, anon/is.test(migration), 'helper de repartidor no es endpoint anónimo');
must(/Alcanzaste tu límite de crédito: % pedidos cobrables \/ S\/ %/i.test(migration), 'mensaje de crédito es dinámico');
must(integration.includes('order_public_radar'), 'integración verifica radar');
must(integration.includes('rpc_get_driver_available_orders'), 'integración verifica RPC legacy revocado');
must(ci.includes('Verify Live Supabase Public Boundary'), 'CI ejecuta integración real');

console.log('Preproducción: guardrail final OK');
