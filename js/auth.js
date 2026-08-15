/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
   ========================================================================== */
// FIX #16: escapeHtmlStr centralizada en state.js — eliminada aquí para evitar conflictos.


const GOOGLE_CLIENT_ID = "994996215118-d8vhi4qjtbosvak58mm1c6ritq65hnc9.apps.googleusercontent.com";

let currentSelectedRole = 'buyer'; // 'buyer' o 'driver'
let currentSelectedMethod = 'google'; // 'google' o 'email'

let databaseEmails = [];

document.addEventListener('DOMContentLoaded', () => {
  // 1. Iniciar One Tap en segundo plano
  initGoogleOneTap();

  const initAuthSession = async () => {
    let hasSession = false;
    if (window.supabaseClient) {
      try {
        const { data: sessionData } = await window.supabaseClient.auth.getSession();
        if (sessionData && sessionData.session) {
          hasSession = true;
          // Restaurar sesión sin mostrar el modal
          window._tempAuthUser = sessionData.session.user;
          
          // Restaurar estado local como fallback temporal (evita que el comprador vea el modal en cada F5)
          const savedUser = JSON.stringify(AppState.get('userData') || {});
          if (savedUser) {
            try {
              const u = JSON.parse(savedUser);
              if (u.ciudad) AppState.set('city', u.ciudad.toLowerCase());
              
              currentSelectedRole = u.role === 'repartidor' ? 'driver' : 'buyer';
              window._roleSelectedNow = true;
            } catch(e){}
          }
          
          // Esperamos a que la Base de Datos decida el rol y ciudad (Fuente de Verdad)
          await procesarSesionExitosa(sessionData.session.user);
        }
      } catch(e) {
        console.warn("No se pudo restaurar la sesión automáticamente", e);
      }
    }

    // 2. Si no hay sesión, mostrar el modal de seleccion de rol primero
    if (!hasSession) {
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'flex';
    }

    // 3. Notificar al resto de la app que Auth terminó su validación inicial (ya sea con o sin sesión)
    document.dispatchEvent(new Event('notigas_auth_ready'));
  };

  if (window.supabaseClient) {
    initAuthSession();
  } else {
    document.addEventListener('supabase_ready', initAuthSession);
  }

  const savedUser = JSON.stringify(AppState.get('userData') || {});
  if (savedUser) {
    try {
      const u = JSON.parse(savedUser);
      // Solo configurar adminEmails y databaseEmails, SIN entrar a la app automaticamente
      if (u.gmail) {
        databaseEmails.push({ 
          gmail: u.gmail, 
          role: u.role || "Cliente", 
          fecha: new Date().toISOString().split('T')[0] 
        });

        async function checkAdminAsync() {
          try {
            if (!window.supabaseClient) return;
            
            // Verificar primero si hay sesión real en Supabase para evitar spoofing
            const { data: sessionData } = await window.supabaseClient.auth.getSession();
            if (!sessionData || !sessionData.session || !sessionData.session.user) return;
            const userEmail = sessionData.session.user.email;
            
            const { data } = await window.supabaseClient.from('admin_credentials').select('email').ilike('email', userEmail).single();
            if (data) {
              const btnAdmin = document.getElementById('btnAdminAccessQuick');
              if (btnAdmin) btnAdmin.style.display = 'flex';
              AppState.set('isAdmin', true);
            } else {
              AppState.set('isAdmin', false);
            }
          } catch(e) {
            AppState.set('isAdmin', false);
          }
        }
        setTimeout(checkAdminAsync, 1000);
      }
    } catch (e) {
      console.error("Error al leer datos de usuario local:", e);
    }
  }
});

function getCurrentUserId() {
  // Priorizar siempre el ID de la sesión autenticada real
  if (window._tempAuthUser && window._tempAuthUser.id) {
    return window._tempAuthUser.id;
  }
  
  let userId = 'anonimo_id';
  try {
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      const u = JSON.parse(saved);
      if (u && u.user_id) {
        userId = u.user_id;
      }
    }
  } catch(e){}
  return userId;
}

