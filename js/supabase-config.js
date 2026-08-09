// Configuración e Inicialización de Supabase
const SUPABASE_URL = 'https://yxzzfqyehllogzzhdtmc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2';

// =====================================================================
// INICIALIZACIÓN DEL CLIENTE SUPABASE (CRÍTICO - FIX AUTENTICACIÓN)
// =====================================================================
(function initSupabaseClient() {
  try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      });
      console.log('✅ Supabase Client inicializado correctamente.');
    } else {
      // SDK aún no cargado — reintentar hasta que esté disponible
      let retries = 0;
      const waitForSdk = setInterval(() => {
        retries++;
        if (typeof supabase !== 'undefined' && supabase.createClient) {
          window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
              autoRefreshToken: true,
              persistSession: true,
              detectSessionInUrl: true
            }
          });
          console.log('✅ Supabase Client inicializado (reintento ' + retries + ').');
          clearInterval(waitForSdk);
        } else if (retries >= 20) {
          console.error('❌ Supabase SDK no pudo cargarse después de ' + retries + ' intentos.');
          clearInterval(waitForSdk);
        }
      }, 250);
    }
  } catch (e) {
    console.error('❌ Error al inicializar Supabase Client:', e);
  }
})();


// Variable global para ID del recorrido activo del repartidor actual
window.currentDriverPublicationId = null;
window.driverLocationInterval = null;

// --- FUNCIONES PARA REPARTIDORES ---
  window.startDriverLocationBroadcast = async function(driverName, driverCategory) {
      if (!window.supabaseClient) return;
      
      const lat = typeof currentGpsLat !== 'undefined' ? currentGpsLat : -17.3895;
      const lng = typeof currentGpsLng !== 'undefined' ? currentGpsLng : -66.1568;
      
      const userStr = localStorage.getItem('notigas_user_data') || '{}';
      let userId = null;
      try { userId = JSON.parse(userStr).user_id; } catch(e){}
      
      if (!userId) {
          console.error("No hay user_id para registrar la ruta.");
          return;
      }
  
      const { data, error } = await window.supabaseClient.from('rutas_repartidores').upsert([{
          user_id: userId,
          categoria: driverCategory || 'gas',
          titulo: `Repartidor en Ruta: ${driverName}`,
          ciudad: 'Cochabamba',
          latitude: lat,
          longitude: lng,
          distribuidor_nombre: driverName,
          garrafas_agotadas: false
      }], { onConflict: 'user_id' }).select('id').single();
  
      if (error) {
          console.error("Error al iniciar broadcast en Supabase:", error);
      } else if (data) {
          window.currentDriverPublicationId = data.id;
          console.log("Ruta de repartidor creada/actualizada en Supabase, ID:", window.currentDriverPublicationId);
          
          if (window.driverLocationInterval) clearInterval(window.driverLocationInterval);
          window.driverLocationInterval = setInterval(window.updateDriverLocation, 5000);
      }
  };
  
  window.updateDriverLocation = async function() {
      if (!window.supabaseClient || !window.currentDriverPublicationId) return;
      const lat = typeof currentGpsLat !== 'undefined' ? currentGpsLat : -17.3895;
      const lng = typeof currentGpsLng !== 'undefined' ? currentGpsLng : -66.1568;
  
      const { error } = await window.supabaseClient.from('rutas_repartidores')
          .update({ latitude: lat, longitude: lng })
          .eq('id', window.currentDriverPublicationId);
  
      if (error) console.error("Error al actualizar ubicación en Supabase:", error);
  };
  
  window.stopDriverLocationBroadcast = async function() {
      if (window.driverLocationInterval) {
          clearInterval(window.driverLocationInterval);
          window.driverLocationInterval = null;
      }
      if (window.supabaseClient && window.currentDriverPublicationId) {
          await window.supabaseClient.from('rutas_repartidores')
              .delete()
              .eq('id', window.currentDriverPublicationId);
          window.currentDriverPublicationId = null;
          console.log("Ruta de repartidor eliminada de Supabase.");
      }
  };

// --- SUSCRIPCIONES EN TIEMPO REAL CON RECONEXIÓN AUTOMÁTICA ---
let _realtimeChannel = null;
let _realtimeRetryCount = 0;
let _realtimeRetryTimeout = null;
const MAX_REALTIME_RETRIES = 8;

window.iniciarSuscripcionesRealtime = function() {
    if (!window.supabaseClient) return;

    // Evitar canales duplicados
    if (_realtimeChannel) {
        try { window.supabaseClient.removeChannel(_realtimeChannel); } catch(e) {}
        _realtimeChannel = null;
    }

    console.log(`📡 Suscripción Realtime iniciando... (intento ${_realtimeRetryCount + 1})`);

    // Cargar datos iniciales al conectar
    if (_realtimeRetryCount === 0 && typeof cargarPedidosVecinalesEnVivo === 'function') {
        cargarPedidosVecinalesEnVivo();
    }

    _realtimeChannel = window.supabaseClient.channel('global_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
            const data = payload.new;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                if (typeof agregarPedidoVecinoEnMapa === 'function') agregarPedidoVecinoEnMapa(data);
            } else if (payload.eventType === 'DELETE') {
                if (typeof removerPublicacionDeMapa === 'function') removerPublicacionDeMapa(payload.old.id);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_repartidores' }, payload => {
            const data = payload.new;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                if (typeof actualizarRepartidorEnMapa === 'function') actualizarRepartidorEnMapa(data);
            } else if (payload.eventType === 'DELETE') {
                if (typeof removerPublicacionDeMapa === 'function') removerPublicacionDeMapa(payload.old.id);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' }, payload => {
            if (typeof renderForumFeed === 'function') renderForumFeed();
        })
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ Realtime conectado correctamente.');
                _realtimeRetryCount = 0; // Resetear contador en conexión exitosa
                if (window.AppState) window.AppState.set('realtimeConnected', true);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.warn(`⚠️ Realtime desconectado (${status}). Intentando reconectar...`);
                if (window.AppState) window.AppState.set('realtimeConnected', false);
                _programarReconexionRealtime();
            }
        });
};

function _programarReconexionRealtime() {
    if (_realtimeRetryTimeout) clearTimeout(_realtimeRetryTimeout);
    if (_realtimeRetryCount >= MAX_REALTIME_RETRIES) {
        console.error('❌ Realtime: se agotaron los reintentos de reconexión.');
        if (typeof showToast === 'function') {
            showToast('⚠️ Sin conexión en vivo', 'No se pudo reconectar al servidor. Usa el botón 🔄 para recargar datos.', 'warning', 6000);
        }
        return;
    }

    // Backoff exponencial: 2s, 4s, 8s, 16s, 32s, 64s...
    const delay = Math.min(2000 * Math.pow(2, _realtimeRetryCount), 64000);
    _realtimeRetryCount++;
    console.log(`🔁 Reconexión Realtime en ${delay / 1000}s (intento ${_realtimeRetryCount}/${MAX_REALTIME_RETRIES})...`);

    _realtimeRetryTimeout = setTimeout(() => {
        if (window.supabaseClient) window.iniciarSuscripcionesRealtime();
    }, delay);
}

