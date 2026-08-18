/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
   ========================================================================== */
// FIX #16: escapeHtmlStr centralizada en state.js — eliminada aquí para evitar conflictos.

const GOOGLE_CLIENT_ID = "994996215118-d8vhi4qjtbosvak58mm1c6ritq65hnc9.apps.googleusercontent.com";

let currentSelectedRole = 'buyer'; // 'buyer' o 'driver'
let currentSelectedMethod = 'google'; // 'google' o 'email'
let emailAuthRequestInFlight = false;
const AUTH_THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const AUTH_THROTTLE_LOCK_MS = 5 * 60 * 1000;

function getAuthThrottleState(kind) {
  const key = `notigas_auth_throttle_${kind}`;
  try {
    const state = JSON.parse(sessionStorage.getItem(key) || '{}');
    return { key, hits: Number(state.hits || 0), startedAt: Number(state.startedAt || 0), lockedUntil: Number(state.lockedUntil || 0) };
  } catch (_) {
    return { key, hits: 0, startedAt: 0, lockedUntil: 0 };
  }
}

function canRunAuthAction(kind) {
  const now = Date.now();
  const state = getAuthThrottleState(kind);
  if (state.lockedUntil > now) {
    const minutes = Math.max(1, Math.ceil((state.lockedUntil - now) / 60000));
    if (typeof showToast === 'function') showToast('⏳ Acceso temporalmente limitado', `Espera ${minutes} min antes de reintentar.`, 'warning', 5000);
    return false;
  }
  if (state.startedAt && now - state.startedAt >= AUTH_THROTTLE_WINDOW_MS) {
    sessionStorage.removeItem(state.key);
  }
  return true;
}

function recordAuthThrottleHit(kind, maxHits) {
  const now = Date.now();
  const state = getAuthThrottleState(kind);
  const expired = !state.startedAt || now - state.startedAt >= AUTH_THROTTLE_WINDOW_MS;
  const hits = expired ? 1 : state.hits + 1;
  sessionStorage.setItem(state.key, JSON.stringify({
    hits,
    startedAt: expired ? now : state.startedAt,
    lockedUntil: hits >= maxHits ? now + AUTH_THROTTLE_LOCK_MS : 0
  }));
}

function clearAuthThrottle(kind) {
  try { sessionStorage.removeItem(`notigas_auth_throttle_${kind}`); } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Iniciar One Tap en segundo plano
  initGoogleOneTap();

  const initAuthSession = async () => {
    let hasSession = false;
    if (window.supabaseClient) {
      try {
        const { data: sessionData } = await window.supabaseClient.auth.getSession();
        if (sessionData && sessionData.session && sessionData.session.user) {
          hasSession = true;
          window._tempAuthUser = sessionData.session.user;
          
          // Ocultar cualquier modal de autenticación inmediatamente para ingreso directo
          const modalAuth = document.getElementById('modalWelcomeAuth');
          if (modalAuth) modalAuth.style.display = 'none';
          const modalRole = document.getElementById('modalRoleSelection');
          if (modalRole) modalRole.style.display = 'none';

          if (typeof AppState !== 'undefined' && AppState.hydrate) {
            await AppState.hydrate();
          }
          await procesarSesionExitosa(sessionData.session.user);
        }
      } catch(e) {
        console.warn("No se pudo restaurar la sesión automáticamente", e);
      }
    }

    // 2. Si no hay sesión, mostrar el modal de bienvenida/ingreso
    if (!hasSession) {
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'flex';
    } else {
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'none';
    }

    // 3. Notificar al resto de la app que Auth terminó su validación inicial
    document.dispatchEvent(new Event('notigas_auth_ready'));
  };

  if (window.supabaseClient) {
    initAuthSession();
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        window._tempAuthUser = session.user;
        window.checkAndApplyAdminStatus(session.user);
      }
    });
  } else {
    document.addEventListener('supabase_ready', () => {
      initAuthSession();
      if (window.supabaseClient) {
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
          if (session && session.user) {
            window._tempAuthUser = session.user;
            window.checkAndApplyAdminStatus(session.user);
          }
        });
      }
    });
  }
});

window.checkAndApplyAdminStatus = async function(user) {
  if (!window.supabaseClient) return false;
  try {
    let email = user?.email;
    if (!email) {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      email = sessionData?.session?.user?.email;
    }
    if (!email) {
      const { data: userData } = await window.supabaseClient.auth.getUser();
      email = userData?.user?.email;
    }
    if (!email) {
      const btnAdmin = document.getElementById('btnAdminAccessQuick');
      if (btnAdmin) btnAdmin.style.display = 'none';
      AppState.set('isAdmin', false);
      window._verifiedAdminEmail = null;
      return false;
    }

    const { data: adminData, error } = await window.supabaseClient
      .from('admin_credentials')
      .select('email')
      .ilike('email', email.toLowerCase().trim())
      .limit(1)
      .maybeSingle();

    if (adminData && adminData.email) {
      const btnAdmin = document.getElementById('btnAdminAccessQuick');
      if (btnAdmin) btnAdmin.style.display = 'flex';
      AppState.set('isAdmin', true);
      window._verifiedAdminEmail = email.toLowerCase().trim();
      return true;
    } else {
      const btnAdmin = document.getElementById('btnAdminAccessQuick');
      if (btnAdmin) btnAdmin.style.display = 'none';
      AppState.set('isAdmin', false);
      window._verifiedAdminEmail = null;
      return false;
    }
  } catch(e) {
    console.warn("Error comprobando estado de admin:", e);
    AppState.set('isAdmin', false);
    return false;
  }
};

function getCurrentUserId() {
  // Priorizar siempre el ID de la sesión autenticada real
  if (window._tempAuthUser && window._tempAuthUser.id) {
    return window._tempAuthUser.id;
  }

  const u = AppState.get('userData');
  if (u && typeof u === 'object') {
    if (u.user_id) return u.user_id;
    if (u.id) return u.id;
  }
  return 'anonimo_id';
}
window.getCurrentUserId = getCurrentUserId;

async function getAuthenticatedUserId() {
  if (!window.supabaseClient) return null;
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}
window.getAuthenticatedUserId = getAuthenticatedUserId;

async function guardarPerfilSupabase(user, changes = {}) {
    if (!window.supabaseClient || !user?.id) {
        throw new Error(
            'Supabase o usuario no disponibles'
        );
    }

    const currentCity = (changes.ciudad || AppState.get('city') || 'cochabamba').toLowerCase().trim();
    const payload = {
        id: user.id,
        role: changes.role || 'vecino',
        ciudad: currentCity || 'cochabamba',
        ...changes,
        updated_at: new Date().toISOString()
    };
    if (!payload.ciudad) payload.ciudad = 'cochabamba';

    const { data, error } =
        await window.supabaseClient
            .from('profiles')
            .upsert(
                [payload],
                {
                    onConflict: 'id'
                }
            )
            .select()
            .single();

    if (error) {
        console.error(
            'Error actualizando profile:',
            error
        );
        throw error;
    }

    return data;
}

