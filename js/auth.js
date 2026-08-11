/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
   ========================================================================== */
// FIX #16: escapeHtmlStr centralizada en state.js — eliminada aquí para evitar conflictos.


const GOOGLE_CLIENT_ID = "994996215118-d8vhi4qjtbosvak58mm1c6ritq65hnc9.apps.googleusercontent.com";

let currentSelectedRole = 'buyer'; // 'buyer' o 'driver'
let currentSelectedMethod = 'google'; // 'google' o 'email'

let databaseEmails = [
  { gmail: "cliente_otb@gmail.com", role: "Cliente", fecha: "2026-08-01" },
  { gmail: "gasero_express@gmail.com", role: "Repartidor Gas GLP", fecha: "2026-08-01" }
];

document.addEventListener('DOMContentLoaded', () => {
  // Siempre mostrar el modal de seleccion de rol primero
  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) modalAuth.style.display = 'flex';
  
  // Iniciar One Tap en segundo plano
  initGoogleOneTap();

  const savedUser = localStorage.getItem('notigas_user_data');
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

        const adminEmails = ["erikmartinelly@gmail.com", "leonmartinelly13@gmail.com"];
        if (adminEmails.includes(u.gmail.toLowerCase())) {
          const btnAdmin = document.getElementById('btnAdminAccessQuick');
          if (btnAdmin) btnAdmin.style.display = 'flex';
          if (!sessionStorage.getItem('notigas_admin_token')) {
             sessionStorage.setItem('notigas_admin_token', u.gmail);
          }
        }
      }
    } catch (e) {
      console.error("Error al leer datos de usuario local:", e);
    }
  }
});

function getCurrentUserId() {
  let userId = 'anonimo_id';
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u && u.user_id) {
        userId = u.user_id;
      }
    }
  } catch(e){}
  return userId;
}

