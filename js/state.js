/* ==========================================================================
   NOTIGAS - SISTEMA DE GESTIÓN DE ESTADO CENTRALIZADO (Pub/Sub)
   
   Uso:
   - AppState.set('userRole', 'repartidor')       → cambia el estado
   - AppState.get('userRole')                      → lee el estado
   - AppState.on('userRole', fn)                   → escucha cambios
   - AppState.off('userRole', fn)                  → deja de escuchar
   ========================================================================== */

/* =====================================================
   ADMIN EMAILS
   ===================================================== */
window.ADMIN_EMAILS = ["erikmartinelly@gmail.com", "leonmartinelly13@gmail.com"];

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

    set(key, value) {
      const prev = _state[key];
      _state[key] = value;

      // Sincronizar de forma transparente con Supabase Auth (metadata) en lugar de localStorage
      if (key === 'city' && window.supabaseClient) {
        window.supabaseClient.auth.updateUser({ data: { ciudad: value } }).catch(() => {});
      }
      
      if (key === 'userData' && window.supabaseClient && value) {
        window.supabaseClient.auth.updateUser({ data: value }).catch(() => {});
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

    on(key, fn) {
      if (!_listeners[key]) _listeners[key] = [];
      if (!_listeners[key].includes(fn)) {
        _listeners[key].push(fn);
      }
    },

    off(key, fn) {
      if (_listeners[key]) {
        _listeners[key] = _listeners[key].filter(f => f !== fn);
      }
    },

    async hydrate() {
      // 100% Dependiente de Supabase Auth
      try {
        if (!window.supabaseClient) return;
        const { data } = await window.supabaseClient.auth.getSession();
        if (data && data.session && data.session.user) {
          const user = data.session.user;
          const meta = user.user_metadata || {};
          
          if (Object.keys(meta).length > 0) {
            // Establecer sin disparar el guardado nuevamente
            _state['userData'] = meta;
            _state['userRole'] = meta.role || 'vecino';
            _state['city'] = meta.ciudad || meta.city || 'santacruz';
            _state['appMode'] = meta.role === 'repartidor' ? 'driver' : 'buyer';
          }
        }
        
        // Pedido Activo (Consultar a Supabase en lugar de local storage)
        if (data && data.session && data.session.user && _state['userRole'] === 'vecino') {
           const { data: activeOrders } = await window.supabaseClient
             .from('pedidos_vecinales')
             .select('*')
             .eq('user_id', data.session.user.id)
             .in('estado', ['pendiente', 'aceptado'])
             .order('created_at', { ascending: false })
             .limit(1);
             
           if (activeOrders && activeOrders.length > 0) {
             _state['activeOrder'] = activeOrders[0];
           }
        }
      } catch (e) {
        console.error('[AppState] Error al hidratar estado desde Supabase:', e);
      }
    },

    snapshot() {
      return { ..._state };
    }
  };

  window.AppState = AppState;

  // Ya no hidratamos aquí. Se hidratará en initAuthSession de auth.js cuando Supabase esté listo.
  console.log('✅ AppState cargado correctamente. Esperando conexión a Supabase...');
})();