async function guardarUbicacionHabitualUsuario(
    user,
    lat,
    lng
) {
    const inferred = typeof inferMainCityFromCoords === 'function' ? inferMainCityFromCoords(lat, lng) : null;
    const ciudad = (inferred || AppState.get('city') || 'cochabamba').toLowerCase().trim();

    await guardarPerfilSupabase(
        user,
        {
            role: 'vecino',
            ciudad: ciudad || 'cochabamba',
            latitude: lat,
            longitude: lng,
            location_updated_at:
                new Date().toISOString()
        }
    );

    if (ciudad) {
        AppState.set('city', ciudad);
    }

    AppState.set(
        'gpsLat',
        lat
    );

    AppState.set(
        'gpsLng',
        lng
    );

    if (typeof showToast === 'function') {
        showToast(
            '📍 Ubicación guardada',
            'Tu ubicación habitual quedó registrada. Ya puedes apagar el GPS.',
            'success',
            7000
        );
    }
}

async function solicitarYGuardarUbicacionHabitual(user) {
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    try {
        let lat = window.currentGpsLat;
        let lng = window.currentGpsLng;

        if (lat == null || lng == null) {
            const locationPromise = (isMobile && typeof solicitarGeolocalizacionNativaNavegador === 'function')
                ? solicitarGeolocalizacionNativaNavegador(true, true)
                : ((typeof obtenerUbicacionIPFallbackDesktop === 'function') ? obtenerUbicacionIPFallbackDesktop(true) : null);

            if (locationPromise) {
                try {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
                    const res = await Promise.race([locationPromise, timeoutPromise]);
                    if (res?.coords) {
                        lat = res.coords.latitude;
                        lng = res.coords.longitude;
                    } else if (res?.lat != null) {
                        lat = res.lat;
                        lng = res.lng;
                    }
                } catch(e) {
                    console.warn('Geolocalización rápida omitida o con espera larga:', e);
                }
            }
        }

        // Si todavía no hay coords, usar la capital actual de BOLIVIA_CITIES
        if (lat == null || lng == null) {
            const currentCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'cochabamba') : 'cochabamba';
            const cityDef = (window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[currentCity])
                ? window.BOLIVIA_CITIES[currentCity]
                : { lat: -17.3895, lon: -66.1568 };
            lat = cityDef.lat;
            lng = cityDef.lon || cityDef.lng;
        }

        await guardarUbicacionHabitualUsuario(user, lat, lng);

        if (typeof detenerGPSComprador === 'function') {
            detenerGPSComprador();
        }

        return true;
    } catch (error) {
        console.warn('Ubicación base asignada por fallback:', error);
        const currentCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'cochabamba') : 'cochabamba';
        const cityDef = (window.BOLIVIA_CITIES && window.BOLIVIA_CITIES[currentCity])
            ? window.BOLIVIA_CITIES[currentCity]
            : { lat: -17.3895, lon: -66.1568 };

        await guardarUbicacionHabitualUsuario(user, cityDef.lat, cityDef.lon || cityDef.lng);
        return true;
    } finally {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    }
}

async function selectAuthRole(role) {
  currentSelectedRole = role;
  const btnBuyer = document.getElementById('btnRoleBuyer');
  const btnDriver = document.getElementById('btnRoleDriver');
  const authFieldsBuyer = document.getElementById('authFieldsBuyer');
  const authFieldsDriver = document.getElementById('authFieldsDriver');

  if (btnBuyer) {
    if (role === 'buyer') {
      btnBuyer.classList.add('active');
    } else {
      btnBuyer.classList.remove('active');
    }
  }

  if (btnDriver) {
    if (role === 'driver') {
      btnDriver.classList.add('active');
    } else {
      btnDriver.classList.remove('active');
    }
  }

  // Validar sesión activa directamente contra Supabase (fuente de la verdad)
  if (window.supabaseClient) {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Verificando sesión...');
    try {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      if (sessionData && sessionData.session) {
        // Actualizar rol elegido temporalmente en memoria
        currentSelectedRole = role;

        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        // Si Supabase certifica la sesión, procesamos ingreso seguro
        await procesarSesionExitosa(sessionData.session.user);
        return; // Detener flujo
      }
    } catch (e) {
      console.warn('No hay sesión activa', e);
    }
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }

  // SI NO ESTÁ LOGUEADO -> Mostrar Paso 2 (Registro/Login)
  if (typeof showAuthStep === 'function') {
    showAuthStep(2);
  }

  // AL SELECCIONAR REPARTIDOR: Activar vista de campos y ajustar botón
  if (role === 'driver') {
    selectAuthMethod('email');
    if (authFieldsDriver) authFieldsDriver.style.display = 'block';
    if (authFieldsBuyer) authFieldsBuyer.style.display = 'none';

    const submitBtn = document.querySelector('#authPaneEmail .btn-submit');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fa-solid fa-truck-fast"></i> 🚛 Ingresar como Repartidor';
    }
  } else {
    if (authFieldsBuyer) authFieldsBuyer.style.display = 'block';
    if (authFieldsDriver) authFieldsDriver.style.display = 'none';

    const submitBtn = document.querySelector('#authPaneEmail .btn-submit');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Ingresar como Comprador';
    }
  }
}

function selectAuthMethod(method) {
  currentSelectedMethod = method;
  const btnGoogle = document.getElementById('btnAuthMethodGoogle');
  const btnEmail = document.getElementById('btnAuthMethodEmail');
  const paneGoogle = document.getElementById('authPaneGoogle');
  const paneEmail = document.getElementById('authPaneEmail');

  if (btnGoogle && btnEmail) {
    btnGoogle.classList.toggle('active', method === 'google');
    btnEmail.classList.toggle('active', method === 'email');
  }

  if (paneGoogle && paneEmail) {
    if (method === 'email') {
      paneEmail.style.display = 'block';
      paneGoogle.style.display = 'none';
    } else {
      paneGoogle.style.display = 'block';
      paneEmail.style.display = 'none';
    }
  }
}

/* INICIALIZACIÓN OFICIAL Y DE ALTA COMPATIBILIDAD CON FIREFOX / SAFARI / CHROME / BRAVE */
let _googleGisInitialized = false;
function initGoogleOneTap() {
  if (_googleGisInitialized) return;
  if (typeof google !== 'undefined' && google && google.accounts && google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Renderizar el botón oficial de Google para compatibilidad total
      const btnContainer = document.getElementById('g_id_onload_container');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320
        });
        _googleGisInitialized = true;
      }
    } catch(e) {
      console.warn("Google GIS SDK Warning:", e);
    }
  }
}