function selectAuthRole(role) {
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

  // Validar sesión activa ANTES de pedir logueo
  const savedUserStr = localStorage.getItem('notigas_user_data');
  if (savedUserStr) {
    try {
      const u = JSON.parse(savedUserStr);
      if (u && u.user_id) {
        // Actualizar el rol según lo que escogió hoy
        u.role = role === 'driver' ? 'repartidor' : 'vecino';
        localStorage.setItem('notigas_user_data', JSON.stringify(u));
        
        // Cerrar modal y arrancar app directamente
        const modalAuth = document.getElementById('modalWelcomeAuth');
        if (modalAuth) modalAuth.style.display = 'none';
        
        if (typeof setAppMode === 'function') {
           setAppMode(role);
        }
        return; // Detener flujo (ya entró directo)
      }
    } catch(e) {}
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
          const regGmail = document.getElementById('regGmail');
          if (regGmail) regGmail.focus();
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

    // Verificación de Administrador
    const adminEmails = ["erikmartinelly@gmail.com", "leonmartinelly13@gmail.com"];
    if (adminEmails.includes(gmail)) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      alert("⚠️ Eres administrador. Por favor ingresa por el Panel de Administración protegido.");
      return;
    }

    // Verificamos SIEMPRE si el usuario ya es repartidor en la BD
    try {
      const { data: existingDriver, error: driverCheckError } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('id, ciudad')
        .eq('user_id', user.id)
        .maybeSingle();

      if (driverCheckError) {
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        if (typeof showToast === 'function') showToast('Error de conexión', 'No se pudo verificar tu cuenta. Intenta de nuevo.', 'error', 4000);
        return;
      }
        
      if (existingDriver) {
        if (existingDriver.ciudad) {
           AppState.set('city', existingDriver.ciudad.toLowerCase());
        }
        // Ya existe en la base de datos como repartidor, forzar rol y entrar
        currentSelectedRole = 'driver';
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        procesarSesionExitosa(user);
        return;
      }
    } catch(e) {
      console.error("Error verificando repartidor existente:", e);
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      if (typeof showToast === 'function') showToast('Error', 'No se pudo verificar la sesión. Intenta de nuevo.', 'error', 4000);
      return;
    }

    // Si NO es repartidor en la BD, verificamos si quería registrarse como uno
    if (currentSelectedRole === 'driver') {
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
      return;
    }

    // Si NO es repartidor y seleccionó 'vecino' (buyer), iniciar como vecino
    const clienteData = { 
      role: 'vecino', 
      gmail: gmail, 
      nombre: nombre, 
      user_id: user.id 
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(clienteData));

    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof setAppMode === 'function') setAppMode('buyer');
    if (typeof verificarYActivarChatAdminAuto === 'function') verificarYActivarChatAdminAuto();
    if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Iniciaste sesión como ${nombre}`, 'success', 1000);
    
    if (typeof reproducirSonidoNotificacion === 'function') {
      reproducirSonidoNotificacion();
    }
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    console.error("Error en Google Auth: ", err);
    selectAuthMethod('email');
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
    zonas: repartidorObj.zonas,
    schedule: repartidorObj.schedule,
    ciudad: repartidorObj.ciudad || 'santacruz'
  }], { onConflict: 'user_id' });
  
  if (typeof hideLoadingOverlay === 'function') {
    hideLoadingOverlay();
  }

  if (error) {
    console.error("Error registrando chofer en Supabase:", error);
    if (typeof showToast === 'function') showToast('Error', 'No se pudo guardar en la nube. Intenta de nuevo.', 'error');
    return false;
  }
  return true;
}

async function guardarRegistroUnico() {
  if (!window.supabaseClient) {
    alert('Error: El servidor no está disponible. Recarga la página.');
    return;
  }
  if (typeof showLoadingOverlay === 'function') showLoadingOverlay('Asegurando conexión...');
  
  // 1. Obtener sesión activa de Supabase
  const { data: sessionData, error: authError } = await window.supabaseClient.auth.getSession();
  const session = sessionData?.session;
  if (!session || authError) {
    if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    alert("❌ Error de seguridad: Debes iniciar sesión con Google o Email antes de continuar.");
    console.error(authError);
    return;
  }
  
  const userId = session.user.id;
  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();

  if (currentSelectedRole === 'driver') {
    const nombreNegocio = window.escapeHtmlStr((document.getElementById('regNombreNegocio')?.value || '').trim()) || 'Repartidor Gas GLP';
    const whatsapp = window.escapeHtmlStr((document.getElementById('regWhatsapp')?.value || '').trim()) || '74xxxx28';
    const placa = window.escapeHtmlStr((document.getElementById('regPlaca')?.value || '').trim()) || '3842-XYZ';
    const categoria = window.escapeHtmlStr((document.getElementById('regCategoriaNegocio')?.value || 'Gas GLP').trim());
    let productos = window.escapeHtmlStr((document.getElementById('regProductos')?.value || '').trim());
    if (!productos) {
      if (categoria === 'Gas GLP') productos = 'Garrafas GLP 10kg';
      else if (categoria === 'Detergentes') productos = 'Detergentes y Productos de Limpieza';
      else if (categoria === 'Chatarra') productos = 'Compra de Chatarra y Metales';
      else if (categoria === 'Papel') productos = 'Papel, Cartón y Reciclaje';
      else if (categoria === 'Frutas') productos = 'Frutas, Verduras y Hortalizas';
      else productos = 'Varios';
    }
    const zonas = window.escapeHtmlStr((document.getElementById('regZonas')?.value || '').trim()) || 'OTB Central y calles vecinas';
    const schedule = window.escapeHtmlStr((document.getElementById('regSchedule')?.value || '').trim()) || 'Lunes a Sábado: 07:00 a 18:00';
    const ciudad = window.escapeHtmlStr((document.getElementById('regCiudad')?.value || '').trim()) || 'santacruz';

    const repartidorData = {
      role: 'repartidor',
      nombre: nombreNegocio,
      whatsapp: whatsapp,
      placa: placa,
      categoria: categoria,
      productos: productos,
      zonas: zonas,
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
    localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));

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
    const gmailInput = document.getElementById('regGmail');
    const gmail = (gmailInput?.value || '').trim().toLowerCase() || 'vecino@gmail.com';
    const nombre = (document.getElementById('regNombre')?.value || '').trim() || 'Usuario';
    const apellido = (document.getElementById('regApellido')?.value || '').trim() || 'Vecino';

    const clienteData = { 
      role: 'vecino', 
      gmail, 
      nombre, 
      apellido, 
      user_id: userId // Usamos el ID seguro de Supabase Auth
    };
    localStorage.setItem('notigas_user_data', JSON.stringify(clienteData));

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
  const categoria = (document.getElementById('inputDriverCat')?.value || 'Gas GLP').trim();
  const productos = (document.getElementById('inputDriverProductos')?.value || '').trim();
  const zonas = (document.getElementById('inputDriverZonas')?.value || '').trim();
  const schedule = (document.getElementById('inputDriverSchedule')?.value || '').trim();

  if (!nombreNegocio || !whatsapp || !plate || !productos) {
    if (typeof showToast === 'function') showToast('⚠️ Campos Requeridos', 'Por favor completa todos los campos requeridos.', 'warning', 2000);
    return;
  }

  const tempGmail = sessionStorage.getItem('notigas_temp_gmail') || '';
  let existingGmail = tempGmail;
  let existingUserId = null;
  try {
     const saved = localStorage.getItem('notigas_user_data');
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
      alert("Error: El servidor no está disponible. Recarga la página.");
      return;
    }
    const { data: sessionData, error: authError } = await window.supabaseClient.auth.getSession();
    const session = sessionData?.session;
    if (!session || authError) {
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
      alert("Error: Debes iniciar sesión primero.");
      return;
    }
    existingUserId = session.user.id;
  }

  const ciudad = (document.getElementById('inputDriverCiudad')?.value || '').trim() || 'santacruz';

  const repartidorData = { 
    role: 'repartidor', 
    nombre: nombreNegocio,
    whatsapp: whatsapp, 
    placa: plate, 
    categoria: categoria, 
    productos: productos,
    zonas: zonas,
    schedule: schedule,
    ciudad: ciudad,
    user_id: existingUserId
  };
  
  if (existingGmail) repartidorData.gmail = existingGmail;

  localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
  AppState.set('city', ciudad.toLowerCase());
  await guardarRepartidorEnBaseDeDatos(repartidorData);
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
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) { const u = JSON.parse(saved); isDriver = (u.role === 'repartidor'); }
  } catch(e){}

  if (isDriver) {
    // Guardar GPS
    const gpsSelect = document.getElementById('driverGpsLive');
    const gpsVal = gpsSelect ? gpsSelect.value : 'on';
    localStorage.setItem('driverGpsLive', gpsVal);

    // Guardar sonido repartidor
    const soundSelect = document.getElementById('userPrefSoundDriver');
    const soundVal = soundSelect ? soundSelect.value : 'enabled';
    localStorage.setItem('notigas_pref_sound', soundVal);

    if (typeof verificarYMostrarRepartidorGPS === 'function') verificarYMostrarRepartidorGPS();
  } else {
    // Guardar sonido comprador
    const soundSelect = document.getElementById('userPrefSound');
    const soundVal = soundSelect ? soundSelect.value : 'enabled';
    localStorage.setItem('notigas_pref_sound', soundVal);
  }

  closeUserSettingsModal();
}

function cerrarSesionUsuario() {
  if (typeof showConfirmModal === 'function') {
    showConfirmModal('🚪', '¿Cerrar Sesión?', 'Al cerrar sesión podrás elegir ingresar como Comprador o Repartidor.', 'Sí, cerrar sesión', () => {
      localStorage.removeItem('notigas_user_data');
      localStorage.removeItem('driverGpsLive');
      localStorage.removeItem('notigas_active_order');

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
    localStorage.removeItem('notigas_user_data');
    localStorage.removeItem('driverGpsLive');
    localStorage.removeItem('notigas_active_order');

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
      const u = JSON.parse(localStorage.getItem('notigas_user_data') || '{}');
      if (u && u.id) {
         // Borrar la entrada de chofer si existe (el backend rechazará si no es suyo gracias a RLS)
         await window.supabaseClient.from('choferes_habilitados').delete().eq('user_id', u.id);
         // Detener el tracker de GPS si estaba activo
         if (typeof window.stopDriverLocationBroadcast === 'function') {
           window.stopDriverLocationBroadcast();
         }
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

  localStorage.removeItem('driverGpsLive');
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
    const saved = localStorage.getItem('notigas_user_data');
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
      whatsapp: driverProfile.whatsapp || '74xxxx28',
      placa: driverProfile.placa || driverProfile.plate || '3842-XYZ',
      categoria: driverProfile.categoria || driverProfile.category || 'Gas GLP',
      productos: driverProfile.productos || driverProfile.products || 'Garrafas GLP 10kg',
      zonas: driverProfile.zonas || driverProfile.zones || 'OTB Central y calles vecinas',
      schedule: driverProfile.schedule || 'Lunes a Sábado: 07:00 a 18:00',
      user_id: existingUserId
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
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
    password
  });
  
  if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
  
  if (error) {
    if (typeof showToast === 'function') showToast('Error de registro', error.message, 'error');
    return;
  }
  
  if (typeof showToast === 'function') showToast('Éxito', 'Registro completado. Ingresando...', 'success');
  
  if (data && data.user) {
    procesarSesionExitosa(data.user);
  }
}

async function procesarSesionExitosa(user) {
  const gmail = user.email.toLowerCase().trim();
  const nombre = user.user_metadata?.full_name || gmail.split('@')[0];
  const clienteData = { 
    role: currentSelectedRole === 'driver' ? 'repartidor' : 'vecino',
    gmail, 
    nombre, 
    user_id: user.id 
  };
  
  if (currentSelectedRole === 'driver' && window.supabaseClient) {
    try {
      const { data: choferData } = await window.supabaseClient
        .from('choferes_habilitados')
        .select('ciudad')
        .eq('user_id', user.id)
        .maybeSingle();
      if (choferData && choferData.ciudad) {
        AppState.set('city', choferData.ciudad.toLowerCase());
      }
    } catch(e) {}
  }
  
  localStorage.setItem('notigas_user_data', JSON.stringify(clienteData));
  
  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) modalAuth.style.display = 'none';
  
  if (currentSelectedRole === 'driver') {
    if (typeof setAppMode === 'function') setAppMode('driver');
    if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Ingresaste como Repartidor (${gmail})`, 'success', 2000);
  } else {
    if (typeof setAppMode === 'function') setAppMode('buyer');
    if (typeof showToast === 'function') showToast('✅ Sesión Segura', `Bienvenido a NOTIGAS (${gmail})`, 'success', 2000);
  }
}


let currentAuthAction = 'login'; // 'login' or 'register'

window.showAuthStep = function(step) {
  const step1 = document.getElementById('authStep1_Role');
  const step2 = document.getElementById('authStep2_Action');
  const step3 = document.getElementById('authStep3_Method');
  if (step1) step1.style.display = (step === 1) ? 'block' : 'none';
  if (step2) step2.style.display = (step === 2) ? 'block' : 'none';
  if (step3) step3.style.display = (step === 3) ? 'block' : 'none';
  
  if (step === 3) {
    const btnEmailAction = document.getElementById('btnEmailAction');
    const step3Title = document.getElementById('authStep3Title');
    if (btnEmailAction) btnEmailAction.innerText = (currentAuthAction === 'login') ? 'Ingresar' : 'Registrarse';
    if (step3Title) step3Title.innerText = (currentAuthAction === 'login') ? 'Selecciona método de ingreso:' : 'Selecciona método de registro:';
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
