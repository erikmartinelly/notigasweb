#!/usr/bin/env node
'use strict';

// Regresiones reproducidas en producción: CSS de Leaflet desactivado por CSP
// y configuración de entorno obsoleta servida desde Cache Storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function checkStyles() {
  const links = read('index.html').match(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi) || [];
  for (const asset of ['leaflet.css', 'all.min.css']) {
    const link = links.find((tag) => tag.includes(asset));
    assert.ok(link, `No se encontró ${asset}`);
    assert.doesNotMatch(link, /\son\w+\s*=/i, `${asset} depende de un handler inline bloqueado por CSP`);
    const media = link.match(/\bmedia="([^"]*)"/i)?.[1];
    assert.ok(!media || /^(all|screen)$/i.test(media), `${asset} no se aplica a la pantalla`);
  }
  for (const file of ['server.js', '.htaccess']) {
    const scripts = read(file).match(/script-src ([^;]+)/)?.[1];
    assert.ok(scripts, `${file} debe conservar una CSP`);
    assert.ok(!scripts.includes("'unsafe-inline'"), `${file} debilita la CSP para aplicar estilos`);
  }
  // También la lista de pedidos de respaldo debe respetar la vista pública.
  const publicSelect = read('js/orders.js').match(/\.from\('pedidos_publicos'\)\s*\.select\('([^']+)'\)/);
  assert.ok(publicSelect, 'No se encontró la consulta pública de la lista de pedidos');
  assert.ok(!publicSelect[1].split(',').some((column) => column.trim() === 'tipo_solicitud'),
    'La lista consulta tipo_solicitud, que no existe en pedidos_publicos');
}

function createWorker({ offline = false } = {}) {
  const listeners = {};
  const calls = { fetch: [], match: 0, put: 0 };
  const stale = { source: 'cached' };
  const latest = { source: 'network', status: 200, clone: () => latest };
  vm.runInNewContext(read('sw.js'), {
    URL, console,
    self: {
      location: { origin: 'https://notigas.test' },
      addEventListener: (name, handler) => { listeners[name] = handler; }
    },
    caches: {
      match: async () => { calls.match++; return stale; },
      open: async () => ({ put: async () => { calls.put++; } })
    },
    fetch: async (request, options) => {
      calls.fetch.push({ request, options });
      if (offline) throw new Error('offline');
      return latest;
    }
  });
  return {
    calls,
    request(url) {
      let response;
      listeners.fetch({
        request: { url, method: 'GET', mode: 'cors', headers: { get: () => '' } },
        respondWith: (promise) => { response = promise; }
      });
      return response;
    }
  };
}

async function main() {
  checkStyles();
  console.log('✅ Leaflet e iconos se aplican en pantalla con la CSP vigente');
  for (const suffix of ['', '?v=153', '?v=old']) {
    const worker = createWorker();
    const response = await worker.request(`https://notigas.test/runtime-config.js${suffix}`);
    assert.equal(response.source, 'network');
    assert.equal(worker.calls.fetch[0].options.cache, 'no-store');
    assert.equal(worker.calls.match, 0, 'La configuración no debe leer Cache Storage');
    assert.equal(worker.calls.put, 0, 'La configuración no debe guardarse en Cache Storage');
  }
  const offline = createWorker({ offline: true });
  await assert.rejects(offline.request('https://notigas.test/runtime-config.js?v=old'), /offline/);
  assert.equal(offline.calls.match, 0, 'Sin red no debe restaurarse una configuración antigua');
  console.log('✅ runtime-config.js siempre solicita la configuración actual, incluso con caché anterior');

  const assets = createWorker();
  assert.equal((await assets.request('https://notigas.test/js/map.js?v=153')).source, 'cached');
  assert.equal(assets.calls.match, 1);
  const external = createWorker();
  assert.equal(external.request('https://tile.openstreetmap.org/0/0/0.png'), undefined);
  console.log('✅ Se conserva el caché de recursos y no se interceptan servicios externos');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