// Bucle de inicialización de alta resiliencia para Firefox / Safari (espera a que el SDK de Google cargue por completo)
let googleGisRetryCount = 0;
function tryInitGoogleGis() {
  initGoogleOneTap();
  if ((typeof google === 'undefined' || !google || !google.accounts || !google.accounts.id) && googleGisRetryCount < 12) {
    googleGisRetryCount++;
    setTimeout(tryInitGoogleGis, 350);
  }
}

window.addEventListener('load', tryInitGoogleGis);

function parseGoogleJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch(e) {
    console.error("Error al decodificar JWT de Google:", e);
    return null;
  }
}

function iniciarConGoogleDirecto() {
  if (typeof google !== 'undefined' && google && google.accounts && google.accounts.id) {
    try {
      if (!_googleGisInitialized) {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse
        });
        _googleGisInitialized = true;
      }

      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.info("Google One Tap no disponible en este navegador/origen. Alternando a formulario...");
          selectAuthMethod('email');
          const authEmail = document.getElementById('authEmail');
          if (authEmail) authEmail.focus();
          if (typeof showToast === 'function') {
            showToast('Verificación de Correo', 'Ingresa tu correo Gmail en el formulario para ingresar.', 'info', 4000);
          }
        }
      });
    } catch(err) {
      selectAuthMethod('email');
    }
  } else {
    selectAuthMethod('email');
  }
}

async function handleCredentialResponse(response) {
  try {
    if (!response || !response.credential || typeof response.credential !== 'string') {
      selectAuthMethod('email');
      return;
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Autenticando...');

    // 1. Iniciar sesión en Supabase con Google One-Tap
    const { data: authData, error } = await window.supabaseClient.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential
    });

    if (error) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      alert("Error de seguridad: No se pudo verificar la sesión con Supabase. " + error.message);
      return;
    }

    const session = authData.session;
    const user = session.user;
    const gmail = user.email.toLowerCase().trim();
    const nombre = user.user_metadata?.full_name || gmail;

    // Los administradores ingresan como usuarios normales pero con privilegios extra
    try {
      if (window.supabaseClient) {
        const { data } = await window.supabaseClient.from('admin_credentials').select('email').ilike('email', gmail).maybeSingle();
        if (data) {
          const btnAdmin = document.getElementById('btnAdminAccessQuick');
          if (btnAdmin) btnAdmin.style.display = 'flex';
          AppState.set('isAdmin', true);
        }
      }
    } catch(e) {}

    // Delegar todo el flujo de resolución de rol, ciudad y UI a procesarSesionExitosa
    await procesarSesionExitosa(user);

  } catch (error) {
    console.error("Error en handleCredentialResponse:", error);
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    if (typeof showToast === 'function') showToast('Error', 'Ocurrió un error inesperado al procesar la sesión', 'error');
  }
}

async function guardarRepartidorEnBaseDeDatos(repartidorObj) {
  if (!window.supabaseClient) return false;

  if (typeof showLoadingOverlay === 'function') {
    showLoadingOverlay('Registrando repartidor en la nube...');
  }

  // CORRECCIÓN: upsert por user_id en vez de insert puro. Antes cada edición
  // de ficha creaba una fila nueva (duplicado) porque nunca se comprobaba si
  // el chofer ya existía. ci_carnet ya no se usa como llave de unicidad
  // porque el formulario nunca pide ese dato real.
  const { data, error } = await window.supabaseClient.from('choferes_habilitados').upsert([{
    user_id: repartidorObj.user_id,
    nombre_completo: repartidorObj.nombre,
    telefono_whatsapp: repartidorObj.whatsapp,
    placa: repartidorObj.placa,
    categoria: repartidorObj.categoria,
    productos: repartidorObj.productos,
    schedule: repartidorObj.schedule,
    ciudad: repartidorObj.ciudad || AppState.get('city') || null
  }], { onConflict: 'user_id' })
    .select('estado_verificacion')
    .single();

  if (typeof hideLoadingOverlay === 'function') {
    hideLoadingOverlay();
  }

  if (error) {
    console.error("Error registrando chofer en Supabase:", error);
    alert('Error al guardar la ficha: ' + error.message);
    if (typeof showToast === 'function') showToast('Error', 'No se pudo guardar en la nube. ' + error.message, 'error');
    return { ok: false, status: 'error' };
  }

  // Persistir el modo elegido. La ficha del repartidor se conserva aunque
  // después use temporalmente la aplicación como comprador.
  try {
    const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !authData?.user?.id) throw authError || new Error('Sesión no disponible');
    await guardarPerfilSupabase(authData.user, {
      role: 'repartidor',
      nombre: repartidorObj.nombre,
      ciudad: repartidorObj.ciudad || AppState.get('city') || 'cochabamba'
    });
  } catch (profileError) {
    console.error('No se pudo guardar el modo repartidor en el perfil:', profileError);
    if (typeof showToast === 'function') {
      showToast('❌ Perfil incompleto', 'La ficha se guardó, pero no se pudo activar el rol. Intenta nuevamente.', 'error', 5000);
    }
    return { ok: false, status: 'profile_error' };
  }

  return {
    ok: true,
    status: String(data?.estado_verificacion || 'aprobado').toLowerCase()
  };
}

