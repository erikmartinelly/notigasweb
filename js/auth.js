
// VALIDACIONES PERUANAS PARA DNI Y WHATSAPP
function validarDniPeru(dni) {
  const clean = (dni || '').toString().replace(/\D/g, '');
  return clean.length === 8;
}
window.validarDniPeru = validarDniPeru;

function normalizarDniPeru(dni) {
  return (dni || '').toString().replace(/\D/g, '').slice(0, 8);
}
window.normalizarDniPeru = normalizarDniPeru;

function validarTelefonoPeru(tel) {
  let clean = (tel || '').toString().replace(/\D/g, '');
  if (clean.startsWith('51') && clean.length === 11) {
    clean = clean.slice(2);
  }
  return clean.length === 9 && clean.startsWith('9');
}
window.validarTelefonoPeru = validarTelefonoPeru;

function normalizarTelefonoPeru(tel) {
  let clean = (tel || '').toString().replace(/\D/g, '');
  if (clean.startsWith('51') && clean.length === 11) {
    clean = clean.slice(2);
  }
  return clean.slice(0, 9);
}
window.normalizarTelefonoPeru = normalizarTelefonoPeru;

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

let _authInitPromise = null;
let _processingSessionUserId = null;
let _lastProcessedSessionTime = 0;
window._cachedAdminEmail = null;
window._cachedIsAdmin = false;

document.addEventListener('DOMContentLoaded', () => {
  const initAuthSession = async () => {
    if (_authInitPromise) return _authInitPromise;
    _authInitPromise = (async () => {
      let hasSession = false;
      if (window.supabaseClient) {
        try {
          const { data: sessionData } = await window.supabaseClient.auth.getSession();
          const user = sessionData?.session?.user;
          if (user) {
            hasSession = true;
            window._tempAuthUser = user;
            
            // Ocultar cualquier modal de autenticación inmediatamente para ingreso directo
            const modalAuth = document.getElementById('modalWelcomeAuth');
            if (modalAuth) modalAuth.style.display = 'none';
            const modalRole = document.getElementById('modalRoleSelection');
            if (modalRole) modalRole.style.display = 'none';

            await procesarSesionExitosa(user, false);
          }
        } catch(e) {
          console.warn("No se pudo restaurar la sesión automáticamente", e);
        }
      }

      // Si no hay sesión, mantener ocultos TODOS los modales de autenticación.
      // Cero pantallas de login/registro iniciales: el usuario navega 100% libre.
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'none';
      const modalRole = document.getElementById('modalRoleSelection');
      if (modalRole) modalRole.style.display = 'none';

      if (typeof window.actualizarVisibilidadBotonesAuth === 'function') {
        window.actualizarVisibilidadBotonesAuth(hasSession);
      }

      // 3. Notificar al resto de la app que Auth terminó su validación inicial
      document.dispatchEvent(new Event('notigas_auth_ready'));
    })();
    return _authInitPromise;
  };

  const setupAuthListener = () => {
    if (window._authListenerRegistered || !window.supabaseClient) return;
    window._authListenerRegistered = true;

    initAuthSession();

    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user;
      if (user) {
        window._tempAuthUser = user;
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          const now = Date.now();
          if (_processingSessionUserId !== user.id || (now - _lastProcessedSessionTime > 2500)) {
            await procesarSesionExitosa(user, false);
          }
        } else {
          window.checkAndApplyAdminStatus(user);
        }
      } else if (event === 'SIGNED_OUT') {
        window._tempAuthUser = null;
        window._cachedAdminEmail = null;
        window._cachedIsAdmin = false;
        AppState.set('userData', null);
        AppState.set('isAdmin', false);
      }
    });
  };

  if (window.supabaseClient) {
    setupAuthListener();
  } else {
    document.addEventListener('supabase_ready', setupAuthListener, { once: true });
  }
});

window.checkAndApplyAdminStatus = async function(user) {
  if (!window.supabaseClient) return false;
  try {
    let email = user?.email || window._tempAuthUser?.email || AppState.get('userData')?.gmail;
    if (!email) {
      const { data: sessionData } = await window.supabaseClient.auth.getSession();
      email = sessionData?.session?.user?.email;
    }
    if (!email) {
      const btnAdmin = document.getElementById('btnAdminAccessQuick');
      if (btnAdmin) btnAdmin.style.display = 'none';
      AppState.set('isAdmin', false);
      window._verifiedAdminEmail = null;
      return false;
    }

    const normEmail = email.toLowerCase().trim();
    if (window._cachedAdminEmail === normEmail) {
      const btnAdmin = document.getElementById('btnAdminAccessQuick');
      if (btnAdmin) btnAdmin.style.display = window._cachedIsAdmin ? 'flex' : 'none';
      AppState.set('isAdmin', window._cachedIsAdmin);
      window._verifiedAdminEmail = window._cachedIsAdmin ? normEmail : null;
      return window._cachedIsAdmin;
    }

    const { data: adminData, error } = await window.supabaseClient
      .from('admin_credentials')
      .select('email')
      .ilike('email', normEmail)
      .limit(1)
      .maybeSingle();

    const isAdmin = Boolean(adminData && adminData.email);
    window._cachedAdminEmail = normEmail;
    window._cachedIsAdmin = isAdmin;

    const btnAdmin = document.getElementById('btnAdminAccessQuick');
    if (btnAdmin) btnAdmin.style.display = isAdmin ? 'flex' : 'none';
    AppState.set('isAdmin', isAdmin);
    window._verifiedAdminEmail = isAdmin ? normEmail : null;
    return isAdmin;
  } catch(e) {
    console.warn("Error comprobando estado de admin:", e);
    AppState.set('isAdmin', false);
    return false;
  }
};

window.getVerifiedAdminEmail = function() {
  try {
    if (window._verifiedAdminEmail) return String(window._verifiedAdminEmail).toLowerCase().trim();
    if (typeof AppState !== 'undefined' && AppState.get('isAdmin') === true) {
      if (window._tempAuthUser && window._tempAuthUser.email) return window._tempAuthUser.email.toLowerCase().trim();
      const data = AppState.get('userData');
      if (data && (data.gmail || data.email)) return (data.gmail || data.email).toLowerCase().trim();
    }
    if (window._tempAuthUser && window._tempAuthUser.email) {
      return window._tempAuthUser.email.toLowerCase().trim();
    }
    const data = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
    return data && (data.gmail || data.email) ? (data.gmail || data.email).toLowerCase().trim() : null;
  } catch(e) { return null; }
};

window.esRepartidorBaneado = function(nombre, placa, whatsapp, gmail) {
  if (!window.globalBannedList || window.globalBannedList.length === 0) return false;
  const n = nombre ? String(nombre).toLowerCase().trim() : '';
  const p = placa ? String(placa).toLowerCase().trim().replace(/[^a-z0-9]/g, '') : '';
  const w = whatsapp ? String(whatsapp).toLowerCase().trim().replace(/[^0-9]/g, '') : '';
  const g = gmail ? String(gmail).toLowerCase().trim() : '';

  for (const b of window.globalBannedList) {
    if (!b) continue;
    const bClean = String(b).toLowerCase().trim();
    const bDigits = bClean.replace(/[^0-9]/g, '');
    const bAlphanum = bClean.replace(/[^a-z0-9]/g, '');

    if (g && bClean === g) return true;
    if (p && bAlphanum && p === bAlphanum) return true;
    if (w && w.length >= 7 && bDigits && w === bDigits) return true;
    if (n && n.length >= 4 && (n === bClean || (bClean.length >= 6 && n.includes(bClean)))) return true;
  }
  return false;
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
  if (window._tempAuthUser?.id) return window._tempAuthUser.id;
  const localUser = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  if (localUser?.user_id) return localUser.user_id;
  if (!window.supabaseClient) return null;
  try {
    const { data } = await window.supabaseClient.auth.getSession();
    return data?.session?.user?.id || null;
  } catch(_) {
    return null;
  }
}
window.getAuthenticatedUserId = getAuthenticatedUserId;