async function getAuthenticatedUserId() {
  if (!window.supabaseClient) return null;
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

async function guardarPerfilSupabase(user, changes = {}) {
    if (!window.supabaseClient || !user?.id) {
        throw new Error(
            'Supabase o usuario no disponibles'
        );
    }

    const { data, error } =
        await window.supabaseClient
            .from('profiles')
            .upsert(
                [{
                    id: user.id,
                    ...changes,
                    updated_at: new Date().toISOString()
                }],
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
    const ciudad =
        typeof inferMainCityFromCoords === 'function'
            ? inferMainCityFromCoords(lat, lng)
            : AppState.get('city');

    await guardarPerfilSupabase(
        user,
        {
            role: 'vecino',
            ciudad: ciudad || 'santacruz',
            latitude: lat,
            longitude: lng,
            location_updated_at:
                new Date().toISOString()
        }
    );

    AppState.set(
        'city',
        ciudad || 'santacruz'
    );

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
    if (!navigator.geolocation) {
        if (typeof showToast === 'function') {
            showToast(
                'GPS no disponible',
                'Este dispositivo no permite obtener tu ubicación.',
                'error',
                6000
            );
        }
        return false;
    }

    try {
        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(
                'Obteniendo tu ubicación habitual...'
            );
        }

        const position =
            await solicitarGeolocalizacionNativaNavegador(
                /Mobi|Android|iPhone|iPad|iPod/i.test(
                    navigator.userAgent
                ),
                true
            );

        await guardarUbicacionHabitualUsuario(
            user,
            position.coords.latitude,
            position.coords.longitude
        );

        if (typeof detenerGPSComprador === 'function') {
            detenerGPSComprador();
        }

        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

        return true;

    } catch (error) {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

        if (typeof showToast === 'function') {
            showToast(
                '⚠️ Ubicación necesaria',
                'Debemos registrar tu ubicación habitual para completar el registro.',
                'warning',
                7000
            );
        }

        return false;
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
          width: 280
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
        const { data } = await window.supabaseClient.from('admin_credentials').select('email').ilike('email', gmail).single();
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
  const { error } = await window.supabaseClient.from('choferes_habilitados').upsert([{
    user_id: repartidorObj.user_id,
    nombre_completo: repartidorObj.nombre,
    telefono_whatsapp: repartidorObj.whatsapp,
    placa: repartidorObj.placa,
    categoria: repartidorObj.categoria,
    productos: repartidorObj.productos,
    schedule: repartidorObj.schedule,
    ciudad: repartidorObj.ciudad || 'santacruz'
  }], { onConflict: 'user_id' });
  
  if (typeof hideLoadingOverlay === 'function') {
    hideLoadingOverlay();
  }

  if (error) {
    console.error("Error registrando chofer en Supabase:", error);
    alert('Error al guardar la ficha: ' + error.message);
    if (typeof showToast === 'function') showToast('Error', 'No se pudo guardar en la nube. ' + error.message, 'error');
    return false;
  }
  return true;
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
    const ciudad = (document.getElementById('newUserCity')?.value || '').trim() || 'santacruz';

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
    if (!exito) {
       // FIX: Si falla la inserción en la nube, no guardar localmente ni activar el modo
       return;
    }

    // Solo guardar en local y activar modo si la BD confirmó
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
  
  if (!exito) {
    if (typeof showToast === 'function') showToast('❌ Error', 'No se pudo guardar la configuración. Reintenta.', 'error', 3000);
    return;
  }
  
  AppState.set('userData', repartidorData);
  AppState.set('city', ciudad.toLowerCase());
  
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
    const gpsVal = gpsSelect ? gpsSelect.value : 'on';
    AppState.set('driverGpsLive', gpsVal);

    // Guardar sonido repartidor
    const soundSelect = document.getElementById('userPrefSoundDriver');
    const soundVal = soundSelect ? soundSelect.value : 'enabled';
    AppState.set('prefSound', soundVal);

    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
  } else {
    // Guardar sonido comprador
    const soundSelect = document.getElementById('userPrefSound');
    const soundVal = soundSelect ? soundSelect.value : 'enabled';
    AppState.set('prefSound', soundVal);
  }

  closeUserSettingsModal();
}

function cerrarSesionUsuario() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🚪', '¿Cerrar Sesión?', 'Al cerrar sesión podrás elegir ingresar como Comprador o Repartidor.', 'Sí, cerrar sesión', () => {
      AppState.set('userData', null);
      AppState.set('driverGpsLive', 'on');
      AppState.set('activeOrder', null);
      AppState.set('isAdmin', false);
      if (window.supabaseClient) {
        window.supabaseClient.auth.signOut().catch(console.error);
      }

      closeUserSettingsModal();
      if (typeof closeDriverModal === 'function') closeDriverModal();

      if (typeof setAppMode === 'function') {
        setAppMode('buyer');
      }

      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) {
        modalAuth.style.display = 'flex';
        selectAuthRole('buyer');
      }

      if (typeof checkActiveOrderStatus === 'function') {
        checkActiveOrderStatus();
      }

      if (typeof showToast === 'function') showToast('🚪 Sesión Cerrada', 'Selecciona Comprador o Repartidor para ingresar.', 'info', 1000);
    });
  } else if (confirm("🚪 ¿Estás seguro de que deseas cerrar sesión en NOTIGAS?\n\nAl cerrar sesión podrás elegir ingresar como Comprador o Repartidor.")) {
    AppState.set('userData', null);
    AppState.set('driverGpsLive', 'on');
    AppState.set('activeOrder', null);
    AppState.set('isAdmin', false);
    if (window.supabaseClient) {
      window.supabaseClient.auth.signOut().catch(console.error);
    }

    closeUserSettingsModal();
    if (typeof closeDriverModal === 'function') closeDriverModal();

    if (typeof setAppMode === 'function') {
      setAppMode('buyer');
    }

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) {
      modalAuth.style.display = 'flex';
      selectAuthRole('buyer');
    }

    if (typeof checkActiveOrderStatus === 'function') {
      checkActiveOrderStatus();
    }

    if (typeof showToast === 'function') showToast('🚪 Sesión Cerrada', 'Selecciona tu rol para ingresar nuevamente.', 'info', 1000);
  }
}