async function guardarRegistroUnico() {
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') { showToast('Notificación', 'Error: El servidor no está disponible. Recarga la página.', 'info', 4000); } else { alert('Error: El servidor no está disponible. Recarga la página.'); };
    return;
  }
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Asegurando conexión...');

  // 1. Obtener sesión activa de Supabase
  const { data: sessionData, error: authError } = await window.supabaseClient.auth.getSession();
  const session = sessionData?.session;
  if (!session || authError) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    if (typeof showToast === 'function') { showToast('Notificación', "❌ Error de seguridad: Debes iniciar sesión con Google o Email antes de continuar.", 'info', 4000); } else { alert("❌ Error de seguridad: Debes iniciar sesión con Google o Email antes de continuar."); };
    console.error(authError);
    return;
  }

  const userId = session.user.id;
  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

  if (currentSelectedRole === 'driver') {
    const nombreNegocio = (document.getElementById('regNombreNegocio')?.value || '').trim() || 'Repartidor Gas GLP';
    const whatsapp = (document.getElementById('regWhatsapp')?.value || '').trim();
    const placa = (document.getElementById('regPlaca')?.value || '').trim();
    const categoria = (document.getElementById('regCategoriaNegocio')?.value || 'gas').trim();

    let productos = 'Varios';
    if (categoria === 'gas') productos = 'Garrafas GLP 10kg';
    else if (categoria === 'detergentes') productos = 'Detergentes y Productos de Limpieza';
    else if (categoria === 'chatarra') productos = 'Compra de Chatarra y Metales';
    else if (categoria === 'papel') productos = 'Papel, Cartón y Reciclaje';
    else if (categoria === 'frutas') productos = 'Frutas, Verduras y Hortalizas';
    else productos = 'Varios';

    const schedule = (document.getElementById('regSchedule')?.value || '').trim() || 'Lunes a Sábado: 07:00 a 18:00';
    const ciudad = (document.getElementById('newUserCity')?.value || AppState.get('city') || '').trim();

    if (!ciudad) {
      if (typeof showToast === 'function') showToast('⚠️ Ciudad Requerida', 'Por favor selecciona la ciudad de operación para tu registro.', 'warning', 4000);
      return;
    }

    const repartidorData = {
      role: 'repartidor',
      nombre: nombreNegocio,
      whatsapp: whatsapp,
      placa: placa,
      categoria: categoria,
      productos: productos,
      schedule: schedule,
      ciudad: ciudad,
      user_id: userId // Usamos el ID seguro generado por Supabase
    };

    const exito = await guardarRepartidorEnBaseDeDatos(repartidorData);
    if (!exito?.ok) {
       // FIX: Si falla la inserción en la nube, no guardar localmente ni activar el modo
       return;
    }

    // El alta es automática. El administrador conserva las acciones de baneo y eliminación.
    AppState.set('userData', repartidorData);

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof setAppMode === 'function') {
      setAppMode('driver');
    }

    if (typeof showToast === 'function') showToast('🟢 Bienvenido Repartidor', `¡Sesión activada para ${nombreNegocio}!`, 'success', 1000);

    if (typeof renderVendorCards === 'function') {
      renderVendorCards('TODOS');
    }
    if (typeof switchTab === 'function') {
      switchTab(0);
    }
  } else {
    const gmail = session.user.email.toLowerCase().trim();
    const nombre = session.user.user_metadata?.full_name || gmail.split('@')[0];
    const apellido = '';

    const clienteData = {
      role: 'vecino',
      gmail,
      nombre,
      apellido,
      user_id: userId // Usamos el ID seguro de Supabase Auth
    };
    AppState.set('userData', clienteData);

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof setAppMode === 'function') setAppMode('buyer');
    if (typeof verificarYActivarChatAdminAuto === 'function') verificarYActivarChatAdminAuto();
    if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Bienvenido a NOTIGAS (${gmail})`, 'success', 1000);
  }
}

function closeDriverModal() {
  const modalDriver = document.getElementById('modalDriver');
  if (modalDriver) modalDriver.style.display = 'none';
}

async function iniciarSesionRepartidor() {
  const nombreNegocio = (document.getElementById('inputDriverNombre')?.value || '').trim();
  const whatsapp = (document.getElementById('inputDriverTelRef')?.value || '').trim();
  const plate = (document.getElementById('inputDriverPlate')?.value || '').trim();
  const categoria = (document.getElementById('inputDriverCat')?.value || 'gas').trim();
  const productos = (document.getElementById('inputDriverProductos')?.value || '').trim();
  const schedule = (document.getElementById('inputDriverSchedule')?.value || '').trim();

  if (!nombreNegocio || !whatsapp || !plate || !productos) {
    if (typeof showToast === 'function') showToast('⚠️ Campos Requeridos', 'Por favor completa todos los campos requeridos.', 'warning', 2000);
    return;
  }

  const tempGmail = sessionStorage.getItem('notigas_temp_gmail') || '';
  let existingGmail = tempGmail;
  let existingUserId = null;
  try {
     const saved = JSON.stringify(AppState.get('userData') || {});
     if (saved) {
       const u = JSON.parse(saved);
       if (u.gmail) existingGmail = u.gmail;
       if (u.user_id) existingUserId = u.user_id;
     }
  } catch(e){}

  // COMPROBACIÓN ESTRICTA DE BANEO POR LA ADMINISTRACIÓN
  if (typeof esRepartidorBaneado === 'function' && esRepartidorBaneado(nombreNegocio, plate, whatsapp, existingGmail)) {
    if (typeof showToast === 'function') {
      showToast('⛔ Acceso Suspendido', 'Tu cuenta de repartidor ha sido suspendida/baneada por la administración de NOTIGAS.', 'error', 2000);
    }
    return;
  }

  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Autenticando...');

  // Asegurar que tenemos una sesión de Supabase Auth para RLS
  if (!existingUserId) {
    if (!window.supabaseClient) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (typeof showToast === 'function') { showToast('Notificación', "Error: El servidor no está disponible. Recarga la página.", 'info', 4000); } else { alert("Error: El servidor no está disponible. Recarga la página."); };
      return;
    }
    const { data: sessionData, error: authError } = await window.supabaseClient.auth.getSession();
    const session = sessionData?.session;
    if (!session || authError) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (typeof showToast === 'function') { showToast('Notificación', "Error: Debes iniciar sesión primero.", 'info', 4000); } else { alert("Error: Debes iniciar sesión primero."); };
      return;
    }
    existingUserId = session.user.id;
  }

  let ciudad = (document.getElementById('inputDriverCiudad')?.value || '').trim();
  if (!ciudad) {
    try {
      const saved = JSON.stringify(AppState.get('userData') || {});
      if (saved) {
        const u = JSON.parse(saved);
        if (u.ciudad) ciudad = u.ciudad;
      }
    } catch(e) {}
  }

  const validCities = ['santacruz', 'cochabamba', 'lapaz', 'elalto', 'sucre', 'tarija', 'oruro', 'potosi', 'trinidad', 'cobija'];
  if (!ciudad || !validCities.includes(ciudad.toLowerCase())) {
    if (typeof showToast === 'function') showToast('Error', 'Debes seleccionar una ciudad válida', 'error', 3000);
    else if (typeof showToast === 'function') { showToast('Notificación', '❌ Error: Debes seleccionar una ciudad válida', 'info', 4000); } else { alert('❌ Error: Debes seleccionar una ciudad válida'); };
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    return;
  }

  const repartidorData = {
    role: 'repartidor',
    nombre: nombreNegocio,
    whatsapp: whatsapp,
    placa: plate,
    categoria: categoria,
    productos: productos,
    schedule: schedule,
    ciudad: ciudad,
    user_id: existingUserId
  };

  if (existingGmail) repartidorData.gmail = existingGmail;

  const exito = await guardarRepartidorEnBaseDeDatos(repartidorData);

  if (!exito?.ok) {
    if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo guardar la configuración. Reintenta.', 'error', 3000);
    return;
  }

  AppState.set('userData', repartidorData);

  if (typeof window.cambiarCiudad === 'function') {
    try {
      await window.cambiarCiudad(ciudad.toLowerCase());
    } catch(e) {
      AppState.set('city', ciudad.toLowerCase());
    }
  } else {
    AppState.set('city', ciudad.toLowerCase());
  }

  sessionStorage.removeItem('notigas_temp_gmail');

  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  closeDriverModal();

  if (typeof setAppMode === 'function') {
    setAppMode('driver');
  }

  if (typeof showToast === 'function') showToast('🟢 Negocio Activado', `Ficha de ${nombreNegocio} registrada.`, 'success', 2000);

  if (typeof renderVendorCards === 'function') {
    renderVendorCards('TODOS');
  }
  if (typeof switchTab === 'function') {
    switchTab(1);
  }
}

function closeUserSettingsModal() {
  const modal = document.getElementById('modalUserSettings');
  if (modal) modal.style.display = 'none';
}

function guardarPrefUsuario() {
  // Detectar si es repartidor
  let isDriver = false;
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) { const u = JSON.parse(saved); isDriver = (u.role === 'repartidor'); }
  } catch(e){}

  if (isDriver) {
    // Guardar GPS
    const gpsSelect = document.getElementById('driverGpsLive');
    const gpsVal = gpsSelect ? gpsSelect.value : 'off';
    AppState.set('driverGpsLive', gpsVal);

    // Guardar sonido repartidor
    const soundSelect = document.getElementById('userPrefSoundDriver');
    const soundVal = soundSelect ? soundSelect.value : 'enabled';
    AppState.set('prefSound', soundVal);

    if (gpsVal === 'on' && typeof window.activarSeguirme === 'function') {
      window.activarSeguirme();
    } else if (gpsVal === 'off' && typeof window.pausarRecorridoRepartidor === 'function') {
      window.pausarRecorridoRepartidor({ silent: true });
    }
  } else {
    // Guardar sonido comprador
    const soundSelect = document.getElementById('userPrefSound');
    const soundVal = soundSelect ? soundSelect.value : 'enabled';
    AppState.set('prefSound', soundVal);
  }

  closeUserSettingsModal();
}

async function cambiarRepartidorAComprador() {
  let loadingVisible = false;
  try {
    if (!window.supabaseClient) throw new Error('No hay conexión con el servicio de cuentas.');
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay('Cambiando a modo Comprador...');
      loadingVisible = true;
    }

    const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError || !authData?.user?.id) {
      throw authError || new Error('La sesión venció. Inicia sesión nuevamente.');
    }

    await guardarPerfilSupabase(authData.user, {
      role: 'vecino',
      ciudad: AppState.get('city') || 'cochabamba'
    });

    if (typeof window.pausarRecorridoRepartidor === 'function') {
      await window.pausarRecorridoRepartidor({ silent: true });
    } else if (typeof window.stopDriverLocationBroadcast === 'function') {
      await window.stopDriverLocationBroadcast();
    }

    const previous = AppState.get('userData') || {};
    AppState.set('userData', {
      ...previous,
      role: 'vecino',
      hasDriverProfile: true,
      user_id: authData.user.id
    });
    AppState.set('driverGpsLive', 'off');
    AppState.set('isDriverLive', false);
    currentSelectedRole = 'buyer';

    if (typeof setAppMode === 'function') setAppMode('buyer');
    closeUserSettingsModal();
    if (typeof closeDriverOrdersModal === 'function') closeDriverOrdersModal();
    if (typeof switchTab === 'function') switchTab(0);
    if (typeof showToast === 'function') {
      showToast('🛍️ Modo Comprador activo', 'Tu ficha de repartidor se conservó. Puedes volver a activarla desde el menú.', 'success', 4200);
    }
    return true;
  } catch (error) {
    console.error('No se pudo cambiar a modo comprador:', error);
    if (typeof showToast === 'function') {
      showToast('❌ No se cambió el rol', error?.message || 'El modo Repartidor continúa activo.', 'error', 5000);
    }
    return false;
  } finally {
    if (loadingVisible && typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}
window.cambiarRepartidorAComprador = cambiarRepartidorAComprador;

async function ejecutarCierreSesionUsuario() {
  let loadingVisible = false;
  try {
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay('Cerrando sesión de forma segura...');
      loadingVisible = true;
    }

    if (typeof window.detenerGPSComprador === 'function') {
      window.detenerGPSComprador();
    }
    if (typeof window.stopDriverLocationBroadcast === 'function') {
      await window.stopDriverLocationBroadcast();
    }

    if (window.supabaseClient?.auth) {
      const { error } = await window.supabaseClient.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }

    AppState.set('userData', null);
    AppState.set('driverGpsLive', 'off');
    AppState.set('isDriverLive', false);
    AppState.set('activeOrder', null);
    AppState.set('isAdmin', false);
    AppState.set('userRole', 'vecino');

    closeUserSettingsModal();
    if (typeof closeDriverModal === 'function') closeDriverModal();
    if (typeof setAppMode === 'function') setAppMode('buyer');

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) {
      modalAuth.style.display = 'flex';
      selectAuthRole('buyer');
    }

    if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
    if (typeof showToast === 'function') {
      showToast('🚪 Sesión cerrada', 'La sesión se cerró correctamente en este dispositivo.', 'info', 2200);
    }
    return true;
  } catch (error) {
    console.error('No se pudo cerrar la sesión:', error);
    if (typeof showToast === 'function') {
      showToast('❌ No se pudo cerrar sesión', error?.message || 'La sesión sigue activa. Intenta nuevamente.', 'error', 5500);
    }
    return false;
  } finally {
    if (loadingVisible && typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}

function cerrarSesionUsuario() {
  const confirmarCierre = () => { void ejecutarCierreSesionUsuario(); };
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🚪', '¿Cerrar Sesión?', 'Se detendrá la ubicación en vivo y podrás volver a ingresar como Comprador o Repartidor.', 'Sí, cerrar sesión', confirmarCierre);
  } else if (confirm('🚪 ¿Estás seguro de que deseas cerrar sesión en NOTIGAS?')) {
    confirmarCierre();
  }
}

window.cerrarSesionUsuario = cerrarSesionUsuario;
window.ejecutarCierreSesionUsuario = ejecutarCierreSesionUsuario;

function eliminarMiCuentaCompleta() {
  const confirmarEliminacion = () => {
    void ejecutarEliminacionTotalCuenta();
  };

  if (typeof showConfirmModal === 'function') {
    showConfirmModal(
      '🗑️',
      '¿Eliminar Cuenta Completa?',
      'Esta acción borrará permanentemente tu acceso, pedidos, publicaciones, comentarios y datos de repartidor. No se puede deshacer.',
      'Sí, eliminar definitivamente',
      confirmarEliminacion
    );
    return;
  }

  if (confirm('¿Eliminar permanentemente tu cuenta y todos tus datos? Esta acción no se puede deshacer.')) {
    confirmarEliminacion();
  }
}

function limpiarEstadoLocalTrasEliminarCuenta() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('notigas_')) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));

  sessionStorage.clear();
  AppState.set('userData', null);
  AppState.set('activeOrder', null);
  AppState.set('isAdmin', false);
  AppState.set('userRole', 'vecino');
  AppState.set('appMode', 'buyer');
  AppState.set('isDriverLive', false);
  AppState.set('driverGpsLive', 'off');
}

async function ejecutarEliminacionTotalCuenta() {
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') {
      showToast('❌ No se pudo eliminar', 'No hay conexión con el servicio de cuentas. Intenta nuevamente.', 'error', 6000);
    }
    return false;
  }

  let loadingVisible = false;
  try {
    const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) {
      throw new Error('Tu sesión venció. Inicia sesión nuevamente antes de eliminar la cuenta.');
    }

    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay('Eliminando tu cuenta y todos tus datos...');
      loadingVisible = true;
    }

    // Detener temporizadores y telemetría antes de que desaparezca la sesión.
    if (typeof window.stopDriverLocationBroadcast === 'function') {
      await window.stopDriverLocationBroadcast();
    }

    const { error: deleteError } = await window.supabaseClient.rpc('delete_user_account');
    if (deleteError) throw deleteError;

    // La cuenta ya no existe en Auth; solo se invalida la sesión guardada en este navegador.
    try {
      await window.supabaseClient.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      console.warn('La cuenta se eliminó, pero no se pudo limpiar la sesión automáticamente:', signOutError);
    }

    limpiarEstadoLocalTrasEliminarCuenta();
    closeUserSettingsModal();
    if (typeof closeDriverModal === 'function') closeDriverModal();
    if (typeof setAppMode === 'function') setAppMode('buyer');

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'flex';

    if (typeof showToast === 'function') {
      showToast('🗑️ Cuenta eliminada', 'Supabase confirmó la eliminación completa de tu cuenta y tus datos.', 'success', 3500);
    }

    setTimeout(() => window.location.reload(), 1200);
    return true;
  } catch (error) {
    console.error('No se pudo eliminar completamente la cuenta:', error);
    if (typeof showToast === 'function') {
      showToast(
        '❌ No se pudo eliminar la cuenta',
        error?.message || 'Supabase rechazó la operación. Tu cuenta y tu sesión se mantienen intactas.',
        'error',
        7000
      );
    }
    return false;
  } finally {
    if (loadingVisible && typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}

window.eliminarMiCuentaCompleta = eliminarMiCuentaCompleta;
window.ejecutarEliminacionTotalCuenta = ejecutarEliminacionTotalCuenta;

async function migrarDatosAntiguosARepartidor() {
  if (typeof closeUserSettingsModal === 'function') {
    closeUserSettingsModal();
  }

  const modalAuth = document.getElementById('modalWelcomeAuth');

  // 1. Buscar si ya existe un perfil de repartidor en notigas_user_data
  let driverProfile = null;
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'repartidor' && u.nombre) {
        driverProfile = u;
      }
    }
  } catch(e){}

  // Si la ficha existe en Supabase pero el usuario estaba usando modo
  // comprador, recuperarla sin pedir un registro nuevo ni duplicarla.
  if (!driverProfile && window.supabaseClient) {
    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const user = authData?.user;
      if (user?.id) {
        const { data: driverRow, error: driverError } = await window.supabaseClient
          .from('choferes_habilitados')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (driverError) throw driverError;
        if (driverRow) {
          const current = AppState.get('userData') || {};
          driverProfile = {
            ...current,
            role: 'repartidor',
            hasDriverProfile: true,
            nombre: driverRow.nombre_completo || current.nombre || 'Repartidor',
            whatsapp: driverRow.telefono_whatsapp || '',
            placa: driverRow.placa || '',
            categoria: driverRow.categoria || 'gas',
            productos: driverRow.productos || '',
            zonas: driverRow.zonas || '',
            schedule: driverRow.schedule || '',
            ciudad: driverRow.ciudad || AppState.get('city') || 'cochabamba',
            user_id: user.id,
            gmail: user.email || current.gmail || ''
          };
        }
      }
    } catch (driverLookupError) {
      console.warn('No se pudo recuperar la ficha existente de repartidor:', driverLookupError);
    }
  }

  // 2. Si ya hay un perfil de repartidor, activar el modo repartidor inmediatamente
  if (driverProfile) {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Reactivando sesión...');

    let existingUserId = driverProfile.user_id;
    if (!existingUserId) {
      if (window.supabaseClient) {
        const { data: sessionData } = await window.supabaseClient.auth.getSession();
        const session = sessionData?.session;
        if (session) {
          existingUserId = session.user.id;
        }
      }
    }

    const repartidorData = {
      role: 'repartidor',
      nombre: driverProfile.nombre || driverProfile.name || 'Repartidor Gas GLP',
      whatsapp: driverProfile.whatsapp || '',
      placa: driverProfile.placa || driverProfile.plate || '',
      categoria: driverProfile.categoria || driverProfile.category || 'gas',
      productos: driverProfile.productos || driverProfile.products || 'Garrafas GLP 10kg',
      zonas: driverProfile.zonas || driverProfile.zones || 'OTB Central y calles vecinas',
      schedule: driverProfile.schedule || 'Lunes a Sábado: 07:00 a 18:00',
      ciudad: driverProfile.ciudad || AppState.get('city') || '',
      user_id: existingUserId
    };

    AppState.set('userData', repartidorData);
    AppState.set('userRole', 'repartidor');
    if (typeof guardarRepartidorEnBaseDeDatos === 'function') {
      await guardarRepartidorEnBaseDeDatos(repartidorData);
    }

    if (typeof setAppMode === 'function') {
      setAppMode('driver');
    }

    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (typeof showToast === 'function') {
      showToast('🟢 Modo Repartidor', `Sesión activa: ${repartidorData.nombre}`, 'success', 1000);
    }
    return;
  }

  // 3. Si no existe un perfil previo, desplegar la ventana de registro de Repartidor de inmediato
  if (modalAuth) {
    modalAuth.style.display = 'flex';
    selectAuthRole('driver');
  }
}
window.migrarDatosAntiguosARepartidor = migrarDatosAntiguosARepartidor;

const iniciarSesionChofer = iniciarSesionRepartidor;

async function iniciarSesionEmail() {
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Error', 'El servidor no está disponible. Recarga la página.', 'error');
    return;
  }
  const emailEl = document.getElementById('authEmail');
  const passwordEl = document.getElementById('authPassword');
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value : '';

  if (!email || !password) {
    if (typeof showToast === 'function') showToast('Error', 'Ingresa correo y contraseña', 'error');
    return;
  }
  if (emailAuthRequestInFlight || !canRunAuthAction('login')) return;

  emailAuthRequestInFlight = true;
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Autenticando...');
  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      recordAuthThrottleHit('login', 5);
      if (typeof showToast === 'function') showToast('Error de acceso', 'No se pudo validar el correo y la contraseña.', 'error');
      return;
    }
    clearAuthThrottle('login');
    if (data && data.user) await procesarSesionExitosa(data.user);
  } catch (networkError) {
    console.warn('Fallo de red durante el inicio de sesión:', networkError);
    if (typeof showToast === 'function') showToast('Sin conexión', 'No se pudo contactar al servicio de acceso. Intenta nuevamente.', 'error', 5000);
  } finally {
    emailAuthRequestInFlight = false;
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}

async function registrarEmail() {
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Error', 'El servidor no está disponible. Recarga la página.', 'error');
    return;
  }

  const nombreEl = document.getElementById('authNombre');
  const apellidoEl = document.getElementById('authApellido');
  const emailEl = document.getElementById('authEmail');
  const passwordEl = document.getElementById('authPassword');

  const nombre = nombreEl ? nombreEl.value.trim() : '';
  const apellido = apellidoEl ? apellidoEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value : '';

  if (!nombre || !apellido) {
    if (typeof showToast === 'function') showToast('Campos requeridos', 'Por favor ingresa tu Nombre y Apellido para registrarte.', 'warning', 4000);
    return;
  }

  if (!email || !password) {
    if (typeof showToast === 'function') showToast('Error', 'Ingresa correo y contraseña', 'error');
    return;
  }

  if (password.length < 8) {
    if (typeof showToast === 'function') showToast('Error', 'La contraseña debe tener al menos 8 caracteres', 'error');
    return;
  }
  if (emailAuthRequestInFlight || !canRunAuthAction('register')) return;
  recordAuthThrottleHit('register', 3);

  emailAuthRequestInFlight = true;
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Registrando...');
  try {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: `${nombre} ${apellido}`.trim(),
          nombre: nombre,
          apellido: apellido
        }
      }
    });

    if (error) {
      if (typeof showToast === 'function') showToast('Error de registro', 'No se pudo completar el registro: ' + (error.message || 'Revisa los datos.'), 'error');
      return;
    }

    if (data && data.session) {
      clearAuthThrottle('register');
      if (typeof showToast === 'function') showToast('Éxito', 'Registro completado. Ingresando...', 'success');
      await procesarSesionExitosa(data.user);
    } else if (data && data.user) {
      clearAuthThrottle('register');
      if (typeof showToast === 'function') showToast('Revisa tu correo', 'Te hemos enviado un enlace para confirmar tu cuenta. Confírmala y luego ingresa.', 'info', 8000);
      setAuthAction('login');
    }
  } catch (networkError) {
    console.warn('Fallo de red durante el registro:', networkError);
    if (typeof showToast === 'function') showToast('Sin conexión', 'No se pudo contactar al servicio de registro. Intenta nuevamente.', 'error', 5000);
  } finally {
    emailAuthRequestInFlight = false;
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}

async function procesarSesionExitosa(user) {
  try {
    const modalAuth = document.getElementById('modalWelcomeAuth');
    const gmail = user.email ? user.email.toLowerCase().trim() : '';

    let userNombre = user.user_metadata?.nombre || '';
    let userApellido = user.user_metadata?.apellido || '';
    if (!userNombre && user.user_metadata?.full_name) {
      const parts = user.user_metadata.full_name.trim().split(' ');
      userNombre = parts[0] || '';
      userApellido = parts.slice(1).join(' ') || '';
    }
    if (!userNombre) userNombre = (gmail ? gmail.split('@')[0] : 'Usuario');

    try {
      if (window.supabaseClient && gmail) {
        const { data } = await window.supabaseClient.from('admin_credentials').select('email').ilike('email', gmail).maybeSingle();
        if (data) {
          const btnAdmin = document.getElementById('btnAdminAccessQuick');
          if (btnAdmin) btnAdmin.style.display = 'flex';
          AppState.set('isAdmin', true);
        }
      }
    } catch(e) {}

    // 1. VERIFICAR si el usuario ya existe en choferes_habilitados o en profiles
    let esRepartidorDB = false;
    let choferData = null;
    let existingProfile = null;

    if (window.supabaseClient && user?.id) {
      try {
        const [driverRes, profileRes] = await Promise.all([
          window.supabaseClient
            .from('choferes_habilitados')
            .select('ciudad, categoria, productos, schedule, estado_verificacion')
            .eq('user_id', user.id)
            .maybeSingle(),
          window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()
        ]);

        if (driverRes?.data) {
          esRepartidorDB = true;
          choferData = driverRes.data;
        }
        if (profileRes?.data) {
          existingProfile = profileRes.data;
          if (existingProfile.nombre) userNombre = existingProfile.nombre;
          if (existingProfile.apellido) userApellido = existingProfile.apellido;
        }
        if (!window._roleSelectedNow) {
          currentSelectedRole = esRepartidorDB && existingProfile?.role !== 'vecino'
            ? 'driver'
            : ((existingProfile?.role === 'repartidor') ? 'driver' : 'buyer');
        }
      } catch(e) {
        console.error("Error verificando usuario en BD:", e);
      }
    }

    // 2. Si es un usuario 100% NUEVO (no existe chofer ni perfil, y no ha seleccionado rol aún)
    if (!esRepartidorDB && !existingProfile && !window._roleSelectedNow) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (modalAuth) modalAuth.style.display = 'none';

      window._tempAuthUser = user;

      const inputName = document.getElementById('newUserName');
      const inputLastName = document.getElementById('newUserLastName');
      if (inputName && !inputName.value) inputName.value = userNombre;
      if (inputLastName && !inputLastName.value) inputLastName.value = userApellido;

      const modalRole = document.getElementById('modalRoleSelection');
      if (modalRole) modalRole.style.display = 'flex';
      return;
    }

    const resolvedCity = (choferData?.ciudad || existingProfile?.ciudad || AppState.get('city') || 'cochabamba').toLowerCase().trim();

    const clienteData = {
      role: currentSelectedRole === 'driver' ? 'repartidor' : 'vecino',
      gmail,
      nombre: (existingProfile?.nombre || userNombre),
      apellido: (existingProfile?.apellido || userApellido),
      telefono: existingProfile?.telefono || choferData?.telefono_whatsapp || '',
      ciudad: resolvedCity,
      user_id: user.id
    };
    if (esRepartidorDB) clienteData.hasDriverProfile = true;

    if (currentSelectedRole === 'driver') {
      if (esRepartidorDB && choferData) {
        clienteData.role = 'repartidor';
        if (choferData.ciudad) clienteData.ciudad = choferData.ciudad.toLowerCase().trim();
        if (choferData.categoria) clienteData.categoria = choferData.categoria;
        if (choferData.productos) clienteData.productos = choferData.productos;
        if (choferData.schedule) clienteData.schedule = choferData.schedule;

        if (typeof window.cambiarCiudad === 'function') {
          try {
            await window.cambiarCiudad(clienteData.ciudad);
          } catch(e) {
            AppState.set('city', clienteData.ciudad);
          }
        } else {
          AppState.set('city', clienteData.ciudad);
        }
      } else {
        // Driver NO EXISTE en la DB. Mostrar formulario de registro de negocio
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        if (modalAuth) modalAuth.style.display = 'none';

        const inputDriverNombre = document.getElementById('inputDriverNombre');
        if (inputDriverNombre) inputDriverNombre.value = clienteData.nombre;

        const modalDriver = document.getElementById('modalDriver');
        if (modalDriver) modalDriver.style.display = 'flex';

        const titleEl = document.getElementById('driverModalTitleText');
        const subtitleEl = document.getElementById('driverModalSubtitle');
        if (titleEl) titleEl.textContent = 'Registro de Repartidor';
        if (subtitleEl) subtitleEl.textContent = 'Completa tu ficha de negocio. Aparecerá en la lista de repartidores de la OTB.';

        sessionStorage.setItem('notigas_temp_gmail', gmail);
        return;
      }
    }

    AppState.set('userData', clienteData);
    if (clienteData.ciudad) AppState.set('city', clienteData.ciudad);
    window._roleSelectedNow = false; // Reset state

    if (modalAuth) modalAuth.style.display = 'none';

    if (currentSelectedRole === 'driver') {
      if (typeof setAppMode === 'function') setAppMode('driver');
      if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Ingresaste como Repartidor (${gmail})`, 'success', 2000);
    } else {
      // Comprador
      try {
        const profile = await guardarPerfilSupabase(user, {
            nombre: clienteData.nombre,
            apellido: clienteData.apellido,
            role: 'vecino',
            ciudad: clienteData.ciudad || AppState.get('city') || 'cochabamba'
        });

        if (profile && profile.ciudad) {
          clienteData.ciudad = profile.ciudad.toLowerCase().trim();
          AppState.set('city', clienteData.ciudad);
          if (typeof window.cambiarCiudad === 'function') {
            try {
              await window.cambiarCiudad(clienteData.ciudad);
            } catch(e){}
          }
        }

        const tieneUbicacion = (profile && profile.latitude != null && profile.longitude != null) || (existingProfile && existingProfile.latitude != null);

        if (!tieneUbicacion) {
            await solicitarYGuardarUbicacionHabitual(user);
        }
      } catch(pErr) {
        console.warn('Aviso guardando perfil comprador:', pErr);
      }

      if (typeof setAppMode === 'function') setAppMode('buyer');
      if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Bienvenido a NOTIGAS (${clienteData.nombre} ${clienteData.apellido})`, 'success', 2000);
    }
  } catch (err) {
    console.error('Error procesando sesión exitosa:', err);
  } finally {
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
  }
}

window.finalizeRoleSelection = async function(role) {
  const nameInput = document.getElementById('newUserName');
  const lastNameInput = document.getElementById('newUserLastName');
  const citySelect = document.getElementById('newUserCity');

  const selectedName = (nameInput ? nameInput.value : '').trim();
  const selectedLastName = (lastNameInput ? lastNameInput.value : '').trim();

  if (!selectedName || !selectedLastName) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Datos Requeridos', 'Por favor ingresa tu Nombre y Apellido completos.', 'warning', 3500);
    } else {
      alert('Por favor ingresa tu Nombre y Apellido.');
    }
    return;
  }

  let selectedCity = null;
  if (citySelect && citySelect.value) {
    selectedCity = citySelect.value.toLowerCase().trim();
  }

  if (!selectedCity) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Ciudad Requerida', 'Por favor selecciona tu ciudad de preferencia para registrarte.', 'warning', 3500);
    } else {
      alert('Por favor selecciona tu ciudad de preferencia.');
    }
    return;
  }

  const modalRole = document.getElementById('modalRoleSelection');
  if (modalRole) modalRole.style.display = 'none';

  currentSelectedRole = role === 'repartidor' ? 'driver' : 'buyer';
  window._roleSelectedNow = true;

  if (typeof window.cambiarCiudad === 'function') {
    try {
      await window.cambiarCiudad(selectedCity);
    } catch(e) {
      AppState.set('city', selectedCity);
    }
  } else {
    AppState.set('city', selectedCity);
  }

  const u = AppState.get('userData') || {};
  u.nombre = selectedName;
  u.apellido = selectedLastName;
  u.ciudad = selectedCity;
  AppState.set('userData', u);

  if (role === 'repartidor') {
    const inputDriverCiudad = document.getElementById('inputDriverCiudad');
    if (inputDriverCiudad) inputDriverCiudad.value = selectedCity;
    const inputDriverNombre = document.getElementById('inputDriverNombre');
    if (inputDriverNombre && !inputDriverNombre.value) {
      inputDriverNombre.value = `${selectedName} ${selectedLastName}`.trim();
    }
  }

  if (window._tempAuthUser) {
    try {
      await guardarPerfilSupabase(window._tempAuthUser, {
        nombre: selectedName,
        apellido: selectedLastName,
        ciudad: selectedCity,
        role: role === 'repartidor' ? 'repartidor' : 'vecino'
      });
    } catch(e) {
      console.warn("Error guardando perfil en selección de rol:", e);
    }
    await procesarSesionExitosa(window._tempAuthUser);
  }
};

let currentAuthAction = 'login'; // 'login' or 'register'

window.showAuthStep = function(step) {
  const step1 = document.getElementById('authStep1_Action');
  const step2 = document.getElementById('authStep2_Method');
  const namesGroup = document.getElementById('authRegisterNamesGroup');

  if (step1) step1.style.display = (step === 1) ? 'block' : 'none';
  if (step2) step2.style.display = (step === 2) ? 'block' : 'none';

  if (step === 2) {
    if (namesGroup) {
      namesGroup.style.display = (currentAuthAction === 'register') ? 'block' : 'none';
    }
    const btnEmailAction = document.getElementById('btnEmailAction');
    const step2Title = document.getElementById('authStep2Title');
    if (btnEmailAction) btnEmailAction.innerText = (currentAuthAction === 'login') ? 'Ingresar' : 'Registrarse';
    if (step2Title) step2Title.innerText = (currentAuthAction === 'login') ? 'Selecciona método de ingreso:' : 'Completa tus datos para registrarte:';
  }
};

window.setAuthAction = function(action) {
  currentAuthAction = action;
};

window.procesarAccionEmail = async function() {
  if (currentAuthAction === 'login') {
    await iniciarSesionEmail();
  } else {
    await registrarEmail();
  }
};