async function guardarPerfilSupabase(user, changes = {}) {
    if (!window.supabaseClient || !user?.id) {
        throw new Error(
            'Supabase o usuario no disponibles'
        );
    }

    const currentCity = (changes.ciudad || AppState.get('city') || 'lima').toLowerCase().trim();
    const payload = {
        id: user.id,
        role: changes.role || 'vecino',
        ciudad: currentCity || 'lima',
        ...changes,
        updated_at: new Date().toISOString()
    };
    if (!payload.ciudad) payload.ciudad = 'lima';

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
    const ciudad = (inferred || AppState.get('city') || 'lima').toLowerCase().trim();

    await guardarPerfilSupabase(
        user,
        {
            role: 'vecino',
            ciudad: ciudad || 'lima',
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

        // Si todavía no hay coords, usar la capital actual de PERU_CITIES
        if (lat == null || lng == null) {
            const currentCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'lima') : 'lima';
            const citiesObj = window.PERU_CITIES || {};
            const cityDef = citiesObj[currentCity] || { lat: -12.0460, lon: -77.0306 };
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
        const currentCity = (typeof AppState !== 'undefined') ? (AppState.get('city') || 'lima') : 'lima';
        const citiesObj = window.PERU_CITIES || {};
        const cityDef = citiesObj[currentCity] || { lat: -12.0460, lon: -77.0306 };

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
      if (typeof initGoogleOneTap === 'function') {
        try { initGoogleOneTap(); } catch(_) {}
      }
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

window.tryInitGoogleGis = tryInitGoogleGis;

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
  selectAuthMethod('google');
  if (typeof google !== 'undefined' && google && google.accounts && google.accounts.id) {
    try {
      if (!_googleGisInitialized) {
        initGoogleOneTap();
      }

      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.info("Google One Tap omitido por el navegador. Usa el botón oficial de Google en pantalla.");
        }
      });
    } catch(err) {
      console.warn("Aviso Google GIS prompt:", err);
    }
  } else {
    tryInitGoogleGis();
  }
}

async function iniciarConGoogleOAuthRedirect() {
  if (!window.supabaseClient) {
    if (typeof showToast === 'function') showToast('Error', 'Servidor no disponible', 'error');
    return;
  }
  try {
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Conectando con Google...');
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await window.supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (typeof showToast === 'function') showToast('Error Google OAuth', error.message, 'error', 5000);
    }
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error("Error iniciando OAuth redirect:", err);
  }
}
window.iniciarConGoogleOAuthRedirect = iniciarConGoogleOAuthRedirect;

