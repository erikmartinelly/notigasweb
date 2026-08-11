/* ==========================================================================
   NOTIGAS - SISTEMA DE GESTIÓN DE ESTADO CENTRALIZADO (Pub/Sub)
   
   Uso:
   - AppState.set('userRole', 'repartidor')       → cambia el estado
   - AppState.get('userRole')                      → lee el estado
   - AppState.on('userRole', fn)                   → escucha cambios
   - AppState.off('userRole', fn)                  → deja de escuchar
   ========================================================================== */

/* =====================================================
   FIX #16: FUNCIÓN COMPARTIDA escapeHtmlStr
   Única fuente de verdad — todos los módulos la usan via window.escapeHtmlStr
   ===================================================== */
window.escapeHtmlStr = function(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/* =====================================================
   FIX #18: CONSTANTES GLOBALES (eliminando magic numbers)
   ===================================================== */
window.NOTIGAS = window.NOTIGAS || {};
window.NOTIGAS.ORDER_EXPIRATION_MS   = 48 * 60 * 60 * 1000;  // 48 horas
window.NOTIGAS.TRUCK_EXPIRATION_MS   = 10 * 60 * 1000;        // 10 minutos (camiones fantasma)
window.NOTIGAS.GPS_UPDATE_INTERVAL   = 5000;                   // 5 segundos (broadcast repartidor)
window.NOTIGAS.GPS_TIMEOUT_MS        = 12000;                  // 12 segundos (timeout GPS)
window.NOTIGAS.MIN_MOVEMENT_METERS   = 15;                     // 15 metros (movimiento mínimo GPS)
window.NOTIGAS.IDLE_THRESHOLD_MS     = 3 * 60 * 1000;         // 3 minutos (repartidor inactivo)
window.NOTIGAS.MAX_IMAGE_SIZE_BYTES  = 2 * 1024 * 1024;       // 2 MB (tamaño máximo imagen)

(function() {
  'use strict';

  // Estado inicial de la aplicación
  const _state = {
    userRole: 'vecino',        // 'vecino' | 'repartidor' | 'admin'
    userData: null,            // Objeto con datos del usuario autenticado
    city: localStorage.getItem('notigas_city') || 'santacruz', // Única fuente de verdad temporal pre-login
    gpsLat: null,
    gpsLng: null,
    gpsReady: false,
    activeOrder: null,         // Pedido activo del usuario actual
    realtimeConnected: false,  // Estado de conexión Supabase Realtime
    appMode: 'buyer',          // 'buyer' | 'driver'
    isDriverLive: false,       // Si el repartidor está transmitiendo en vivo
  };

  // Suscriptores por clave de estado
  const _listeners = {};

  const AppState = {
    /**
     * Obtiene un valor del estado.
     * @param {string} key
     * @returns {*}
     */
    get(key) {
      return _state[key];
    },

    /**
     * Establece un valor en el estado y notifica a los oyentes.
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
      const prev = _state[key];
      _state[key] = value;

      if (key === 'city') {
        localStorage.setItem('notigas_city', value);
      }

      if (prev !== value && _listeners[key]) {
        _listeners[key].forEach(fn => {
          try {
            fn(value, prev);
          } catch (e) {
            console.error(`[AppState] Error en oyente de "${key}":`, e);
          }
        });
      }
    },

    /**
     * Suscribe una función a cambios en una clave.
     * @param {string} key
     * @param {Function} fn
     */
    on(key, fn) {
      if (!_listeners[key]) _listeners[key] = [];
      if (!_listeners[key].includes(fn)) {
        _listeners[key].push(fn);
      }
    },

    /**
     * Cancela la suscripción de una función.
     * @param {string} key
     * @param {Function} fn
     */
    off(key, fn) {
      if (_listeners[key]) {
        _listeners[key] = _listeners[key].filter(f => f !== fn);
      }
    },

    /**
     * Carga el estado del usuario desde localStorage al arrancar la app.
     */
    hydrate() {
      try {
        const raw = localStorage.getItem('notigas_user_data');
        if (raw) {
          const userData = JSON.parse(raw);
          this.set('userData', userData);
          this.set('userRole', userData.role || 'vecino');
          this.set('appMode', userData.role === 'repartidor' ? 'driver' : 'buyer');
        }

        const rawOrder = localStorage.getItem('notigas_active_order');
        if (rawOrder) {
          const order = JSON.parse(rawOrder);
          const ORDER_EXPIRATION_MS = 48 * 60 * 60 * 1000;
          if (order.timestamp && (Date.now() - order.timestamp) < ORDER_EXPIRATION_MS) {
            this.set('activeOrder', order);
          } else {
            localStorage.removeItem('notigas_active_order');
          }
        }
      } catch (e) {
        console.error('[AppState] Error al hidratar estado desde localStorage:', e);
      }
    },

    /**
     * Devuelve una copia del estado completo (solo para debugging).
     */
    snapshot() {
      return { ..._state };
    }
  };

  // Exponer globalmente
  window.AppState = AppState;

  // Hidratar automáticamente al cargar
  document.addEventListener('DOMContentLoaded', () => AppState.hydrate());

  console.log('✅ AppState cargado correctamente.');
})();
