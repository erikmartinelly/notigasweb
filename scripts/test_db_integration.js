#!/usr/bin/env node
/**
 * NOTIGAS - Real Database & PostgREST Integration Test Suite
 * Connects directly to the live Supabase project to verify RPC signatures,
 * schema endpoints, RLS security policies, and error handling without mocks.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yxzzfqyehllogzzhdtmc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2';

async function request(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    ...options,
    headers
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = text;
  }

  return { status: res.status, ok: res.ok, data: json, headers: res.headers };
}

async function runDatabaseIntegrationTests() {
  console.log('🧪 Iniciando prueba de integración REAL contra Supabase Postgres...');
  console.log(`🌐 Endpoint objetivo: ${SUPABASE_URL}\n`);

  let passed = 0;
  let failed = 0;
  const errors = [];

  async function test(name, fn) {
    try {
      process.stdout.write(`  ⏳ ${name}... `);
      await fn();
      console.log('✅ [PASSED]');
      passed++;
    } catch (err) {
      console.log('❌ [FAILED]');
      console.error(`     Error: ${err.message}`);
      errors.push({ test: name, error: err.message });
      failed++;
    }
  }

  // TEST 1: Conectividad y lectura de anuncios globales
  await test('Lectura de tabla pública anuncios_globales', async () => {
    const res = await request('anuncios_globales?select=id,titulo,ciudad,posicion,activo&limit=5');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data)) throw new Error('Se esperaba un array de anuncios');
  });

  // TEST 2: Lectura de avisos comunitarios
  await test('Lectura de tabla pública avisos por ciudad', async () => {
    const res = await request('avisos?select=id,titulo,ciudad,categoria&limit=5');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data)) throw new Error('Se esperaba un array de avisos');
  });

  // TEST 3: RPC is_banned responde correctamente
  await test('Invocación RPC is_banned()', async () => {
    const res = await request('rpc/is_banned', {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    if (typeof res.data !== 'boolean') throw new Error(`Se esperaba boolean pero se obtuvo: ${typeof res.data}`);
  });

  // TEST 4: RPC is_admin_email_for responde con booleano
  await test('Invocación RPC is_admin_email_for(text)', async () => {
    const res = await request('rpc/is_admin_email_for', {
      method: 'POST',
      body: JSON.stringify({ p_email: 'unauthorized_probe@example.com' })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    if (typeof res.data !== 'boolean') throw new Error(`Se esperaba boolean pero se obtuvo: ${typeof res.data}`);
    if (res.data !== false) throw new Error('Probe no autorizado debió retornar false');
  });

  // TEST 5: RPC rpc_crear_aviso_vecinal rechaza usuarios anónimos de forma controlada
  await test('RPC rpc_crear_aviso_vecinal rechaza llamada anónima con error controlado', async () => {
    const res = await request('rpc/rpc_crear_aviso_vecinal', {
      method: 'POST',
      body: JSON.stringify({
        p_ciudad: 'cochabamba',
        p_barrio: 'Global',
        p_autor: 'Test Probe',
        p_titulo: 'Test Probe',
        p_descripcion: 'Test Probe',
        p_mensaje: 'Test Probe'
      })
    });
    // Debe responder con ok: false o HTTP 400/401/403/200 con json { ok: false, error: 'Usuario no autenticado' }
    if (res.status === 200 && res.data) {
      if (res.data.ok === true || res.data.success === true) {
        throw new Error('rpc_crear_aviso_vecinal permitió creación anónima');
      }
    } else if (res.status >= 500) {
      throw new Error(`Error de servidor inesperado HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // TEST 6: RPC rpc_save_local_ad rechaza llamada anónima o no-admin
  await test('RPC rpc_save_local_ad rechaza llamadas sin sesión administrativa JWT', async () => {
    const res = await request('rpc/rpc_save_local_ad', {
      method: 'POST',
      body: JSON.stringify({
        p_titulo: 'Unauthorized Ad Probe',
        p_descripcion: 'Probe',
        p_url: 'https://notigas.com',
        p_image_url: '',
        p_ciudad: 'cochabamba',
        p_activo: true,
        p_posicion: 'mapa',
        p_admin_email: 'admin@notigas.com'
      })
    });
    // Debe rechazar por falta de JWT administrativo (HTTP 401, 403, 404 o ok=false)
    if (res.status === 200 && res.data) {
      if (res.data.success === true) {
        throw new Error('rpc_save_local_ad permitió guardado sin sesión JWT real autenticada');
      }
    }
  });

  // TEST 7: RPC rpc_delete_local_ad rechaza eliminación no-admin
  await test('RPC rpc_delete_local_ad rechaza borrado no-admin de forma controlada', async () => {
    const res = await request('rpc/rpc_delete_local_ad', {
      method: 'POST',
      body: JSON.stringify({
        p_ad_id: '00000000-0000-0000-0000-000000000000',
        p_admin_email: 'hacker@example.com'
      })
    });
    if (res.status === 200 && res.data) {
      if (res.data.success === true) {
        throw new Error('rpc_delete_local_ad permitió borrado no autorizado');
      }
    } else if (res.status >= 500) {
      throw new Error(`Error de servidor o función ambigua HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // TEST 8: Lectura de la vista pedidos_publicos
  await test('Lectura de vista protegida pedidos_publicos', async () => {
    const res = await request('pedidos_publicos?limit=5');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data)) throw new Error('Se esperaba un array de pedidos públicos');
  });

  // TEST 9: Lectura de la vista choferes_publicos
  await test('Lectura de vista protegida choferes_publicos', async () => {
    const res = await request('choferes_publicos?limit=5');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    if (!Array.isArray(res.data)) throw new Error('Se esperaba un array de choferes públicos');
  });

  console.log('\n--------------------------------------------------');
  if (failed === 0) {
    console.log(`✨ ÉXITO TOTAL: ${passed} pruebas reales de integración con Supabase superadas.\n`);
    process.exit(0);
  } else {
    console.error(`🚨 ERROR: ${failed} de ${passed + failed} pruebas de integración fallaron:\n`);
    for (const e of errors) {
      console.error(`  - ${e.test}: ${e.error}`);
    }
    process.exit(1);
  }
}

runDatabaseIntegrationTests().catch(err => {
  console.error('\n🚨 Excepción no controlada en suite de integración:', err);
  process.exit(1);
});