async function handleCredentialResponse(response) {
  try {
    if (!response || !response.credential || typeof response.credential !== 'string') {
      if (typeof showToast === 'function') {
        showToast('Google Auth', 'No se recibió la credencial de Google. Por favor, intenta de nuevo.', 'warning', 4000);
      }
      return;
    }

    if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Autenticando con Google...');

    // 1. Iniciar sesión en Supabase con Google ID Token
    const { data: authData, error } = await window.supabaseClient.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential
    });

    if (error) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      console.error("Error en signInWithIdToken:", error);
      if (typeof showToast === 'function') {
        showToast('Error de autenticación Google', error.message || 'Verifica que el dominio actual esté autorizado en Google Cloud Console.', 'error', 6000);
      }
      return;
    }

    const session = authData.session;
    const user = session ? session.user : authData.user;
    if (!user) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      showToast('Error', 'No se pudieron recuperar los datos de usuario.', 'error');
      return;
    }

    const gmail = user.email ? user.email.toLowerCase().trim() : '';

    // Los administradores ingresan como usuarios normales pero con privilegios extra
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
  const payload = {
    user_id: repartidorObj.user_id,
    nombre_completo: repartidorObj.nombre,
    telefono_whatsapp: repartidorObj.whatsapp,
    placa: repartidorObj.placa,
    dni: repartidorObj.dni || null,
    device_id: repartidorObj.device_id || null,
    device_fingerprint: repartidorObj.device_fingerprint || null,
    categoria: repartidorObj.categoria,
    productos: repartidorObj.productos,
    schedule: repartidorObj.schedule,
    ciudad: repartidorObj.ciudad || AppState.get('city') || null,
    color_camion: repartidorObj.color_camion || '',
    tipo_plan: repartidorObj.tipo_plan || 'gratuito'
  };
  if (repartidorObj.precio_balon_10kg !== undefined && repartidorObj.precio_balon_10kg !== null && repartidorObj.precio_balon_10kg !== '') {
    const pNum = parseFloat(repartidorObj.precio_balon_10kg);
    if (!isNaN(pNum)) payload.precio_balon_10kg = pNum;
  }

  const { data, error } = await window.supabaseClient.from('choferes_habilitados').upsert([payload], { onConflict: 'user_id' })
    .select('estado_verificacion')
    .single();

  if (typeof hideLoadingOverlay === 'function') {
    hideLoadingOverlay();
  }

  if (error) {
    console.error("Error registrando chofer en Supabase:", error);
    if (String(error.message || '').includes('DISPOSITIVO_BLOQUEADO')) {
      if (window.DeviceSecurity && typeof window.DeviceSecurity.triggerLockout === 'function') {
        window.DeviceSecurity.triggerLockout(error.message.replace('DISPOSITIVO_BLOQUEADO:', '').trim());
      }
      return { ok: false, status: 'blocked' };
    }
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
      ciudad: repartidorObj.ciudad || AppState.get('city') || 'lima',
      dni: repartidorObj.dni || null
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
    if (categoria === 'gas') productos = 'Balones de Gas GLP 10kg';
    else if (categoria === 'detergentes') productos = 'Detergentes y Productos de Limpieza';
    else if (categoria === 'chatarra') productos = 'Compra de Chatarra y Metales';
    else if (categoria === 'papel') productos = 'Papel, Cartón y Reciclaje';
    else if (categoria === 'frutas') productos = 'Frutas, Verduras y Hortalizas';
    else productos = 'Varios';

    const schedule = (document.getElementById('regSchedule')?.value || '').trim() || 'Lunes a Sábado: 07:00 a 18:00';
    const ciudad = (document.getElementById('newUserCity')?.value || AppState.get('city') || 'lima').trim();

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
  const plate = (document.getElementById('inputDriverPlate')?.value || '').trim().toUpperCase();
  const dni = (document.getElementById('inputDriverDni')?.value || '').trim().replace(/[^0-9]/g, '');
  const categoria = (document.getElementById('inputDriverCat')?.value || 'gas').trim();
  const productos = (document.getElementById('inputDriverProductos')?.value || '').trim();
  const schedule = (document.getElementById('inputDriverSchedule')?.value || '').trim();
  const colorCamion = (document.getElementById('inputDriverTruckColor')?.value || '').trim();
  const precio10kgRaw = (document.getElementById('inputDriverPrecioBalon10kg')?.value || '').trim();

  if (!nombreNegocio || !whatsapp || !plate || !productos) {
    if (typeof showToast === 'function') showToast('⚠️ Campos Requeridos', 'Por favor completa todos los campos requeridos.', 'warning', 2000);
    return;
  }

  // VALIDACIÓN ESTRICTA DE DNI (8 DÍGITOS PERUANOS)
  if (!dni || dni.length !== 8) {
    if (typeof showToast === 'function') {
      showToast('🪪 DNI Obligatorio', 'Debes ingresar un número de DNI válido de 8 dígitos para registrarte como repartidor.', 'warning', 4000);
    } else {
      alert('Debes ingresar un número de DNI válido de 8 dígitos para registrarte como repartidor.');
    }
    const inputDniEl = document.getElementById('inputDriverDni');
    if (inputDniEl) inputDniEl.focus();
    return;
  }

  // VALIDACIÓN ESTRICTA DE PLACA (MÍNIMO 4 CARACTERES)
  if (!plate || plate.length < 4) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Placa Requerida', 'Por favor ingresa la placa de tu vehículo o medio de transporte.', 'warning', 3000);
    } else {
      alert('Por favor ingresa la placa de tu vehículo o medio de transporte.');
    }
    const inputPlateEl = document.getElementById('inputDriverPlate');
    if (inputPlateEl) inputPlateEl.focus();
    return;
  }

  // VALIDACIÓN DE ACEPTACIÓN DE TÉRMINOS Y CONDICIONES PARA REPARTIDORES
  const checkTerminos = document.getElementById('checkAceptoTerminosChofer');
  if (checkTerminos && !checkTerminos.checked) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Términos Requeridos', 'Debes aceptar los Términos y Condiciones para Repartidores de Notigas.com para continuar.', 'warning', 4000);
    } else {
      alert('Debes aceptar los Términos y Condiciones para Repartidores de Notigas.com para continuar.');
    }
    checkTerminos.focus();
    return;
  }

  const tempGmail = sessionStorage.getItem('notigas_temp_gmail') || '';
  const cachedUser = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  let existingGmail = cachedUser.gmail || tempGmail;
  let existingUserId = cachedUser.user_id || null;

  // COMPROBACIÓN ESTRICTA DE BANEO POR LA ADMINISTRACIÓN (EN MEMORIA / LISTA NEGRA)
  if (typeof esRepartidorBaneado === 'function' && esRepartidorBaneado(nombreNegocio, plate, whatsapp, existingGmail)) {
    if (typeof showToast === 'function') {
      showToast('⛔ Acceso Suspendido', 'Tu cuenta de repartidor ha sido suspendida/baneada por la administración de NOTIGAS.', 'error', 2000);
    }
    return;
  }

  // COMPROBACIÓN DE HARDWARE / DEVICE ID / DNI / PLACA EN SUPABASE
  if (window.DeviceSecurity && typeof window.DeviceSecurity.checkBlockedStatus === 'function') {
    const lockCheck = await window.DeviceSecurity.checkBlockedStatus(dni, plate);
    if (lockCheck && lockCheck.bloqueado) {
      window.DeviceSecurity.triggerLockout(lockCheck.motivo);
      return;
    }
  }

  // OBTENCIÓN DEL PAYLOAD DE SEGURIDAD (DEVICE ID MULTI-CAPA + HUELLA DE HARDWARE)
  let secPayload = { device_id: null, device_fingerprint: null };
  if (window.DeviceSecurity && typeof window.DeviceSecurity.getSecurityPayload === 'function') {
    try {
      secPayload = await window.DeviceSecurity.getSecurityPayload();
    } catch (secErr) {
      console.warn("Aviso al obtener DeviceSecurity payload:", secErr);
    }
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

  let ciudad = (document.getElementById('inputDriverCiudad')?.value || '').trim() || cachedUser.ciudad || 'lima';

  const validCities = window.PERU_CITIES
    ? Object.keys(window.PERU_CITIES)
    : ['lima', 'callao', 'arequipa', 'trujillo', 'chiclayo', 'piura', 'cusco', 'huancayo', 'iquitos', 'pucallpa', 'tacna', 'ica', 'huaraz', 'cajamarca', 'ayacucho', 'huanuco', 'puno', 'tarapoto', 'moyobamba', 'tumbes', 'moquegua', 'puertomaldonado', 'abancay', 'huancavelica', 'cerrodepasco', 'chachapoyas'];
  if (!ciudad || !validCities.includes(ciudad.toLowerCase())) {
    if (typeof showToast === 'function') showToast('Error', 'Debes seleccionar una ciudad válida', 'error', 3000);
    else if (typeof showToast === 'function') { showToast('Notificación', '❌ Error: Debes seleccionar una ciudad válida', 'info', 4000); } else { alert('❌ Error: Debes seleccionar una ciudad válida'); };
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    return;
  }

  const planTipo = 'credito';
  const fileVoucher = document.getElementById('inputDriverVoucherFile')?.files?.[0];
  const yaEsVip = false;

  // Si eligió PRO pero aún no es VIP y no ha seleccionado comprobante, advertir amablemente
  if (false) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    if (typeof showToast === 'function') {
      showToast('📸 Falta Comprobante de Remesa', 'El registro de repartidor no requiere suscripción ni pago inicial.', 'warning', 6500);
    } else {
      alert('Para el Plan PRO, por favor sube tu captura de comprobante de Remesa por Yape al 987-654-321. O selecciona el Plan Gratuito.');
    }
    const sec = document.getElementById('driverPremiumPaymentSection');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const repartidorData = {
    role: 'repartidor',
    nombre: nombreNegocio,
    whatsapp: whatsapp,
    placa: plate,
    dni: dni,
    device_id: secPayload.device_id,
    device_fingerprint: secPayload.device_fingerprint,
    categoria: categoria,
    productos: productos,
    schedule: schedule,
    ciudad: ciudad,
    color_camion: colorCamion,
    precio_balon_10kg: precio10kgRaw !== '' ? parseFloat(precio10kgRaw) : null,
    user_id: existingUserId,
    tipo_plan: 'credito',
    es_premium: false
  };

  if (existingGmail) repartidorData.gmail = existingGmail;

  const exito = await guardarRepartidorEnBaseDeDatos(repartidorData);

  if (!exito?.ok) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo guardar la configuración. Reintenta.', 'error', 3000);
    return;
  }

  AppState.set('userData', repartidorData);

  // Si eligió PRO y adjuntó comprobante, procesarlo de inmediato para activación instantánea
  if (planTipo === 'pro' && fileVoucher) {
    try {
      await enviarComprobantePagoPremium();
    } catch (vErr) {
      console.warn("Aviso al procesar comprobante durante registro:", vErr);
    }
  }

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

  if (planTipo === 'pro') {
    if (typeof showToast === 'function') {
      showToast('🎁 Cuenta de repartidor activada', `¡Bienvenido ${nombreNegocio}! Tus primeros 50 pedidos confirmados son gratuitos.`, 'success', 6500);
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('🎁 Cuenta de repartidor activada', `Ficha de ${nombreNegocio} registrada. Tus primeros 50 pedidos confirmados son gratuitos.`, 'success', 6000);
    }
  }

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

function closeWelcomeAuthModal() {
  const modal = document.getElementById('modalWelcomeAuth');
  if (modal) modal.style.display = 'none';
  const titleEl = document.getElementById('welcomeAuthTitleText');
  if (titleEl) titleEl.textContent = '👋 Bienvenido a NOTIGAS';
  const descEl = document.getElementById('welcomeAuthDescText');
  if (descEl) descEl.textContent = '¿Qué deseas hacer?';
}
window.closeWelcomeAuthModal = closeWelcomeAuthModal;

window.actualizarVisibilidadBotonesAuth = function(isLoggedIn) {
  const isLogged = (typeof isLoggedIn === 'boolean')
    ? isLoggedIn
    : Boolean(AppState?.get('userData')?.user_id || window._tempAuthUser?.id);

  const menuGuestBlock = document.getElementById('menuAuthGuestBlock');
  if (menuGuestBlock) menuGuestBlock.style.display = isLogged ? 'none' : 'block';

  const topGuestBanner = document.getElementById('topGuestAuthBanner');
  if (topGuestBanner) topGuestBanner.style.display = isLogged ? 'none' : 'flex';

  const btnLogout = document.getElementById('auto-event-27');
  if (btnLogout) btnLogout.style.display = isLogged ? 'block' : 'none';
};

window.abrirLoginModal = function() {
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
  const modal = document.getElementById('modalWelcomeAuth');
  if (!modal) return;
  const titleEl = document.getElementById('welcomeAuthTitleText');
  if (titleEl) titleEl.textContent = '👋 Iniciar Sesión en NOTIGAS';
  const descEl = document.getElementById('welcomeAuthDescText');
  if (descEl) descEl.textContent = 'Ingresa con tu correo o tu cuenta de Google:';
  if (typeof setAuthAction === 'function') setAuthAction('login');
  if (typeof showAuthStep === 'function') showAuthStep(2);
  modal.style.display = 'flex';
};

