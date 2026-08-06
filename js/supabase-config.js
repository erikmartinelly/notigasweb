// Configuración e Inicialización de Supabase
const SUPABASE_URL = 'https://yxzzfqyehllogzzhdtmc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2';

// Inyectar el script de Supabase CDN de forma dinámica
const script = document.createElement('script');
script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
script.onload = () => {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase conectado correctamente.');
    
    // Si la función de inicialización en tiempo real existe, lanzarla
    if (typeof iniciarSuscripcionesRealtime === 'function') {
        iniciarSuscripcionesRealtime();
    }
};
document.head.appendChild(script);

// Variable global para ID del recorrido activo del repartidor actual
window.currentDriverPublicationId = null;
window.driverLocationInterval = null;

// --- FUNCIONES PARA REPARTIDORES ---
window.startDriverLocationBroadcast = async function(driverName, driverCategory) {
    if (!window.supabaseClient) return;
    
    const lat = typeof currentGpsLat !== 'undefined' ? currentGpsLat : -17.3895;
    const lng = typeof currentGpsLng !== 'undefined' ? currentGpsLng : -66.1568;

    const { data, error } = await window.supabaseClient.from('publicaciones').insert([{
        tipo: 'rutaDistribuidor',
        categoria: driverCategory || 'gas',
        titulo: `Repartidor en Ruta: ${driverName}`,
        ciudad: 'Cochabamba',
        barrio_otb: 'Global',
        user_email: 'driver@notigas.com', // Placeholder por ahora
        user_role: 'driver',
        latitude: lat,
        longitude: lng,
        distribuidor_nombre: driverName,
        garrafas_agotadas: false
    }]).select('id').single();

    if (error) {
        console.error("Error al iniciar broadcast en Supabase:", error);
    } else if (data) {
        window.currentDriverPublicationId = data.id;
        console.log("🚚 Ruta de repartidor creada en Supabase, ID:", window.currentDriverPublicationId);
        
        // Iniciar loop de actualización cada 5 segundos
        if (window.driverLocationInterval) clearInterval(window.driverLocationInterval);
        window.driverLocationInterval = setInterval(window.updateDriverLocation, 5000);
    }
};

window.updateDriverLocation = async function() {
    if (!window.supabaseClient || !window.currentDriverPublicationId) return;
    const lat = typeof currentGpsLat !== 'undefined' ? currentGpsLat : -17.3895;
    const lng = typeof currentGpsLng !== 'undefined' ? currentGpsLng : -66.1568;

    const { error } = await window.supabaseClient.from('publicaciones')
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
        // Marcar como "garrafas_agotadas" para ocultarlo o eliminarlo
        await window.supabaseClient.from('publicaciones')
            .delete()
            .eq('id', window.currentDriverPublicationId);
        window.currentDriverPublicationId = null;
        console.log("🔴 Ruta de repartidor eliminada de Supabase.");
    }
};

// --- SUSCRIPCIONES EN TIEMPO REAL PARA COMPRADORES ---
window.iniciarSuscripcionesRealtime = function() {
    if (!window.supabaseClient) return;
    
    console.log("📡 Iniciando suscripciones Realtime a Supabase...");
    
    // Escuchar tabla publicaciones (Repartidores en ruta y pedidos)
    window.supabaseClient.channel('publicaciones_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'publicaciones' }, payload => {
            console.log("🔄 Evento Realtime recibido:", payload);
            
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const data = payload.new;
                if (data.tipo === 'rutaDistribuidor') {
                    // Actualizar camioncito en el mapa
                    if (typeof actualizarRepartidorEnMapa === 'function') {
                        actualizarRepartidorEnMapa(data);
                    }
                } else if (data.tipo === 'pedido') {
                    // Actualizar pedidos de vecinos
                    if (typeof agregarPedidoVecinoEnMapa === 'function') {
                        agregarPedidoVecinoEnMapa(data);
                    }
                }
            } else if (payload.eventType === 'DELETE') {
                const data = payload.old;
                if (typeof removerPublicacionDeMapa === 'function') {
                    removerPublicacionDeMapa(data.id);
                }
            }
        })
        .subscribe();
};
