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
const MAX_REALTIME_RETRIES = 8;

// 1. Suscripción a Avisos Oficiales en tiempo real
window.iniciarSuscripcionAvisos = function() {
    if (!window.supabaseClient) return;
    const ciudad = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
    if (!ciudad) return;

    if (window.notigasAvisosChannel) {
        try { window.supabaseClient.removeChannel(window.notigasAvisosChannel); } catch(e) {}
        window.notigasAvisosChannel = null;
    }

    console.log(`📢 Suscribiendo a canal avisos-${ciudad}...`);

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
                        mostrarPopupAlertaRepartidor(`👑 <strong>COMUNICADO OFICIAL ADMINISTRACIÓN OTB:</strong><br>${mensaje}`);
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

    // Evitar canales duplicados
    if (window.notigasGlobalChannel) {
        try { window.supabaseClient.removeChannel(window.notigasGlobalChannel); } catch(e) {}
        window.notigasGlobalChannel = null;
    }

    const activeCity = (typeof AppState !== 'undefined') ? AppState.get('city') : null;
    if (!activeCity) {
        console.warn('⚠️ No hay ciudad activa definida para suscripción Realtime.');
        return;
    }

    console.log(`📡 Suscripción Realtime global iniciando para ${activeCity}... (intento ${_realtimeRetryCount + 1})`);

    // Cargar datos iniciales al conectar
    if (_realtimeRetryCount === 0 && typeof cargarPedidosVecinalesEnVivo === 'function') {
        cargarPedidosVecinalesEnVivo();
    }

    window.notigasGlobalChannel = window.supabaseClient.channel('global_changes_' + activeCity)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `ciudad=eq.${activeCity}` }, payload => {
            const data = payload.new;
            
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
                if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
                if (data && typeof agregarPedidoVecinoEnMapa === 'function') agregarPedidoVecinoEnMapa(data);
            } else if (payload.eventType === 'DELETE') {
                if (typeof cargarPedidosVecinalesEnVivo === 'function') cargarPedidosVecinalesEnVivo();
                if (typeof renderDriverOrdersList === 'function') renderDriverOrdersList();
                if (payload.old && payload.old.id && typeof removerPublicacionDeMapa === 'function') {
                    removerPublicacionDeMapa(payload.old.id);
                }
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_repartidores', filter: `ciudad=eq.${activeCity}` }, payload => {
            const data = payload.new;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                if (typeof actualizarRepartidorEnMapa === 'function') actualizarRepartidorEnMapa(data);
            } else if (payload.eventType === 'DELETE') {
                if (typeof removerPublicacionDeMapa === 'function') removerPublicacionDeMapa(payload.old.id);
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos', filter: `ciudad=eq.${activeCity}` }, payload => {
            if (typeof renderForumFeed === 'function') renderForumFeed();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios_avisos' }, payload => {
            // Recargar comentarios del foro si el usuario tiene un post abierto, y refrescar el feed para los contadores
            if (typeof renderForumFeed === 'function') renderForumFeed();
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
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Realtime global conectado correctamente para ${activeCity}.`);
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
        if (window.notigasGlobalChannel) {
            window.notigasGlobalChannel.unsubscribe();
            window.notigasGlobalChannel = null;
        }
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

    if (window.notigasAvisosChannel) {
        try {
            await window.supabaseClient.removeChannel(window.notigasAvisosChannel);
        } catch(e) {}
        window.notigasAvisosChannel = null;
    }

    if (window.notigasGlobalChannel) {
        try {
            await window.supabaseClient.removeChannel(window.notigasGlobalChannel);
        } catch(e) {}
        window.notigasGlobalChannel = null;
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

    if (typeof AppState !== 'undefined') {
        AppState.set('city', nuevaCiudad);
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