window.abrirRegistroModal = function() {
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();
  const modal = document.getElementById('modalWelcomeAuth');
  if (!modal) return;
  const titleEl = document.getElementById('welcomeAuthTitleText');
  if (titleEl) titleEl.textContent = '📝 Crear Cuenta en NOTIGAS';
  const descEl = document.getElementById('welcomeAuthDescText');
  if (descEl) descEl.textContent = 'Regístrate gratis con Google o con tu correo:';
  if (typeof setAuthAction === 'function') setAuthAction('register');
  if (typeof showAuthStep === 'function') showAuthStep(2);
  modal.style.display = 'flex';
};

window.abrirModalRegistroPedido = function() {
  if (typeof closeSubmenuModal === 'function') closeSubmenuModal();
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();

  window._pendingActionAfterAuth = 'abrirSubmenuPedidos';
  window._targetAuthRole = 'buyer';
  currentSelectedRole = 'buyer';

  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (!modalAuth) return;

  const titleEl = document.getElementById('welcomeAuthTitleText');
  if (titleEl) {
    titleEl.textContent = '📝 Registro para Pedidos';
  }
  const descEl = document.getElementById('welcomeAuthDescText');
  if (descEl) {
    descEl.textContent = 'Para realizar un pedido a domicilio, por favor regístrate o inicia sesión con tu cuenta.';
  }

  if (typeof setAuthAction === 'function') setAuthAction('register');
  if (typeof showAuthStep === 'function') showAuthStep(1);

  modalAuth.style.display = 'flex';

  if (typeof showToast === 'function') {
    showToast('📝 Registro Requerido', 'Por favor regístrate o inicia sesión para hacer tu pedido a domicilio.', 'info', 4500);
  }
};

window.abrirRegistroRepartidores = async function() {
  if (typeof closeUserSettingsModal === 'function') closeUserSettingsModal();

  // Comprobar bloqueo previo de hardware o dispositivo
  if (window.DeviceSecurity && typeof window.DeviceSecurity.checkBlockedStatus === 'function') {
    const lockCheck = await window.DeviceSecurity.checkBlockedStatus();
    if (lockCheck && lockCheck.bloqueado) {
      window.DeviceSecurity.triggerLockout(lockCheck.motivo);
      return;
    }
  }

  const userId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : null;
  const userData = (typeof AppState !== 'undefined') ? AppState.get('userData') : null;
  const isLoggedIn = Boolean(userId || userData?.user_id || userData?.gmail);

  if (isLoggedIn) {
    let hasDriverProfile = Boolean(userData?.role === 'repartidor' || userData?.hasDriverProfile || userData?.placa);

    if (!hasDriverProfile && window.supabaseClient && userId) {
      try {
        const { data: driverRow } = await window.supabaseClient
          .from('choferes_habilitados')
          .select('id, nombre_completo, placa, dni, bloqueado, motivo_bloqueo, categoria, telefono_whatsapp, ciudad, schedule, productos, comisiones_pendientes, limite_credito, estado_servicio')
          .eq('user_id', userId)
          .maybeSingle();

        if (driverRow) {
          if (driverRow.bloqueado) {
            if (window.DeviceSecurity) {
              window.DeviceSecurity.triggerLockout(driverRow.motivo_bloqueo || 'Dispositivo suspendido por comisiones pendientes.');
            }
            return;
          }
          hasDriverProfile = true;
          const u = AppState.get('userData') || {};
          AppState.set('userData', {
            ...u,
            role: 'repartidor',
            hasDriverProfile: true,
            nombre: driverRow.nombre_completo || u.nombre,
            whatsapp: driverRow.telefono_whatsapp || u.whatsapp,
            placa: driverRow.placa,
            dni: driverRow.dni || u.dni,
            categoria: driverRow.categoria,
            productos: driverRow.productos,
            schedule: driverRow.schedule,
            ciudad: driverRow.ciudad,
            comisiones_pendientes: Number(driverRow.comisiones_pendientes || 0),
            limite_credito: Number(driverRow.limite_credito || 50),
            estado_servicio: driverRow.estado_servicio || 'activo'
          });
        }
      } catch (e) {
        console.warn("Error verificando repartidor en BD:", e);
      }
    }

    if (hasDriverProfile) {
      if (typeof setAppMode === 'function') setAppMode('driver');
      if (typeof showToast === 'function') {
        showToast('🟢 Modo Repartidor', '¡Sesión de repartidor activada!', 'success', 3000);
      }
    } else {
      const modalDriver = document.getElementById('modalDriver');
      if (modalDriver) {
        const inputDriverNombre = document.getElementById('inputDriverNombre');
        if (inputDriverNombre && userData?.nombre) {
          inputDriverNombre.value = `${userData.nombre} ${userData.apellido || ''}`.trim();
        }
        const inputDriverCiudad = document.getElementById('inputDriverCiudad');
        if (inputDriverCiudad && userData?.ciudad) {
          inputDriverCiudad.value = userData.ciudad;
        }
        const inputDriverDni = document.getElementById('inputDriverDni');
        if (inputDriverDni && userData?.dni) {
          inputDriverDni.value = userData.dni;
        }
        const titleEl = document.getElementById('driverModalTitleText');
        const subtitleEl = document.getElementById('driverModalSubtitle');
        if (titleEl) titleEl.textContent = 'Registro de Repartidor';
        if (subtitleEl) subtitleEl.textContent = 'Completa tu ficha de negocio. Aparecerá en la lista de repartidores de la zona.';
        modalDriver.style.display = 'flex';
      }
    }
    return;
  }

  // Si NO está autenticado:
  window._targetAuthRole = 'driver';
  currentSelectedRole = 'driver';

  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) {
    const titleEl = document.getElementById('welcomeAuthTitleText');
    if (titleEl) {
      titleEl.textContent = '🚛 Registro de Repartidores';
    }
    const descEl = document.getElementById('welcomeAuthDescText');
    if (descEl) {
      descEl.textContent = 'Para registrar tu camión o negocio de reparto, por favor regístrate o inicia sesión.';
    }

    if (typeof setAuthAction === 'function') setAuthAction('register');
    if (typeof showAuthStep === 'function') showAuthStep(1);
    modalAuth.style.display = 'flex';

    if (typeof showToast === 'function') {
      showToast('🚛 Registro de Repartidor', 'Inicia sesión o regístrate para activar tu ficha de repartidor.', 'info', 4500);
    }
  }
};
function guardarPrefUsuario() {
  // Detectar si es repartidor
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const isDriver = (u.role === 'repartidor');

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
    // Guardar opciones de comprador
    const catSelect = document.getElementById('userPrefCategory');
    if (catSelect) {
      AppState.set('prefCategory', catSelect.value);
    }
    const soundSelect = document.getElementById('userPrefSoundBuyer') || document.getElementById('userPrefSound');
    if (soundSelect) {
      AppState.set('prefSound', soundSelect.value);
    }
  }

  // Guardar ciudad si se seleccionó en el menú de configuración
  const citySelect = document.getElementById('userPrefCity');
  if (citySelect && citySelect.value) {
    const nuevaCiudad = citySelect.value.toLowerCase().trim();
    const ciudadActual = AppState.get('city');
    if (nuevaCiudad !== ciudadActual) {
      if (typeof window.cambiarCiudad === 'function') {
        window.cambiarCiudad(nuevaCiudad);
      } else {
        AppState.set('city', nuevaCiudad);
      }
    }
  }

  showToast('Preferencias Guardadas', 'Tus preferencias han sido actualizadas correctamente.', 'success', 3000);
  closeUserSettingsModal();
}
window.guardarPrefUsuario = guardarPrefUsuario;

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
      ciudad: AppState.get('city') || 'lima'
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
    window._cachedIsAdmin = false;
    window._cachedAdminEmail = null;
    window._verifiedAdminEmail = null;
    const btnAdmin = document.getElementById('btnAdminAccessQuick');
    if (btnAdmin) btnAdmin.style.display = 'none';

    closeUserSettingsModal();
    if (typeof closeDriverModal === 'function') closeDriverModal();
    if (typeof setAppMode === 'function') setAppMode('buyer');

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) {
      modalAuth.style.display = 'none';
      selectAuthRole('buyer');
    }

    if (typeof checkActiveOrderStatus === 'function') checkActiveOrderStatus();
    if (typeof window.actualizarVisibilidadBotonesAuth === 'function') {
      window.actualizarVisibilidadBotonesAuth(false);
    }
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
            ciudad: driverRow.ciudad || AppState.get('city') || 'lima',
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
      productos: driverProfile.productos || driverProfile.products || 'Balones de Gas GLP 10kg',
      zonas: driverProfile.zonas || driverProfile.zones || 'Calles y zonas de cobertura vecinal',
      schedule: driverProfile.schedule || 'Lunes a Sábado: 07:00 a 18:00',
      ciudad: driverProfile.ciudad || AppState.get('city') || 'lima',
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
      const msg = error.message.includes('Invalid login credentials') 
        ? 'Correo o contraseña incorrectos. Si te registraste con Google, ingresa con el botón de Google.'
        : error.message;
      if (typeof showToast === 'function') showToast('Error de acceso', msg, 'error', 5000);
      return;
    }
    clearAuthThrottle('login');
    if (data && data.user) await procesarSesionExitosa(data.user, true);
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
  const telefonoEl = document.getElementById('authTelefono');
  const dniEl = document.getElementById('authDni');
  const emailEl = document.getElementById('authEmail');
  const passwordEl = document.getElementById('authPassword');

  const nombre = nombreEl ? nombreEl.value.trim() : '';
  const apellido = apellidoEl ? apellidoEl.value.trim() : '';
  const rawTelefono = telefonoEl ? telefonoEl.value.trim() : '';
  const rawDni = dniEl ? dniEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passwordEl ? passwordEl.value : '';

  if (!nombre || !apellido) {
    if (typeof showToast === 'function') showToast('Campos requeridos', 'Por favor ingresa tu Nombre y Apellido completos.', 'warning', 4000);
    return;
  }

  if (!validarTelefonoPeru(rawTelefono)) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Teléfono Inválido', 'En Perú el número de WhatsApp debe tener 9 dígitos y comenzar con 9 (Ej: 987654321).', 'warning', 5000);
    } else {
      alert('En Perú el número de WhatsApp debe tener 9 dígitos y comenzar con 9.');
    }
    if (telefonoEl) telefonoEl.focus();
    return;
  }

  if (!validarDniPeru(rawDni)) {
    if (typeof showToast === 'function') {
      showToast('⚠️ DNI Inválido', 'En Perú el DNI consta de exactamente 8 dígitos numéricos (Ej: 12345678).', 'warning', 5000);
    } else {
      alert('En Perú el DNI consta de exactamente 8 dígitos numéricos.');
    }
    if (dniEl) dniEl.focus();
    return;
  }

  const telefono = normalizarTelefonoPeru(rawTelefono);
  const dni = normalizarDniPeru(rawDni);

  if (!email || !password) {
    if (typeof showToast === 'function') showToast('Error', 'Ingresa correo y contraseña', 'error');
    return;
  }

  if (password.length < 8) {
    if (typeof showToast === 'function') showToast('Error', 'La contraseña debe tener al menos 8 caracteres', 'error');
    return;
  }
  if (emailAuthRequestInFlight) return;

  emailAuthRequestInFlight = true;
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Registrando cuenta en NOTIGAS Perú...');
  try {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: `${nombre} ${apellido}`.trim(),
          nombre: nombre,
          apellido: apellido,
          telefono: telefono,
          dni: dni
        }
      }
    });

    if (error) {
      if (typeof showToast === 'function') showToast('Error de registro', 'No se pudo completar el registro: ' + (error.message || 'Revisa los datos.'), 'error');
      return;
    }

    if (data && data.session) {
      clearAuthThrottle('register');
      try {
        await guardarPerfilSupabase(data.user, {
          nombre,
          apellido,
          telefono,
          dni,
          ciudad: AppState.get('city') || 'lima',
          role: 'vecino'
        });
      } catch(e) {
        console.warn('Error guardando perfil post-registro:', e);
      }
      if (typeof showToast === 'function') showToast('Éxito', '¡Bienvenido a NOTIGAS Perú! Registro completado.', 'success');
      await procesarSesionExitosa(data.user, true);
    } else if (data && data.user) {
      clearAuthThrottle('register');
      try {
        await guardarPerfilSupabase(data.user, {
          nombre,
          apellido,
          telefono,
          dni,
          ciudad: AppState.get('city') || 'lima',
          role: 'vecino'
        });
      } catch(e) {}
      if (typeof showToast === 'function') showToast('Revisa tu correo', 'Te hemos enviado un enlace para confirmar tu cuenta. Confírmala y luego ingresa.', 'info', 8000);
      setAuthAction('login');
      showAuthStep(2);
      selectAuthMethod('email');
    }
  } catch (networkError) {
    console.warn('Fallo de red durante el registro:', networkError);
    if (typeof showToast === 'function') showToast('Sin conexión', 'No se pudo contactar al servicio de registro. Intenta nuevamente.', 'error', 5000);
  } finally {
    emailAuthRequestInFlight = false;
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}

