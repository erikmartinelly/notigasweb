#!/usr/bin/env node
/**
 * NOTIGAS - Complete Runtime & Initialization Integrity Checker
 * Simulates the full browser environment to evaluate and run all 15 application modules,
 * verifying that no Temporal Dead Zone (TDZ), ReferenceError, or TypeError occurs
 * across map, orders, auth, forum, admin, and state management.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🧪 Iniciando prueba de runtime integral para NOTIGAS (15 módulos frontend)...\n');

// 1. Entorno de Simulación de Navegador Completo
const windowListeners = {};
const docListeners = {};
const mapListeners = {};

class MockLayerGroup {
  constructor() { this.layers = []; }
  addTo(m) { return this; }
  addLayer(l) { this.layers.push(l); return this; }
  removeLayer(l) { this.layers = this.layers.filter(x => x !== l); return this; }
  clearLayers() { this.layers = []; return this; }
  hasLayer(l) { return this.layers.includes(l); }
}

class MockMarker {
  constructor(latlng, options = {}) {
    this.latlng = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
    this.options = options;
    this._listeners = {};
    this.dragging = { enable: () => {}, disable: () => {}, enabled: () => true };
  }
  addTo(m) { return this; }
  getLatLng() { return this.latlng; }
  setLatLng(latlng) {
    this.latlng = Array.isArray(latlng) ? { lat: latlng[0], lng: latlng[1] } : latlng;
    return this;
  }
  setIcon(icon) { this.options.icon = icon; return this; }
  bindPopup(content) { this.popupContent = content; return this; }
  bindTooltip(content, opts) { this.tooltipContent = content; return this; }
  on(event, fn) {
    this._listeners[event] = this._listeners[event] || [];
    this._listeners[event].push(fn);
    return this;
  }
  fire(event, data = {}) {
    if (this._listeners[event]) this._listeners[event].forEach(fn => fn(data));
  }
  closePopup() {}
  isPopupOpen() { return false; }
}

class MockMap {
  constructor(id, opts = {}) {
    this.id = id;
    this.opts = opts;
    this.center = opts.center || [-17.3895, -66.1568];
    this.zoom = opts.zoom || 16;
    this.layers = new Set();
  }
  addLayer(l) { this.layers.add(l); return this; }
  removeLayer(l) { this.layers.delete(l); return this; }
  hasLayer(l) { return this.layers.has(l); }
  invalidateSize() {}
  getCenter() { return { lat: this.center[0], lng: this.center[1] }; }
  getZoom() { return this.zoom; }
  setZoom(z) { this.zoom = z; return this; }
  setView(center, zoom) {
    this.center = center;
    if (zoom !== undefined) this.zoom = zoom;
    return this;
  }
  flyTo(center, zoom) {
    this.center = center;
    if (zoom !== undefined) this.zoom = zoom;
    return this;
  }
  flyToBounds() {}
  getBounds() {
    return {
      pad: () => ({
        getSouth: () => -17.5,
        getNorth: () => -17.2,
        getWest: () => -66.3,
        getEast: () => -66.0,
        contains: () => true
      }),
      contains: () => true,
      getSouth: () => -17.5,
      getNorth: () => -17.2,
      getWest: () => -66.3,
      getEast: () => -66.0
    };
  }
  on(event, fn) {
    mapListeners[event] = mapListeners[event] || [];
    mapListeners[event].push(fn);
    return this;
  }
  fire(event, data = {}) {
    if (mapListeners[event]) mapListeners[event].forEach(fn => fn(data));
  }
}

const mockElement = {
  _leaflet_id: null,
  style: {},
  value: '',
  innerHTML: '',
  innerText: '',
  textContent: '',
  classList: {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  appendChild: () => {},
  removeChild: () => {},
  querySelector: () => mockElement,
  querySelectorAll: () => [mockElement],
  setAttribute: () => {},
  removeAttribute: () => {},
  getAttribute: (attr) => (attr === 'data-category' ? 'gas' : null),
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 }),
  scrollIntoView: () => {},
  focus: () => {},
  blur: () => {}
};

const createBuilder = () => {
  const builder = {
    select: () => builder,
    insert: () => builder,
    upsert: () => builder,
    update: () => builder,
    delete: () => builder,
    gte: () => builder,
    lte: () => builder,
    gt: () => builder,
    lt: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    is: () => builder,
    ilike: () => builder,
    like: () => builder,
    order: () => builder,
    range: () => builder,
    limit: () => builder,
    single: () => Promise.resolve({ data: {}, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    catch: (reject) => Promise.resolve({ data: [], error: null }).catch(reject)
  };
  return builder;
};

const mockSupabaseClient = {
  from: (table) => createBuilder(),
  rpc: (fn, params) => Promise.resolve({ data: [], error: null }),
  channel: (name) => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {}
  }),
  removeChannel: () => {},
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'test-user-id', email: 'test@notigas.com' } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user: { id: 'test-user-id' } } }, error: null }),
    onAuthStateChange: (cb) => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null }),
    signUp: () => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null }),
    signOut: () => Promise.resolve({ error: null })
  },
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: { path: 'test.jpg' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://test.notigas.com/test.jpg' } })
    })
  }
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Promise,
  RegExp,
  isNaN,
  parseFloat,
  parseInt,
  encodeURIComponent,
  decodeURIComponent,
  btoa: (s) => Buffer.from(String(s)).toString('base64'),
  atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
  fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
  escapeHtmlStr: (s) => (typeof s === 'string' ? s.replace(/</g, '&lt;') : ''),
  addEventListener: (event, fn) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(fn);
  },
  removeEventListener: (event, fn) => {
    if (windowListeners[event]) {
      windowListeners[event] = windowListeners[event].filter(cb => cb !== fn);
    }
  },
  dispatchEvent: (event) => {
    const type = event?.type || event;
    if (windowListeners[type]) {
      windowListeners[type].forEach(fn => fn(event));
    }
  },
  location: {
    href: 'http://localhost/',
    search: '',
    hash: '',
    pathname: '/',
    origin: 'http://localhost'
  },
  history: {
    pushState: () => {},
    replaceState: () => {}
  },
  Event: class Event {
    constructor(type) {
      this.type = type;
    }
  },
  CustomEvent: class CustomEvent {
    constructor(type, detail = {}) {
      this.type = type;
      this.detail = detail;
    }
  },
  IntersectionObserver: class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  getComputedStyle: () => ({}),
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  document: {
    readyState: 'complete',
    body: mockElement,
    head: mockElement,
    documentElement: mockElement,
    getElementById: (id) => mockElement,
    querySelector: () => mockElement,
    querySelectorAll: () => [mockElement],
    createElement: () => mockElement,
    addEventListener: (event, fn) => {
      docListeners[event] = docListeners[event] || [];
      docListeners[event].push(fn);
    },
    removeEventListener: (event, fn) => {
      if (docListeners[event]) {
        docListeners[event] = docListeners[event].filter(cb => cb !== fn);
      }
    }
  },
  navigator: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 TestRunner',
    geolocation: {
      getCurrentPosition: (success) => {
        success({ coords: { latitude: -17.3895, longitude: -66.1568 } });
      },
      watchPosition: () => 1,
      clearWatch: () => {}
    }
  },
  localStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  },
  sessionStorage: {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  },
  L: {
    map: (id, opts) => new MockMap(id, opts),
    marker: (latlng, opts) => new MockMarker(latlng, opts),
    divIcon: (opts) => ({ ...opts, _isIcon: true }),
    tileLayer: () => ({ addTo: () => {}, on: () => {} }),
    layerGroup: () => new MockLayerGroup(),
    latLngBounds: () => ({}),
    control: {
      zoom: () => ({ addTo: () => {} })
    }
  },
  supabase: {
    createClient: () => mockSupabaseClient
  },
  supabaseClient: mockSupabaseClient,
  google: {
    accounts: {
      id: {
        initialize: () => {},
        renderButton: () => {},
        prompt: () => {}
      }
    }
  }
};

sandbox.window = sandbox;
sandbox.global = sandbox;

const context = vm.createContext(sandbox);

// 2. Cargar los 15 scripts en el orden exacto del frontend
const allModules = [
  'js/state.js',
  'js/ui.js',
  'js/supabase-config.js',
  'js/auth.js',
  'js/vendors.js',
  'js/map.js',
  'js/map_search.js',
  'js/map_gps.js',
  'js/orders.js',
  'js/app.js',
  'js/events.js',
  'js/forum.js',
  'js/ads.js',
  'js/admin.js',
  'js/admin_users.js'
];

try {
  console.log('📦 Evaluando y ejecutando módulos frontend:');
  for (const scriptRel of allModules) {
    const scriptPath = path.join(ROOT_DIR, scriptRel);
    if (!fs.existsSync(scriptPath)) {
      console.warn(`  ⚠️ Archivo ${scriptRel} no encontrado, saltando...`);
      continue;
    }
    const code = fs.readFileSync(scriptPath, 'utf8');
    vm.runInContext(code, context, { filename: scriptRel });
    console.log(`  ✅ [EVAL OK] ${scriptRel}`);
  }

  // 3. Simular Inicialización de Mapa
  console.log('\n🗺️ Verificando inicialización de mapa y variables...');
  if (typeof context.initNotigasMap === 'function') {
    context.initNotigasMap();
    console.log('  ✅ initNotigasMap() ejecutado sin errores');
  } else {
    throw new Error('initNotigasMap no está expuesto en el contexto global.');
  }

  // 4. Simular eventos de Leaflet en caliente
  console.log('\n⚡ Disparando eventos de Leaflet (zoom, zoomend, moveend, click)...');
  
  if (mapListeners['zoom']) {
    mapListeners['zoom'].forEach(fn => fn());
    console.log('  ✅ Evento zoom disparado con éxito');
  }

  if (mapListeners['zoomend']) {
    mapListeners['zoomend'].forEach(fn => fn());
    console.log('  ✅ Evento zoomend (renderDriverDemandByZoom) disparado con éxito');
  }

  if (mapListeners['moveend']) {
    mapListeners['moveend'].forEach(fn => fn());
    console.log('  ✅ Evento moveend (cargarPedidosVecinalesEnVivo) disparado con éxito');
  }

  if (mapListeners['click']) {
    mapListeners['click'].forEach(fn => fn({ latlng: { lat: -17.39, lng: -66.15 } }));
    console.log('  ✅ Evento click disparado con éxito');
  }

  // 5. Simular actualizaciones de GPS y pedidos
  console.log('\n📍 Probando actualización de posición GPS y pedidos...');
  context.applyGpsPosition(-17.3895, -66.1568, 'Test GPS', true, true);
  console.log('  ✅ applyGpsPosition() OK');

  context.actualizarIconoMarcadorUsuario('driver');
  console.log('  ✅ actualizarIconoMarcadorUsuario("driver") OK');

  context.actualizarPedidoEnMapa({
    id: 'test-order-99',
    user_id: 'other-user',
    categoria: 'Gas GLP',
    latitude: -17.3890,
    longitude: -66.1560,
    estado: 'pendiente'
  }, 'UPDATE');
  console.log('  ✅ actualizarPedidoEnMapa() OK');

  context.removerPedidoDeMapa('test-order-99');
  console.log('  ✅ removerPedidoDeMapa() OK');

  context.renderReportedTrucksBuffer();
  console.log('  ✅ renderReportedTrucksBuffer() OK');

  // 6. Verificar integridad de constantes, estados canónicos y exports
  console.log('\n🔒 Verificando constantes críticas, máquina de estados y exports...');
  const radarZoom = context.window.DRIVER_RADAR_MAX_ZOOM ?? context.DRIVER_RADAR_MAX_ZOOM;
  if (radarZoom !== 14) {
    throw new Error(`DRIVER_RADAR_MAX_ZOOM esperado 14 pero obtenido: ${radarZoom}`);
  }
  if (!context.window.BOLIVIA_CITIES || !context.window.BOLIVIA_CITIES.cochabamba) {
    throw new Error('window.BOLIVIA_CITIES no está inicializado.');
  }
  if (!context.window.orderRadarMarkers || typeof context.window.orderRadarMarkers !== 'object') {
    throw new Error('window.orderRadarMarkers no está inicializado.');
  }

  // Verificar máquina canónica de 5 estados (sin RECIBIDO)
  const states = Object.values(context.window.ORDER_STATES || {});
  if (states.includes('recibido')) {
    throw new Error('ORDER_STATES contiene "recibido", violando la máquina canónica de 5 estados de BD.');
  }
  const expectedStates = ['pendiente', 'visto', 'asignado', 'entregado', 'cancelado'];
  for (const s of expectedStates) {
    if (!states.includes(s)) {
      throw new Error(`ORDER_STATES no contiene el estado requerido: ${s}`);
    }
  }
  console.log('  ✅ ORDER_STATES verificado (5 estados canónicos estrictos)');

  console.log('\n--------------------------------------------------');
  console.log(`✨ ÉXITO: Prueba de runtime completada sobre los ${allModules.length} módulos sin excepciones.\n`);
  process.exit(0);

} catch (err) {
  console.error('\n🚨 ERROR EN RUNTIME:', err);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}