function eliminarMiCuentaCompleta() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🗑️', '¿Eliminar Cuenta Completa?', 'Esta acción borrará permanentemente todos tus datos, pedidos y publicaciones.', 'Sí, eliminar', () => {
      ejecutarEliminacionTotalCuenta();
    });
  }
}

async function ejecutarEliminacionTotalCuenta() {
  if (window.supabaseClient) {
    try {
      const u = JSON.parse(JSON.stringify(AppState.get('userData') || {}) || '{}');
      const userId = u.user_id || u.id;
      if (userId) {
         // Borrar la entrada de chofer si existe (el backend rechazará si no es suyo gracias a RLS)
         await window.supabaseClient.from('choferes_habilitados').delete().eq('user_id', userId);
         
         // Llamar a la función RPC para eliminar el usuario por completo de auth.users
         await window.supabaseClient.rpc('delete_user_account');
         
         // Detener el tracker de GPS si estaba activo
         if (typeof window.stopDriverLocationBroadcast === 'function') {
           window.stopDriverLocationBroadcast();
         }
         
         // Cerrar sesión localmente
         await window.supabaseClient.auth.signOut();
      }
    } catch (e) {
      console.error('Error limpiando datos de Supabase', e);
    }
  }

  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('notigas_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  AppState.set('driverGpsLive', 'on');
  sessionStorage.clear();

  closeUserSettingsModal();
  if (typeof closeDriverModal === 'function') closeDriverModal();

  if (typeof setAppMode === 'function') {
    setAppMode('buyer');
  }

  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) modalAuth.style.display = 'flex';

  if (typeof showToast === 'function') showToast('🗑️ Cuenta Eliminada', 'Todos tus datos fueron eliminados de este dispositivo.', 'info', 2000);

  setTimeout(() => {
    window.location.reload();
  }, 400);
}