async function procesarSesionExitosa(user, isInteractive = false) {
  if (!user || !user.id) return;
  const now = Date.now();
  if (_processingSessionUserId === user.id && (now - _lastProcessedSessionTime < 2500)) {
    return;
  }
  _processingSessionUserId = user.id;
  _lastProcessedSessionTime = now;

  try {
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    const gmail = user.email ? user.email.toLowerCase().trim() : '';

    let userNombre = user.user_metadata?.nombre || '';
    let userApellido = user.user_metadata?.apellido || '';
    if (!userNombre && user.user_metadata?.full_name) {
      const parts = user.user_metadata.full_name.trim().split(' ');
      userNombre = parts[0] || '';
      userApellido = parts.slice(1).join(' ') || '';
    }
    if (!userNombre) userNombre = (gmail ? gmail.split('@')[0] : 'Usuario');

    // 1. CARGA UNIFICADA DE DATOS DE USUARIO (1 solo viaje de red)
    let esRepartidorDB = false;
    let choferData = null;
    let existingProfile = null;

    if (window.supabaseClient && user?.id) {
      try {
        const { data: bootData, error: bootErr } = await window.supabaseClient.rpc('rpc_get_user_bootstrap_data');
        if (!bootErr && bootData) {
          if (bootData.driver) {
            esRepartidorDB = true;
            choferData = bootData.driver;
          }
          if (bootData.profile) {
            existingProfile = bootData.profile;
            if (existingProfile.nombre) userNombre = existingProfile.nombre;
            if (existingProfile.apellido) userApellido = existingProfile.apellido;
          }
          if (bootData.is_admin) {
            AppState.set('isAdmin', true);
            window._cachedIsAdmin = true;
            window._cachedAdminEmail = gmail;
            const btnAdmin = document.getElementById('btnAdminAccessQuick');
            if (btnAdmin) btnAdmin.style.display = 'flex';
          }
        } else {
          // Fallback a consultas paralelas directas
          const [driverRes, profileRes] = await Promise.all([
            window.supabaseClient
              .from('choferes_habilitados')
              .select('ciudad, categoria, productos, schedule, estado_verificacion, bloqueado, motivo_bloqueo, dni, placa, comisiones_pendientes, limite_credito, estado_servicio')
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
            if (choferData.bloqueado || choferData.estado_verificacion === 'bloqueado') {
              if (window.DeviceSecurity) {
                window.DeviceSecurity.triggerLockout(choferData.motivo_bloqueo || 'Dispositivo suspendido por falta de pago de comisiones.');
              }
              return;
            }
          }
          if (profileRes?.data) {
            existingProfile = profileRes.data;
            if (existingProfile.nombre) userNombre = existingProfile.nombre;
            if (existingProfile.apellido) userApellido = existingProfile.apellido;
          }
          if (window.checkAndApplyAdminStatus) {
            window.checkAndApplyAdminStatus(user).catch(() => {});
          }
        }

        if (choferData && (choferData.bloqueado || choferData.estado_verificacion === 'bloqueado')) {
          if (window.DeviceSecurity) {
            window.DeviceSecurity.triggerLockout(choferData.motivo_bloqueo || 'Dispositivo suspendido por falta de pago de comisiones.');
          }
          return;
        }

        if (!window._roleSelectedNow) {
          if (window._targetAuthRole === 'driver') {
            currentSelectedRole = 'driver';
          } else {
            currentSelectedRole = esRepartidorDB && existingProfile?.role !== 'vecino'
              ? 'driver'
              : ((existingProfile?.role === 'repartidor') ? 'driver' : 'buyer');
          }
        }
      } catch(e) {
        console.error("Error verificando usuario en BD:", e);
      }
    }

    // 2. Si es un usuario 100% NUEVO (no existe chofer ni perfil, y no ha seleccionado rol aún)
    if (!esRepartidorDB && !existingProfile && !window._roleSelectedNow) {
      if (window._targetAuthRole === 'driver') {
        currentSelectedRole = 'driver';
      } else {
        if (!isInteractive) {
          console.info("Sesión incompleta en segundo plano: permitiendo navegación libre");
          return;
        }
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
    }

    const resolvedCity = (choferData?.ciudad || existingProfile?.ciudad || AppState.get('city') || 'lima').toLowerCase().trim();

    const clienteData = {
      role: currentSelectedRole === 'driver' ? 'repartidor' : 'vecino',
      gmail,
      nombre: (existingProfile?.nombre || userNombre),
      apellido: (existingProfile?.apellido || userApellido),
      telefono: existingProfile?.telefono || choferData?.telefono_whatsapp || user.user_metadata?.telefono || '',
      dni: existingProfile?.dni || user.user_metadata?.dni || choferData?.dni || '',
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
        if (choferData.dni) clienteData.dni = choferData.dni;
        if (choferData.placa) clienteData.placa = choferData.placa;

        AppState.set('city', clienteData.ciudad);
      } else {
        // Driver NO EXISTE en la DB. Comprobar bloqueo previo del dispositivo
        if (window.DeviceSecurity && typeof window.DeviceSecurity.checkBlockedStatus === 'function') {
          const lockCheck = await window.DeviceSecurity.checkBlockedStatus(clienteData.dni);
          if (lockCheck && lockCheck.bloqueado) {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
            window.DeviceSecurity.triggerLockout(lockCheck.motivo);
            return;
          }
        }

        // Mostrar formulario de registro de negocio
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        if (modalAuth) modalAuth.style.display = 'none';

        const inputDriverNombre = document.getElementById('inputDriverNombre');
        if (inputDriverNombre) inputDriverNombre.value = clienteData.nombre;

        const inputDriverDni = document.getElementById('inputDriverDni');
        if (inputDriverDni && clienteData.dni) inputDriverDni.value = clienteData.dni;

        const modalDriver = document.getElementById('modalDriver');
        if (modalDriver) modalDriver.style.display = 'flex';

        const titleEl = document.getElementById('driverModalTitleText');
        const subtitleEl = document.getElementById('driverModalSubtitle');
        if (titleEl) titleEl.textContent = 'Registro de Repartidor';
        if (subtitleEl) subtitleEl.textContent = 'Completa tu ficha de negocio. Aparecerá en la lista de repartidores de la zona.';

        sessionStorage.setItem('notigas_temp_gmail', gmail);
        return;
      }
    }

    AppState.set('userData', clienteData);
    if (clienteData.ciudad) AppState.set('city', clienteData.ciudad);
    window._roleSelectedNow = false;

    if (modalAuth) modalAuth.style.display = 'none';

    if (currentSelectedRole === 'driver') {
      if (typeof setAppMode === 'function') setAppMode('driver');
      if (isInteractive && typeof showToast === 'function') {
        const welcomedKey = `notigas_welcomed_${user.id}`;
        if (!sessionStorage.getItem(welcomedKey)) {
          sessionStorage.setItem(welcomedKey, 'true');
          showToast('✅ Sesión Segura', `Ingresaste como Repartidor (${gmail})`, 'success', 2000);
        }
      }
    } else {
      // Comprador
      try {
        if (!existingProfile) {
          guardarPerfilSupabase(user, {
              nombre: clienteData.nombre,
              apellido: clienteData.apellido,
              role: 'vecino',
              ciudad: clienteData.ciudad || AppState.get('city') || 'lima'
          }).catch(err => console.warn('Aviso creando perfil nuevo:', err));
        }

        const tieneUbicacion = (existingProfile && existingProfile.latitude != null) || (window.currentGpsLat != null);
        if (!tieneUbicacion) {
          // Asíncrono en segundo plano — no bloquea el hilo principal ni la interfaz
          setTimeout(() => {
            solicitarYGuardarUbicacionHabitual(user).catch(() => {});
          }, 300);
        }
      } catch(pErr) {
        console.warn('Aviso perfil comprador:', pErr);
      }

      if (typeof setAppMode === 'function') setAppMode('buyer');
      if (typeof syncBuyerActiveOrderFromCloud === 'function') syncBuyerActiveOrderFromCloud();
      if (isInteractive && typeof showToast === 'function') {
        const welcomedKey = `notigas_welcomed_${user.id}`;
        if (!sessionStorage.getItem(welcomedKey)) {
          sessionStorage.setItem(welcomedKey, 'true');
          showToast('✅ Sesión Segura', `Bienvenido a NOTIGAS (${clienteData.nombre} ${clienteData.apellido})`, 'success', 2000);
        }
      }
    }

    if (window._pendingActionAfterAuth === 'abrirSubmenuPedidos') {
      window._pendingActionAfterAuth = null;
      setTimeout(() => {
        if (typeof window.abrirSubmenuPedidos === 'function') {
          window.abrirSubmenuPedidos();
        }
      }, 500);
    }
    if (typeof window.actualizarVisibilidadBotonesAuth === 'function') {
      window.actualizarVisibilidadBotonesAuth(true);
    }
    window._targetAuthRole = null;
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
  const phoneInput = document.getElementById('newUserPhone');
  const dniInput = document.getElementById('newUserDni');
  const citySelect = document.getElementById('newUserCity');

  const selectedName = (nameInput ? nameInput.value : '').trim();
  const selectedLastName = (lastNameInput ? lastNameInput.value : '').trim();
  const rawPhone = (phoneInput ? phoneInput.value : '').trim();
  const rawDni = (dniInput ? dniInput.value : '').trim();

  if (!selectedName || !selectedLastName) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Datos Requeridos', 'Por favor ingresa tu Nombre y Apellido completos.', 'warning', 3500);
    } else {
      alert('Por favor ingresa tu Nombre y Apellido.');
    }
    return;
  }

  // Validación de WhatsApp y DNI para clientes de Perú
  if (role !== 'repartidor') {
    if (!validarTelefonoPeru(rawPhone)) {
      if (typeof showToast === 'function') {
        showToast('⚠️ WhatsApp Requerido', 'En Perú el número móvil/WhatsApp debe tener 9 dígitos y comenzar con 9 (Ej: 987654321).', 'warning', 5000);
      } else {
        alert('En Perú el número de WhatsApp debe tener 9 dígitos y comenzar con 9.');
      }
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (!validarDniPeru(rawDni)) {
      if (typeof showToast === 'function') {
        showToast('⚠️ DNI Requerido', 'En Perú el DNI consta de exactamente 8 dígitos numéricos (Ej: 12345678).', 'warning', 5000);
      } else {
        alert('En Perú el DNI consta de exactamente 8 dígitos numéricos.');
      }
      if (dniInput) dniInput.focus();
      return;
    }
  }

  const selectedPhone = normalizarTelefonoPeru(rawPhone);
  const selectedDni = normalizarDniPeru(rawDni);

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
  u.telefono = selectedPhone || u.telefono || '';
  u.dni = selectedDni || u.dni || '';
  u.ciudad = selectedCity;
  AppState.set('userData', u);

  if (role === 'repartidor') {
    const inputDriverCiudad = document.getElementById('inputDriverCiudad');
    if (inputDriverCiudad) inputDriverCiudad.value = selectedCity;
    const inputDriverNombre = document.getElementById('inputDriverNombre');
    if (inputDriverNombre && !inputDriverNombre.value) {
      inputDriverNombre.value = `${selectedName} ${selectedLastName}`.trim();
    }
    const inputDriverTel = document.getElementById('inputDriverTelRef');
    if (inputDriverTel && selectedPhone) {
      inputDriverTel.value = selectedPhone;
    }
  }

  if (window._tempAuthUser) {
    try {
      await guardarPerfilSupabase(window._tempAuthUser, {
        nombre: selectedName,
        apellido: selectedLastName,
        telefono: selectedPhone,
        dni: selectedDni,
        ciudad: selectedCity,
        role: role === 'repartidor' ? 'repartidor' : 'vecino'
      });
    } catch(e) {
      console.warn("Error guardando perfil en selección de rol:", e);
    }
    await procesarSesionExitosa(window._tempAuthUser, true);
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
    if (typeof initGoogleOneTap === 'function') {
      try { initGoogleOneTap(); } catch(_) {}
    }
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


/* MODAL Y GESTIÓN DE FICHA DE COMPRADOR */
function abrirEdicionFichaComprador() {
  const u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && typeof val !== 'undefined' && val !== null) el.value = val;
  };
  setVal('inputBuyerProfileNombre', u.nombre || '');
  setVal('inputBuyerProfileApellido', u.apellido || '');
  setVal('inputBuyerProfileTelefono', u.telefono || '');
  setVal('inputBuyerProfileDni', u.dni || '');
  if (u.ciudad) {
    setVal('selectBuyerProfileCiudad', u.ciudad.toLowerCase().trim());
  }

  const modal = document.getElementById('modalBuyerProfile');
  if (modal) modal.style.display = 'flex';
}
window.abrirEdicionFichaComprador = abrirEdicionFichaComprador;

function closeBuyerProfileModal() {
  const modal = document.getElementById('modalBuyerProfile');
  if (modal) modal.style.display = 'none';
}
window.closeBuyerProfileModal = closeBuyerProfileModal;

async function guardarFichaComprador() {
  const nombre = document.getElementById('inputBuyerProfileNombre')?.value?.trim();
  const apellido = document.getElementById('inputBuyerProfileApellido')?.value?.trim();
  const rawTel = document.getElementById('inputBuyerProfileTelefono')?.value?.trim();
  const rawDni = document.getElementById('inputBuyerProfileDni')?.value?.trim();
  const ciudad = document.getElementById('selectBuyerProfileCiudad')?.value?.toLowerCase()?.trim() || 'lima';

  if (!nombre || !apellido) {
    showToast('⚠️ Datos Requeridos', 'Por favor ingresa tu Nombre y Apellido completos.', 'warning', 4000);
    return;
  }

  if (!validarTelefonoPeru(rawTel)) {
    showToast('⚠️ Teléfono Inválido', 'En Perú el número de WhatsApp debe tener 9 dígitos y comenzar con 9 (Ej: 987654321).', 'warning', 5000);
    document.getElementById('inputBuyerProfileTelefono')?.focus();
    return;
  }

  if (!validarDniPeru(rawDni)) {
    showToast('⚠️ DNI Inválido', 'En Perú el DNI consta de exactamente 8 dígitos numéricos.', 'warning', 5000);
    document.getElementById('inputBuyerProfileDni')?.focus();
    return;
  }

  const telefono = normalizarTelefonoPeru(rawTel);
  const dni = normalizarDniPeru(rawDni);

  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Guardando ficha de comprador...');
  try {
    let userId = (typeof getAuthenticatedUserId === 'function') ? await getAuthenticatedUserId() : null;
    if (!userId && window._tempAuthUser) userId = window._tempAuthUser.id;

    if (userId && window.supabaseClient) {
      await guardarPerfilSupabase({ id: userId }, {
        nombre,
        apellido,
        telefono,
        dni,
        ciudad,
        role: 'vecino'
      });
    }

    const u = AppState.get('userData') || {};
    u.nombre = nombre;
    u.apellido = apellido;
    u.telefono = telefono;
    u.dni = dni;
    u.ciudad = ciudad;
    AppState.set('userData', u);

    // Sincronizar ciudad activa si fue cambiada en la ficha
    if (typeof window.cambiarCiudad === 'function') {
      await window.cambiarCiudad(ciudad);
    } else {
      AppState.set('city', ciudad);
    }

    closeBuyerProfileModal();
    showToast('✅ Ficha Actualizada', `Tu ficha de comprador ha sido guardada. Ahora operas en ${ciudad.toUpperCase()}.`, 'success', 4000);
  } catch (err) {
    console.error('Error guardando ficha comprador:', err);
    showToast('Error', 'No se pudo guardar la ficha: ' + (err.message || 'Intenta de nuevo'), 'error', 4000);
  } finally {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  }
}
window.guardarFichaComprador = guardarFichaComprador;


/* GESTIÓN VISUAL DEL COLOR PICKER DE CAMIÓN Y VISTA PREVIA */
function inicializarColorPickerChofer() {
  const container = document.getElementById('driverTruckColorPicker');
  const inputColor = document.getElementById('inputDriverTruckColor');
  const inputNombre = document.getElementById('inputDriverNombre');
  const lblName = document.getElementById('lblDriverTruckColorName');
  if (!container || !window.NOTIGAS_TRUCK_PALETTE) return;

  const currentColor = (inputColor?.value || 'rojo').toLowerCase().trim();
  container.innerHTML = '';

  window.NOTIGAS_TRUCK_PALETTE.forEach(theme => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'color-swatch-chip' + (theme.key === currentColor ? ' active' : '');
    chip.style.width = '24px';
    chip.style.height = '24px';
    chip.style.borderRadius = '50%';
    chip.style.border = (theme.key === currentColor) ? '2.5px solid #FFFFFF' : '1.5px solid rgba(255,255,255,0.2)';
    chip.style.background = theme.primary;
    chip.style.cursor = 'pointer';
    chip.style.boxShadow = (theme.key === currentColor) ? '0 0 8px ' + theme.primary : 'none';
    chip.title = theme.name;

    chip.addEventListener('click', () => {
      seleccionarColorCamionModal(theme.key);
    });
    container.appendChild(chip);
  });

  actualizarVistaPreviaCamionChofer();

  if (inputNombre && !inputNombre._previewBound) {
    inputNombre._previewBound = true;
    inputNombre.addEventListener('input', () => {
      actualizarVistaPreviaCamionChofer();
    });
  }
}
window.inicializarColorPickerChofer = inicializarColorPickerChofer;

