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
  if (str === null || str === undefined) return '';
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
    city: 'cochabamba',        // Ciudad por defecto segura (se actualiza por GPS/login/selector)
    gpsLat: null,
    gpsLng: null,
    gpsReady: false,
    activeOrder: null,         // Pedido activo del usuario actual
    realtimeConnected: false,  // Estado de conexión Supabase Realtime
    appMode: 'buyer',          // 'buyer' | 'driver'
    isDriverLive: false,       // Si el repartidor está transmitiendo en vivo
    driverGpsLive: 'off',      // El recorrido solo inicia por acción explícita del repartidor
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

      // Sincronizar de forma transparente con listeners
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
      try {
        if (!window.supabaseClient) return;
        const { data } = await window.supabaseClient.auth.getSession();
        if (data && data.session && data.session.user) {
          const user = data.session.user;
          const meta = user.user_metadata || {};

          // 1. Buscar en choferes_habilitados
          const { data: driverData } = await window.supabaseClient
            .from('choferes_habilitados')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (driverData) {
            _state['userRole'] = 'repartidor';
            _state['appMode'] = 'driver';
            if (driverData.ciudad) _state['city'] = driverData.ciudad.toLowerCase().trim();
            _state['userData'] = {
              role: 'repartidor',
              nombre: driverData.nombre_completo || meta.full_name || user.email.split('@')[0],
              whatsapp: driverData.telefono_whatsapp || '',
              placa: driverData.placa || '',
              categoria: driverData.categoria || 'gas',
              productos: driverData.productos || '',
              schedule: driverData.schedule || '',
              ciudad: driverData.ciudad || _state['city'],
              user_id: user.id,
              gmail: user.email
            };
          } else {
            // 2. Buscar en profiles
            const { data: profileData } = await window.supabaseClient
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .maybeSingle();

            if (profileData) {
              _state['userRole'] = profileData.role || 'vecino';
              _state['appMode'] = profileData.role === 'repartidor' ? 'driver' : 'buyer';
              if (profileData.ciudad) _state['city'] = profileData.ciudad.toLowerCase().trim();
              _state['userData'] = {
                role: profileData.role || 'vecino',
                nombre: profileData.nombre || meta.full_name || user.email.split('@')[0],
                apellido: profileData.apellido || '',
                telefono: profileData.telefono || '',
                ciudad: profileData.ciudad || _state['city'],
                user_id: user.id,
                gmail: user.email
              };
            } else if (Object.keys(meta).length > 0) {
              _state['userData'] = {
                ...meta,
                user_id: user.id,
                gmail: user.email
              };
              _state['userRole'] = meta.role || 'vecino';
              if (meta.ciudad || meta.city) {
                _state['city'] = (meta.ciudad || meta.city).toLowerCase();
              }
              _state['appMode'] = meta.role === 'repartidor' ? 'driver' : 'buyer';
            }
          }
        }

        // Pedido Activo (Consultar a Supabase)
        if (data && data.session && data.session.user && _state['userRole'] === 'vecino') {
           const { data: activeOrders } = await window.supabaseClient
             .from('pedidos')
             .select('*')
             .eq('user_id', data.session.user.id)
             .in('estado', ['pendiente', 'visto', 'asignado'])
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
  console.log('✅ AppState inicializado.');
})();