async function migrarDatosAntiguosARepartidor() {
  if (typeof closeUserSettingsModal === 'function') {
    closeUserSettingsModal();
  }

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
      ciudad: driverProfile.ciudad || AppState.get('city') || 'santacruz',
      user_id: existingUserId
    };

    AppState.set('userData', repartidorData);
    if (typeof guardarRepartidorEnBaseDeDatos === 'function') {
      await guardarRepartidorEnBaseDeDatos(repartidorData);
    }

    if (typeof setAppMode === 'function') {
      setAppMode('driver');
    }

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

    if (typeof showToast === 'function') {
      showToast('🟢 Modo Repartidor', `Sesión activa: ${repartidorData.nombre}`, 'success', 1000);
    }
    return;
  }

  // 3. Si no existe un perfil previo, desplegar la ventana de registro de Repartidor de inmediato
  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) {
    modalAuth.style.display = 'flex';
    selectAuthRole('driver');
  }
}

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
  
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Autenticando...');
  
  const { data, error } = await window.supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  
  if (error) {
    if (typeof showToast === 'function') showToast('Error de acceso', error.message, 'error');
    return;
  }
  
  if (data && data.user) procesarSesionExitosa(data.user);
}

async function registrarEmail() {
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
  
  if (password.length < 6) {
    if (typeof showToast === 'function') showToast('Error', 'La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }
  
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Registrando...');
  
  const { data, error } = await window.supabaseClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });
  
  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  
  if (error) {
    if (typeof showToast === 'function') showToast('Error de registro', error.message, 'error');
    return;
  }
  
  if (data && data.session) {
    if (typeof showToast === 'function') showToast('Éxito', 'Registro completado. Ingresando...', 'success');
    procesarSesionExitosa(data.user);
  } else if (data && data.user) {
    if (typeof showToast === 'function') showToast('Revisa tu correo', 'Te hemos enviado un enlace para confirmar tu cuenta. Confírmala y luego ingresa.', 'info', 8000);
    // Cambiamos a la vista de login para que ingresen despues de confirmar
    setAuthAction('login');
  }
}