function seleccionarColorCamionModal(colorKey) {
  const inputColor = document.getElementById('inputDriverTruckColor');
  const lblName = document.getElementById('lblDriverTruckColorName');
  if (inputColor) inputColor.value = colorKey;

  const theme = window.getDriverColorTheme ? window.getDriverColorTheme(null, colorKey) : null;
  if (lblName && theme) {
    lblName.textContent = theme.name;
    lblName.style.color = theme.primary;
  }

  // Actualizar estilos activos de los chips
  const chips = document.querySelectorAll('#driverTruckColorPicker .color-swatch-chip');
  chips.forEach(c => {
    if (c.title === theme?.name) {
      c.style.border = '2.5px solid #FFFFFF';
      c.style.boxShadow = '0 0 8px ' + theme.primary;
    } else {
      c.style.border = '1.5px solid rgba(255,255,255,0.2)';
      c.style.boxShadow = 'none';
    }
  });

  actualizarVistaPreviaCamionChofer();
}
window.seleccionarColorCamionModal = seleccionarColorCamionModal;

function actualizarVistaPreviaCamionChofer() {
  const container = document.getElementById('driverTruckPreviewContainer');
  const nameInput = document.getElementById('inputDriverNombre');
  const inputColor = document.getElementById('inputDriverTruckColor');
  const previewName = document.getElementById('driverTruckPreviewName');
  if (!container || typeof window.generarSvgCamionDina !== 'function') return;

  const name = (nameInput?.value || 'Tu Camión').trim();
  const color = (inputColor?.value || 'rojo').trim();
  const initials = (typeof window.getDriverInitials === 'function') ? window.getDriverInitials(name) : 'R';

  container.innerHTML = window.generarSvgCamionDina({
    name: name,
    initials: initials,
    color: color,
    withBg: false,
    width: 76,
    height: 48
  });

  if (previewName) {
    previewName.textContent = name || 'Tu Camión Oficial';
  }
}
window.actualizarVistaPreviaCamionChofer = actualizarVistaPreviaCamionChofer;

