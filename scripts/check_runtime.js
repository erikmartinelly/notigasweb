#!/usr/bin/env node
/**
 * NOTIGAS - Complete Runtime & Initialization Integrity Checker
 * Simulates the full browser environment to evaluate and run all application modules,
 * verifying that no Temporal Dead Zone (TDZ), ReferenceError, or TypeError occurs
 * across map, orders, auth, forum, admin, and state management.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🧪 Iniciando prueba de runtime integral para NOTIGAS (módulos frontend)...\n');

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
    this.center = opts.center || [-12.0464, -77.0428];
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
        getSouth: () => -12.2,
        getNorth: () => -11.9,
        getWest: () => -77.2,
        getEast: () => -76.8,
        contains: () => true
      }),
      contains: () => true,
      getSouth: () => -12.2,
      getNorth: () => -11.9,
      getWest: () => -77.2,
      getEast: () => -76.8
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
      // notigas_bo.js marca los botones del letrero con dataset.wired al
      // pintarse; sin esta propiedad el sandbox revienta al cargar el módulo.
      dataset: {},
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
      insertAdjacentHTML: () => {},
  getAttribute: (attr) => (attr === 'data-category' ? 'plastico' : null),
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 }),
  scrollIntoView: () => {},
  focus: () => {},
  blur: () => {}
};

const consultasMock = [];

const createBuilder = (table) => {
    const builder = {
      select: () => builder,
      insert: (payload) => { consultasMock.push({ tabla: table, payload }); return builder; },
      upsert: () => builder,
      update: () => builder,
      delete: () => builder,
      gte: () => builder,
      lte: () => builder,
      gt: () => builder,
      lt: () => builder,
      eq: () => builder,
      ne: () => builder,
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
    from: (table) => createBuilder(table),
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
    },
    dispatchEvent: (event) => {
      const type = event?.type || event;
      if (docListeners[type]) {
        docListeners[type].forEach(fn => fn(event));
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
  NOTIGAS_RUNTIME_CONFIG: {
    supabaseUrl: 'https://runtime-test.supabase.co',
    supabasePublishableKey: 'sb_publishable_runtime_test'
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
  // notigas_bo.js carga primero en index.html y define el catálogo que
  // repuebla #selectCategoria; sin él el harness no refleja la página real.
  'js/notigas_bo.js',
  'js/driver_icons.js',
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
  'js/promo.js',
  'js/admin.js',
  'js/admin_payments.js',
  'js/admin_payment_config.js',
  'js/driver_payments.js',
  'js/driver_order_rules.js',
  'js/admin_users.js'
];

// El bloque va dentro de una IIFE asíncrona porque el flujo de "otra
// solicitud" se verifica con await: confirmarPedido() devuelve una promesa.
(async () => {
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
    categoria: 'plastico',
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

  const notigasContract = context.window.NOTIGAS || {};
  if (notigasContract.AD_TABLE !== 'anuncios_globales') {
    throw new Error('La publicidad debe usar exclusivamente la tabla anuncios_globales.');
  }
  if (notigasContract.NOTICE_TABLE !== 'avisos') {
    throw new Error('Los Muro de Comentarios deben usar exclusivamente la tabla avisos.');
  }
  if (notigasContract.AD_PLACEMENTS?.MURO_AVISOS !== 'muro_avisos') {
    throw new Error('El anuncio del tercer feed debe usar la posición muro_avisos.');
  }
  if (Object.values(notigasContract.AD_PLACEMENTS || {}).includes('avisos')) {
    throw new Error('La posición publicitaria no puede llamarse avisos.');
  }
  console.log('  ✅ Contrato anuncios_globales / avisos verificado');
  console.log('  ✅ ORDER_STATES verificado (5 estados canónicos estrictos)');

  // ---------------------------------------------------------------------------
  // "Otra solicitud": no es un pedido, es una petición para estadísticas.
  //
  // Se prueba el camino completo con el cliente simulado: la opción debe
  // sobrevivir a setTipoSolicitud (que repuebla el select), el campo libre debe
  // aparecer solo en recogida, y el envío debe acabar en solicitudes_otros con
  // solo ciudad + detalle, sin tocar pedidos ni exigir GPS/cantidad.
  console.log('\n💬 Verificando el flujo de "otra solicitud"...');

  const win = context.window;
  const doc = win.document;

  const mkEl = (over = {}) => ({
    value: '', textContent: '', innerHTML: '', style: {},
    addEventListener() {}, removeEventListener() {}, focus() {},
    insertAdjacentHTML(_pos, html) { this.innerHTML += html; },
    querySelectorAll: () => [], querySelector: () => null,
    getAttribute: () => null, setAttribute() {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    ...over
  });

  const selectCategoria = mkEl();
  const groupOtros = mkEl();
  const inputOtros = mkEl();
  const inputCantidad = mkEl();
  const inputCalle = mkEl();
  const inputDesc = mkEl();

  const porId = {
    selectCategoria,
    groupOrderOtros: groupOtros,
    inputOrderOtrosDetalle: inputOtros,
    inputCantidad,
    inputCallePrincipal: inputCalle,
    inputOrderDescripcion: inputDesc,
    tipoSolicitudAyuda: mkEl(),
    labelCategoria: mkEl(),
    labelCantidad: mkEl(),
    btnPedidoTexto: mkEl(),
    modalPedidoTitle: mkEl(),
    tipoSolicitudToggle: mkEl({ querySelectorAll: () => [] })
  };
  const getElementByIdReal = doc.getElementById.bind(doc);
  const queryAllReal = doc.querySelectorAll ? doc.querySelectorAll.bind(doc) : null;
  const queryReal = doc.querySelector ? doc.querySelector.bind(doc) : null;
  doc.getElementById = (id) => porId[id] || getElementByIdReal(id);
  // setTipoSolicitud recorre los botones del toggle; en el DOM real existen, en
  // el sandbox no, y sus stubs no traen dataset.
  doc.querySelectorAll = () => [];
  doc.querySelector = () => null;

  const toasts = [];
  const sobrescribir = (nombre, fn) => { const prev = win[nombre]; win[nombre] = fn; return () => { win[nombre] = prev; }; };
  const restaurar = [
    sobrescribir('showToast', (...a) => toasts.push(a[0])),
    sobrescribir('showLoadingOverlay', () => {}),
    sobrescribir('hideLoadingOverlay', () => {})
  ];

  win.setTipoSolicitud('recogida');
  const opcionOtrosRecogida = /<option value="otros">/.test(selectCategoria.innerHTML);
  console.log(`  ${opcionOtrosRecogida ? '✅' : '❌'} "otros" sigue disponible al publicar material`);
  if (!opcionOtrosRecogida) throw new Error('setTipoSolicitud("recogida") eliminó la opción "otros".');

  win.setTipoSolicitud('compra');
  const opcionOtrosCompra = /<option value="otros">/.test(selectCategoria.innerHTML);
  console.log(`  ${!opcionOtrosCompra ? '✅' : '❌'} "otros" no aparece al comprar`);
  if (opcionOtrosCompra) throw new Error('"otros" no debería ofrecerse en el flujo de compra.');

  win.setTipoSolicitud('recogida');
  selectCategoria.value = 'otros';
  win.sincronizarGrupoOtros(selectCategoria);
  const campoVisible = groupOtros.style.display === 'block';
  console.log(`  ${campoVisible ? '✅' : '❌'} el campo de texto libre aparece al elegir "otros"`);
  if (!campoVisible) throw new Error('El campo de "otra solicitud" no se mostró.');

  // Envío: sin cantidad, sin calle, sin descripción. Solo el texto libre.
  inputOtros.value = '   Tapas de plastico   ';
  inputCantidad.value = '';
  inputCalle.value = '';
  inputDesc.value = '';
  consultasMock.length = 0;
  await win.confirmarPedido();
  await new Promise((r) => setTimeout(r, 60));

  const pedido = consultasMock.find((c) => c.tabla === 'pedidos');
  const peticion = consultasMock.find((c) => c.tabla === 'solicitudes_otros');
  console.log(`  ${!pedido ? '✅' : '❌'} no se crea ningún pedido`);
  if (pedido) throw new Error('"otros" llegó a crear un pedido.');

  console.log(`  ${peticion ? '✅' : '❌'} la petición se guarda en solicitudes_otros`);
  if (!peticion) throw new Error('La petición no llegó a solicitudes_otros.');

  const fila = peticion.payload[0];
  const campos = Object.keys(fila).sort().join(',');
  console.log(`  ${campos === 'ciudad,detalle,user_id' ? '✅' : '❌'} solo guarda user_id, ciudad y detalle (${campos})`);
  if (campos !== 'ciudad,detalle,user_id') {
    throw new Error(`La petición guarda campos inesperados: ${campos}`);
  }
  console.log(`  ${fila.detalle === 'Tapas de plastico' ? '✅' : '❌'} el texto se envía recortado (${JSON.stringify(fila.detalle)})`);
  if (fila.detalle !== 'Tapas de plastico') throw new Error('El detalle no se normalizó antes de enviarse.');
  console.log(`  ${fila.user_id === 'test-user-id' ? '✅' : '❌'} la petición queda a nombre de quien la envía`);
  if (fila.user_id !== 'test-user-id') throw new Error('user_id no corresponde al usuario autenticado.');

  // Menos de 3 caracteres no debe tocar la base.
  inputOtros.value = 'ab';
  consultasMock.length = 0;
  await win.confirmarPedido();
  await new Promise((r) => setTimeout(r, 60));
  const tocoLaBase = consultasMock.length > 0;
  console.log(`  ${!tocoLaBase ? '✅' : '❌'} un texto demasiado corto no llega al servidor`);
  if (tocoLaBase) throw new Error('Una petición inválida llegó a la base de datos.');

  restaurar.forEach((fn) => fn());
  doc.getElementById = getElementByIdReal;
  if (queryAllReal) doc.querySelectorAll = queryAllReal;
  if (queryReal) doc.querySelector = queryReal;
  console.log('  ✅ Flujo de "otra solicitud" verificado (estadística, no pedido)');

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
})();