async function procesarSesionExitosa(user) {
  const gmail = user.email.toLowerCase().trim();
  const nombre = user.user_metadata?.full_name || gmail.split('@')[0];
  
  try {
    if (window.supabaseClient) {
      const { data } = await window.supabaseClient.from('admin_credentials').select('email').ilike('email', gmail).single();
      if (data) {
        const btnAdmin = document.getElementById('btnAdminAccessQuick');
        if (btnAdmin) btnAdmin.style.display = 'flex';
        AppState.set('isAdmin', true);
      }
    }
  } catch(e) {}

  // VERIFICAR SIEMPRE si el usuario ya es repartidor en la BD, sin importar lo que seleccionó
  let esRepartidorDB = false;
  let choferData = null;
  
  if (window.supabaseClient) {
    try {
      const { data } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('ciudad, categoria, productos, schedule')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        esRepartidorDB = true;
        choferData = data;
        currentSelectedRole = 'driver'; // Forzar rol
      }
    } catch(e) {
      console.error("Error verificando repartidor:", e);
    }
  }

  // Si no es repartidor en BD y aún no ha seleccionado rol en esta sesión de login
  if (!esRepartidorDB && !window._roleSelectedNow) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    window._tempAuthUser = user;
    
    const modalRole = document.getElementById('modalRoleSelection');
    if (modalRole) modalRole.style.display = 'flex';
    return;
  }

  const clienteData = { 
    role: currentSelectedRole === 'driver' ? 'repartidor' : 'vecino',
    gmail, 
    nombre, 
    user_id: user.id 
  };
  
  if (currentSelectedRole === 'driver') {
    if (esRepartidorDB && choferData) {
      if (choferData.ciudad) {
        clienteData.ciudad = choferData.ciudad.toLowerCase();
        AppState.set('city', choferData.ciudad.toLowerCase());
      }
      if (choferData.categoria) clienteData.categoria = choferData.categoria;
      if (choferData.productos) clienteData.productos = choferData.productos;
      if (choferData.schedule) clienteData.schedule = choferData.schedule;
    } else {
      // Driver NO EXISTE en la DB. Mostrar formulario de registro!
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'none';

      const inputDriverNombre = document.getElementById('inputDriverNombre');
      if (inputDriverNombre) inputDriverNombre.value = nombre;
      
      const modalDriver = document.getElementById('modalDriver');
      if (modalDriver) modalDriver.style.display = 'flex';
      
      const titleEl = document.getElementById('driverModalTitleText');
      const subtitleEl = document.getElementById('driverModalSubtitle');
      if (titleEl) titleEl.textContent = 'Registro de Repartidor';
      if (subtitleEl) subtitleEl.textContent = 'Completa tu ficha de negocio. Aparecerá en la lista de repartidores de la OTB.';

      sessionStorage.setItem('notigas_temp_gmail', gmail);
      return; // Detenemos aquí, el form modalDriver completará el registro
    }
  }
  
  AppState.set('userData', clienteData);
  window._roleSelectedNow = false; // Reset state for next login
  
  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) modalAuth.style.display = 'none';
  
  if (currentSelectedRole === 'driver') {
    if (typeof setAppMode === 'function') setAppMode('driver');
    if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Ingresaste como Repartidor (${gmail})`, 'success', 2000);
  } else {
    // Comprador
    const profile = await guardarPerfilSupabase(user, {
        nombre,
        role: 'vecino',
        ciudad: AppState.get('city') || 'santacruz'
    });

    const tieneUbicacion = profile.latitude != null && profile.longitude != null;

    if (!tieneUbicacion) {
        await solicitarYGuardarUbicacionHabitual(user);
    }

    if (typeof setAppMode === 'function') setAppMode('buyer');
    if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Bienvenido a NOTIGAS (${gmail})`, 'success', 2000);
  }
}

window.finalizeRoleSelection = function(role) {
  const modalRole = document.getElementById('modalRoleSelection');
  if (modalRole) modalRole.style.display = 'none';
  
  const citySelect = document.getElementById('newUserCity');
  if (citySelect && citySelect.value) {
    const selectedCity = citySelect.value.toLowerCase();
    AppState.set('city', selectedCity);
    
    // Si ya hay user_data local (Google OneTap lo crea antes), actualizarlo con la ciudad
    const saved = JSON.stringify(AppState.get('userData') || {});
    if (saved) {
      try {
        const u = JSON.parse(saved);
        u.ciudad = selectedCity;
        AppState.set('userData', u);
      } catch(e) {}
    }
  }

  currentSelectedRole = role === 'repartidor' ? 'driver' : 'buyer';
  window._roleSelectedNow = true;
  
  if (window._tempAuthUser) {
    procesarSesionExitosa(window._tempAuthUser);
  }
};


let currentAuthAction = 'login'; // 'login' or 'register'

window.showAuthStep = function(step) {
  const step1 = document.getElementById('authStep1_Action');
  const step2 = document.getElementById('authStep2_Method');
  
  if (step1) step1.style.display = (step === 1) ? 'block' : 'none';
  if (step2) step2.style.display = (step === 2) ? 'block' : 'none';
  
  if (step === 2) {
    const btnEmailAction = document.getElementById('btnEmailAction');
    const step2Title = document.getElementById('authStep2Title');
    if (btnEmailAction) btnEmailAction.innerText = (currentAuthAction === 'login') ? 'Ingresar' : 'Registrarse';
    if (step2Title) step2Title.innerText = (currentAuthAction === 'login') ? 'Selecciona método de ingreso:' : 'Selecciona método de registro:';
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
