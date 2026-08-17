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
      document.dispatchEvent(new Event('supabase_ready'));
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
          document.dispatchEvent(new Event('supabase_ready'));
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

window.stopDriverLocationBroadcast = async function() {
    if (window.driverLocationInterval) {
        clearInterval(window.driverLocationInterval);
        window.driverLocationInterval = null;
    }
    if (window.supabaseClient) {
        try {
            const localUserId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : null;
            if (localUserId) {
              await window.supabaseClient.from('rutas_repartidores')
                  .delete()
                  .eq('user_id', localUserId);
              console.log("Ruta de repartidor eliminada de Supabase.");
            }
        } catch (error) {
            console.error("Error al eliminar ruta:", error);
        } finally {
            window.currentDriverPublicationId = null;
        }
    }
};

// --- CANALES GLOBALES Y SUSCRIPCIONES EN TIEMPO REAL ---
window.notigasGlobalChannel = null;
window.notigasAvisosChannel = null;
let _realtimeRetryCount = 0;
let _realtimeRetryTimeout = null;
let _realtimeGeneration = 0;
let _activeRealtimeCity = null;
let _activeAvisosCity = null;
const MAX_REALTIME_RETRIES = 8;

function _isRealtimeChannelActive(channel) {
    if (!channel) return false;
    const state = String(channel?.state || '').toLowerCase();
    return !['closed', 'errored', 'leaving'].includes(state);
}

function _clearRealtimeRetryTimer() {
    if (_realtimeRetryTimeout) {
        clearTimeout(_realtimeRetryTimeout);
        _realtimeRetryTimeout = null;
    }
}

// 1. Suscripción a Avisos Oficiales en tiempo real
window.iniciarSuscripcionAvisos = function() {
    if (!window.supabaseClient) return;
    const rawCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'cochabamba') : 'cochabamba';
    const ciudad = String(rawCity || 'cochabamba').toLowerCase().trim();
    if (!ciudad) return;

    if (_activeAvisosCity === ciudad && _isRealtimeChannelActive(window.notigasAvisosChannel)) {
        return;
    }

    if (window.notigasAvisosChannel) {
        const oldAvisosChannel = window.notigasAvisosChannel;
        window.notigasAvisosChannel = null;
        _activeAvisosCity = null;
        try { window.supabaseClient.removeChannel(oldAvisosChannel); } catch(e) {}
    }

    console.log(`📢 Suscribiendo a canal avisos-${ciudad}...`);
    _activeAvisosCity = ciudad;

    window.notigasAvisosChannel = window.supabaseClient
        .channel(`avisos-${ciudad}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'avisos',
                filter: `ciudad=eq.${ciudad}`
            },
            payload => {
                const aviso = payload.new;
                if (!aviso) return;

                if (aviso.activo && (aviso.tipo === 'oficial' || aviso.tipo === 'alerta_oficial')) {
                    const mensaje = aviso.mensaje || aviso.descripcion || aviso.titulo || 'Comunicado oficial';
                    if (typeof mostrarPopupAlertaRepartidor === 'function') {
                        mostrarPopupAlertaRepartidor('COMUNICADO OFICIAL ADMINISTRACIÓN OTB', mensaje);
                    }
                    if (typeof showToast === 'function') {
                        showToast('📢 Comunicado Oficial OTB', mensaje, 'info', 6000);
                    }
                }

                // Si es un aviso vecinal o general, actualizar el feed del foro
                if (typeof renderForumFeed === 'function') {
                    renderForumFeed();
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Canal de avisos oficiales conectado para ${ciudad}.`);
            }
        });
};

