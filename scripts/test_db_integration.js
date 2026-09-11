#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadPublicConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-config.js'), 'utf8');
  const urlMatch = src.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);
  const keyMatch = src.match(/sb_publishable_[A-Za-z0-9_-]+/);
  const url = process.env.SUPABASE_URL || urlMatch?.[0];
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || keyMatch?.[0];
  if (!url || !key) throw new Error('No se pudo resolver la configuración pública de Supabase');
  return { url, key };
}

const PUBLIC_CONFIG = loadPublicConfig();

async function request(endpoint, options = {}) {
  const url = `${PUBLIC_CONFIG.url}/rest/v1/${endpoint.replace(/^\//, '')}`;
  const headers = {
    apikey: PUBLIC_CONFIG.key,
    Authorization: `Bearer ${PUBLIC_CONFIG.key}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDenied(res, label) {
  if (res.ok) {
    const empty = Array.isArray(res.data) && res.data.length === 0;
    if (!empty) throw new Error(`${label} quedó accesible sin sesión`);
  }
}

async function main() {
  console.log(`🧪 Integración PostgREST: ${PUBLIC_CONFIG.url}`);
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  await test('Anuncios públicos legibles', async () => {
    const res = await request('anuncios_globales?select=id,titulo,ciudad,posicion,activo&limit=3');
    assert(res.ok && Array.isArray(res.data), `HTTP ${res.status}`);
  });

  await test('Avisos públicos legibles', async () => {
    const res = await request('avisos?select=id,titulo,ciudad,categoria&limit=3');
    assert(res.ok && Array.isArray(res.data), `HTTP ${res.status}`);
  });

  for (const fn of ['is_admin_email', 'is_banned']) {
    await test(`${fn} no es RPC anónimo`, async () => {
      assertDenied(await request(`rpc/${fn}`, { method: 'POST', body: '{}' }), fn);
    });
  }

  await test('is_current_enabled_driver no es RPC anónimo', async () => {
    assertDenied(await request('rpc/is_current_enabled_driver', {
      method: 'POST', body: JSON.stringify({ p_ciudad: 'lima', p_categoria: 'gas' })
    }), 'is_current_enabled_driver');
  });

  await test('Chequeo pre-registro de dispositivo responde sin error 5xx', async () => {
    const res = await request('rpc/rpc_verificar_bloqueo_dispositivo', {
      method: 'POST',
      body: JSON.stringify({
        p_device_id: 'integration-probe',
        p_device_fingerprint: 'integration-probe',
        p_dni: '00000000',
        p_placa: 'PROBE000',
        p_telefono: '900000000'
      })
    });
    assert(res.status < 500, `HTTP ${res.status}`);
  });

  for (const endpoint of [
    'pedidos?select=id,direccion,telefono,latitude,longitude&limit=1',
    'order_public_radar?select=order_id,latitude,longitude,radius_m&limit=1',
    'choferes_publicos?select=id,nombre_completo,categoria&limit=1',
    'rutas_repartidores_publicas?select=id,latitude,longitude&limit=1',
    'repartidores?select=id,nombre,telefono,placa&limit=1'
  ]) {
    await test(`${endpoint.split('?')[0]} no expone datos sin sesión`, async () => {
      assertDenied(await request(endpoint), endpoint);
    });
  }

  await test('RPC antiguo de pedidos libres permanece revocado', async () => {
    assertDenied(await request('rpc/rpc_get_driver_available_orders', {
      method: 'POST', body: JSON.stringify({ p_ciudad: 'lima', p_categoria: 'gas' })
    }), 'rpc_get_driver_available_orders');
  });

  await test('Instrucciones de pago requieren sesión', async () => {
    assertDenied(await request('rpc/rpc_get_payment_instructions', { method: 'POST', body: '{}' }), 'rpc_get_payment_instructions');
  });

  console.log(`\nResultado: ${passed} OK / ${failed} fallos`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('🚨 Error de integración:', err.message);
  process.exit(1);
});