/**
 * Configura la modalidad única de crédito operativo del repartidor
 * en el modal de registro/edición de chofer.
 */
function seleccionarPlanRegistroChofer() {
  const inputTipo = document.getElementById('inputDriverPlanTipo');
  if (inputTipo) inputTipo.value = 'credito';
  const cardPro = document.getElementById('cardPlanDriverPro');
  const proContent = document.getElementById('driverPremiumProContent');
  const paymentSection = document.getElementById('driverPremiumPaymentSection');
  const statusBadge = document.getElementById('driverPremiumStatusBadge');
  if (cardPro) cardPro.style.display = 'none';
  if (proContent) proContent.style.display = 'none';
  if (paymentSection) paymentSection.style.display = 'none';
  if (statusBadge) statusBadge.style.display = 'none';
  const cardBase = document.getElementById('cardPlanDriverGratuito');
  if (cardBase) { cardBase.style.display = 'block'; cardBase.style.opacity = '1'; cardBase.style.border = '2px solid #10B981'; }
  const content = document.getElementById('driverPremiumGratuitoContent');
  if (content) { content.style.display = 'block'; content.innerHTML = '<p style="margin:0;font-size:11px;color:#CBD5E1;line-height:1.5;">Registro sin suscripción mensual. Tus primeros 50 pedidos confirmados son gratuitos. Después se aplica S/ 0,20 por pedido: primer ciclo S/ 20, luego crédito S/ 50 tras la primera remesa y S/ 100 tras la tercera.</p>'; }
  const btnText = document.getElementById('btnDriverSubmitText');
  if (btnText) btnText.textContent = 'Guardar ficha de repartidor';
}
window.seleccionarPlanRegistroChofer = seleccionarPlanRegistroChofer;