// 2. Suscripciones generales (Pedidos, Rutas, Comentarios, Broadcasts)
window.iniciarSuscripcionesRealtime = function() {
    if (!window.supabaseClient) return;

    const rawCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'cochabamba') : 'cochabamba';
    const activeCity = String(rawCity || 'cochabamba').toLowerCase().trim();
    if (!activeCity) {
        console.warn('⚠️ No hay ciudad activa definida para suscripción Realtime.');
        return;
    }

    if (_activeRealtimeCity === activeCity && _isRealtimeChannelActive(window.notigasGlobalChannel)) {
        return;
    }

    // Evitar canales duplicados. Incrementar generación invalida callbacks de canales viejos.
    _realtimeGeneration++;
    if (window.notigasGlobalChannel) {
        const oldGlobalChannel = window.notigasGlobalChannel;
        window.notigasGlobalChannel = null;
        _activeRealtimeCity = null;
        try { window.supabaseClient.removeChannel(oldGlobalChannel); } catch(e) {}
    }

    console.log(`📡 Suscripción Realtime global iniciando para ${activeCity}... (intento ${_realtimeRetryCount + 1})`);

    // Cargar datos iniciales al conectar
    if (_realtimeRetryCount === 0 && typeof cargarPedidosVecinalesEnVivo === 'function') {
        cargarPedidosVecinalesEnVivo();
    }

    let _debounceOrdersTimer = null;
    const debouncedRefreshOrders = () => {
        clearTimeout(_debounceOrdersTimer);
        _debounceOrdersTimer = setTimeout(() => {
            if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
            const modal = document.getElementById('modalDriverOrders');
            if (modal && modal.style.display !== 'none' && typeof renderDriverOrdersList === 'function') {
                renderDriverOrdersList();
            }
        }, 300);
    };

    let _debounceForumTimer = null;
    const debouncedRefreshForum = () => {
        const pane = document.getElementById('tab2');
        if (!pane || !pane.classList.contains('active')) return;
        clearTimeout(_debounceForumTimer);
        _debounceForumTimer = setTimeout(() => {
            if (typeof renderForumFeed === 'function') renderForumFeed();
        }, 400);
    };

    const channelGeneration = _realtimeGeneration;
    const globalChannel = window.supabaseClient.channel('global_changes_' + activeCity);
    window.notigasGlobalChannel = globalChannel;
    _activeRealtimeCity = activeCity;

    globalChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `ciudad=eq.${activeCity}` }, payload => {
            const activeOrder = (typeof AppState !== 'undefined') ? AppState.get('activeOrder') : null;
            const changedOrder = payload.new || payload.old;
            if (activeOrder?.id && changedOrder?.id === activeOrder.id && payload.eventType !== 'DELETE') {
                AppState.set('activeOrder', { ...activeOrder, ...payload.new });
            } else if (activeOrder?.id && changedOrder?.id === activeOrder.id && payload.eventType === 'DELETE') {
                AppState.set('activeOrder', null);
            }
            debouncedRefreshOrders();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_repartidores', filter: `ciudad=eq.${activeCity}` }, payload => {
            const data = payload.new;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                if (typeof actualizarRepartidorEnMapa === 'function') actualizarRepartidorEnMapa(data);
            } else if (payload.eventType === 'DELETE') {
                if (typeof removerPublicacionDeMapa === 'function') removerPublicacionDeMapa(payload.old?.id);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos', filter: `ciudad=eq.${activeCity}` }, () => {
            debouncedRefreshForum();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios_avisos' }, () => {
            debouncedRefreshForum();
            if (typeof renderPostComments === 'function' && typeof activePostCommentsRef !== 'undefined' && activePostCommentsRef !== null) {
                 renderPostComments(activePostCommentsRef);
            }
        })
        .on('broadcast', { event: 'vecinos_alert' }, payload => {
            if (payload.payload && typeof recibirAlertaVecinalBroadcast === 'function') {
                recibirAlertaVecinalBroadcast(payload.payload);
            }
        })
        .on('system', { event: '*' }, payload => {
            if (payload.status === 'error' || payload.status === 'disconnected') {
                console.warn('⚠️ Realtime system event reportó error/desconexión', payload);
                if (window.AppState) window.AppState.set('realtimeConnected', false);
            }
        })
        .subscribe((status, err) => {
            if (globalChannel !== window.notigasGlobalChannel || channelGeneration !== _realtimeGeneration) {
                return;
            }
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Realtime global conectado correctamente para ${activeCity}.`);
                _clearRealtimeRetryTimer();
                _realtimeRetryCount = 0; // Resetear contador en conexión exitosa
                if (window.AppState) window.AppState.set('realtimeConnected', true);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.warn(`⚠️ Realtime desconectado (${status}). Intentando reconectar...`);
                window.notigasGlobalChannel = null;
                _activeRealtimeCity = null;
                if (window.AppState) window.AppState.set('realtimeConnected', false);
                _programarReconexionRealtime();
            }
        });
};

function _programarReconexionRealtime() {
    _clearRealtimeRetryTimer();
    if (_realtimeRetryCount >= MAX_REALTIME_RETRIES) {
        console.error('❌ Realtime: se agotaron los reintentos de reconexión.');
        if (window.notigasGlobalChannel) {
            window.notigasGlobalChannel.unsubscribe();
            window.notigasGlobalChannel = null;
        }
        _activeRealtimeCity = null;
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
        if (window.supabaseClient) {
            window.iniciarSuscripcionesRealtime();
            window.iniciarSuscripcionAvisos();
        }
    }, delay);
}

// 3. Función central para reiniciar todas las suscripciones Realtime limpiamente
window.reiniciarSuscripcionesRealtime = async function() {
    if (!window.supabaseClient) return;
    _clearRealtimeRetryTimer();
    _realtimeGeneration++;

    if (window.notigasAvisosChannel) {
        const oldAvisosChannel = window.notigasAvisosChannel;
        window.notigasAvisosChannel = null;
        _activeAvisosCity = null;
        try {
            await window.supabaseClient.removeChannel(oldAvisosChannel);
        } catch(e) {}
    }

    if (window.notigasGlobalChannel) {
        const oldGlobalChannel = window.notigasGlobalChannel;
        window.notigasGlobalChannel = null;
        _activeRealtimeCity = null;
        try {
            await window.supabaseClient.removeChannel(oldGlobalChannel);
        } catch(e) {}
    }

    if (window.adsSubscriptionChannel) {
        try {
            await window.supabaseClient.removeChannel(window.adsSubscriptionChannel);
        } catch(e) {}
        window.adsSubscriptionChannel = null;
    }

    window.iniciarSuscripcionAvisos();
    window.iniciarSuscripcionesRealtime();
    if (typeof iniciarSuscripcionAnuncios === 'function') {
        iniciarSuscripcionAnuncios();
    }
};

// 4. Función central para cambiar de ciudad y reactivar todos los módulos
window.cambiarCiudad = async function(nuevaCiudad) {
    if (!nuevaCiudad) {
        console.error('Ciudad inválida para cambiarCiudad.');
        throw new Error('Ciudad inválida.');
    }

    nuevaCiudad = String(nuevaCiudad).toLowerCase().trim();
    const ciudadActual = (typeof AppState !== 'undefined') ? AppState.get('city') : null;

    if (ciudadActual === nuevaCiudad) {
        window.iniciarSuscripcionAvisos();
        window.iniciarSuscripcionesRealtime();
        if (typeof iniciarSuscripcionAnuncios === 'function') {
            iniciarSuscripcionAnuncios();
        }
        return;
    }

    if (typeof AppState !== 'undefined') {
        AppState.set('city', nuevaCiudad);
    }

    if (typeof map !== 'undefined' && map && window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[nuevaCiudad]) {
        const c = window.BOLIVIA_CITIES[nuevaCiudad];
        if (map.getZoom() <= 10) {
            map.flyTo([c.lat, c.lon || c.lng], 15, { duration: 1.2 });
        }
    }

    await window.reiniciarSuscripcionesRealtime();

    if (typeof renderDriverOrdersList === 'function') {
        await renderDriverOrdersList();
    }
    if (typeof cargarAnunciosGuardados === 'function') {
        await cargarAnunciosGuardados();
    }
    if (typeof renderForumFeed === 'function') {
        renderForumFeed();
    }
    if (typeof descargarChoferesYRenderizar === 'function') {
        descargarChoferesYRenderizar('TODOS');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Iniciar suscripciones al iniciar
    document.addEventListener('supabase_ready', () => {
        window.iniciarSuscripcionesRealtime();
        window.iniciarSuscripcionAvisos();
    });
});