/**
 * Carga los datos del chofer (incluyendo precio del balón de 10 Kg, tipo de plan y suscripción Premium)
 * en los campos del modal de chofer (#modalDriver).
 */
async function cargarPerfilChoferEnModal() {
  if (!window.supabaseClient) return;

  try {
    const { data: authData } = await window.supabaseClient.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { data: driverRow, error } = await window.supabaseClient
      .from('choferes_habilitados')
      .select('id, user_id, nombre_completo, telefono_whatsapp, placa, dni, categoria, productos, schedule, ciudad, color_camion, precio_balon_10kg, es_premium, premium_vence_at, estado_pago_premium, comprobante_pago_url, tipo_plan, comisiones_pendientes, limite_credito, estado_servicio')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !driverRow) return;

    const inputNombre = document.getElementById('inputDriverNombre');
    const inputTel = document.getElementById('inputDriverTelRef');
    const inputPlaca = document.getElementById('inputDriverPlate');
    const inputDni = document.getElementById('inputDriverDni');
    const inputCat = document.getElementById('inputDriverCat');
    const inputProd = document.getElementById('inputDriverProductos');
    const inputCiudad = document.getElementById('inputDriverCiudad');
    const inputPrecio10kg = document.getElementById('inputDriverPrecioBalon10kg');

    if (inputNombre && driverRow.nombre_completo) inputNombre.value = driverRow.nombre_completo;
    if (inputTel && driverRow.telefono_whatsapp) inputTel.value = driverRow.telefono_whatsapp;
    if (inputPlaca && driverRow.placa) inputPlaca.value = driverRow.placa;
    if (inputDni && driverRow.dni) inputDni.value = driverRow.dni;
    if (inputCat && driverRow.categoria) inputCat.value = driverRow.categoria;
    if (inputProd && driverRow.productos) inputProd.value = driverRow.productos;
    if (inputCiudad && driverRow.ciudad) inputCiudad.value = driverRow.ciudad;
    if (inputPrecio10kg && driverRow.precio_balon_10kg != null) {
      inputPrecio10kg.value = driverRow.precio_balon_10kg;
    }

    if (driverRow.color_camion && typeof seleccionarColorCamionModal === 'function') {
      seleccionarColorCamionModal(driverRow.color_camion);
    }
    seleccionarPlanRegistroChofer('credito');
    actualizarEstadoUIPerfilPremium(driverRow);
  } catch (err) {
    console.warn('Error al cargar perfil de chofer en modal:', err);
  }
}
window.cargarPerfilChoferEnModal = cargarPerfilChoferEnModal;

/**
 * Oculta controles heredados de suscripción que ya no forman parte del modelo vigente.
 */
function actualizarEstadoUIPerfilPremium() {
  ['driverPremiumStatusBadge','driverPremiumActiveAlert','driverPremiumPendingAlert','driverPremiumProContent','driverPremiumPaymentSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
window.actualizarEstadoUIPerfilPremium = actualizarEstadoUIPerfilPremium;


let ultimoResultadoVoucherOcr = null;

/**
 * Maneja el evento change al seleccionar un comprobante en el modal de chofer.
 * Ejecuta OCR automático en el cliente y muestra los resultados detectados.
 */
async function manejarSeleccionVoucherDriver() {
  if (typeof showToast === 'function') showToast('Pagos', 'Los pagos de comisiones se gestionan desde la sección Pagos del repartidor.', 'info', 3500);
}
window.manejarSeleccionVoucherDriver = manejarSeleccionVoucherDriver;


/**
 * Sube el comprobante de pago QR a Supabase Storage (bucket 'vouchers-premium')
 * y llama al RPC 'rpc_driver_submit_premium_payment' para activación VIP inmediata.
 */
async function enviarComprobantePagoPremium() {
  if (typeof showToast === 'function') showToast('Función retirada', 'No existen suscripciones PRO/VIP. Usa la sección Pagos únicamente cuando alcances el límite de crédito.', 'info', 4500);
}
window.enviarComprobantePagoPremium = enviarComprobantePagoPremium;


// Hook para los controles de voucher en modalDriver
document.addEventListener('DOMContentLoaded', () => {
  const inputVoucher = document.getElementById('inputDriverVoucherFile');
  if (inputVoucher) {
    inputVoucher.addEventListener('change', manejarSeleccionVoucherDriver);
  }

  const btnSubmitVoucher = document.getElementById('btnDriverSubmitVoucher');
  if (btnSubmitVoucher) {
    btnSubmitVoucher.addEventListener('click', (e) => {
      e.preventDefault();
      enviarComprobantePagoPremium();
    });
  }
});
