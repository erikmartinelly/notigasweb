/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
function escapeHtmlStr(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GOOGLE_CLIENT_ID = "994996215118-a3gvm7gtorr1nof9vaksr05ndc1raso3.apps.googleusercontent.com";

let currentSelectedRole = 'buyer'; // 'buyer' o 'driver'
let currentSelectedMethod = 'google'; // 'google' o 'email'

let databaseEmails = [
  { gmail: "cliente_otb@gmail.com", role: "Cliente", fecha: "2026-08-01" },
  { gmail: "gasero_express@gmail.com", role: "Repartidor Gas GLP", fecha: "2026-08-01" }
];

document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('notigas_user_data');
  if (!savedUser) {
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'flex';
    initGoogleOneTap();
  } else {
    try {
      const u = JSON.parse(savedUser);
      if (u.gmail) {
        databaseEmails.push({ 
          gmail: u.gmail, 
          role: u.role || "Cliente", 
          fecha: new Date().toISOString().split('T')[0] 
        });
      }
    } catch (e) {
      console.error("Error al leer datos de usuario local:", e);
    }
  }
});

function selectAuthRole(role) {
  currentSelectedRole = role;
  const btnBuyer = document.getElementById('btnRoleBuyer');
  const btnDriver = document.getElementById('btnRoleDriver');
  const authFieldsBuyer = document.getElementById('authFieldsBuyer');
  const authFieldsDriver = document.getElementById('authFieldsDriver');

  if (btnBuyer && btnDriver) {
    btnBuyer.classList.toggle('active', role === 'buyer');
    btnDriver.classList.toggle('active', role === 'driver');
  }

  // AL SELECCIONAR REPARTIDOR: Activar automáticamente la pestaña de datos por Correo para mostrar los campos de Repartidor de inmediato
  if (role === 'driver') {
    selectAuthMethod('email');
    const submitBtn = document.querySelector('#authPaneEmail .btn-submit');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fa-solid fa-truck-fast"></i> 🚛 Ingresar / Publicar Ficha de Repartidor';
    }
  } else {
    const submitBtn = document.querySelector('#authPaneEmail .btn-submit');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Ingresar con Correo Electrónico';
    }
  }

  if (authFieldsBuyer && authFieldsDriver) {
    if (role === 'driver') {
      authFieldsDriver.style.display = 'block';
      authFieldsBuyer.style.display = 'none';
    } else {
      authFieldsBuyer.style.display = 'block';
      authFieldsDriver.style.display = 'none';
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
function initGoogleOneTap() {
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
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
      });

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

function handleCredentialResponse(response) {
  try {
    if (!response || !response.credential || typeof response.credential !== 'string') {
      selectAuthMethod('email');
      return;
    }

    const googleUser = parseGoogleJwt(response.credential);
    if (!googleUser || !googleUser.email) {
      selectAuthMethod('email');
      return;
    }

    const gmail = googleUser.email.toLowerCase().trim();
    const nombre = googleUser.given_name || googleUser.name || gmail.split('@')[0];
    const apellido = googleUser.family_name || '';

    if (currentSelectedRole === 'driver') {
      const modalAuth = document.getElementById('modalWelcomeAuth');
      if (modalAuth) modalAuth.style.display = 'none';

      const inputDriverNombre = document.getElementById('inputDriverNombre');
      if (inputDriverNombre) inputDriverNombre.value = `${nombre} ${apellido}`.trim();
      
      const modalDriver = document.getElementById('modalDriver');
      if (modalDriver) modalDriver.style.display = 'flex';
      
      const titleEl = document.getElementById('driverModalTitleText');
      const subtitleEl = document.getElementById('driverModalSubtitle');
      if (titleEl) titleEl.textContent = 'Registro de Repartidor';
      if (subtitleEl) subtitleEl.textContent = 'Completa tu ficha de negocio. Aparecerá en la lista de repartidores de la OTB.';

      sessionStorage.setItem('notigas_temp_gmail', gmail);
      return;
    }

    const userData = {
      role: 'vecino',
      gmail: gmail,
      nombre: nombre,
      apellido: apellido
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(userData));

    if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
      databaseEmails.push({ gmail: gmail, role: userData.role, fecha: new Date().toISOString().split('T')[0] });
    }

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof verificarYActivarChatAdminAuto === 'function') {
      verificarYActivarChatAdminAuto();
    }

    if (typeof showToast === 'function') {
      showToast('✅ Google Verificado', `¡Bienvenido ${nombre} (${gmail})!`, 'success', 4500);
    } else {
      alert(`✅ AUTENTICACIÓN GOOGLE EXITOSA\n\n¡Bienvenido ${nombre} (${gmail})!`);
    }
  } catch(e) {
    console.error("Error al procesar credencial de Google:", e);
    selectAuthMethod('email');
  }
}

function guardarRepartidorEnBaseDeDatos(repartidorObj) {
  let driversList = [];
  try {
    const raw = localStorage.getItem('notigas_registered_drivers_list');
    if (raw) driversList = JSON.parse(raw);
  } catch(e){}

  const cleanList = driversList.filter(d => 
    d.whatsapp !== repartidorObj.whatsapp && 
    d.nombre !== repartidorObj.nombre
  );

  const fullObj = {
    id: Date.now(),
    fechaRegistro: new Date().toISOString().split('T')[0],
    ...repartidorObj
  };

  cleanList.unshift(fullObj);
  localStorage.setItem('notigas_registered_drivers_list', JSON.stringify(cleanList));
}

function guardarRegistroUnico() {
  if (currentSelectedRole === 'driver') {
    const nombreNegocio = (document.getElementById('regNombreNegocio')?.value || '').trim();
    const whatsapp = (document.getElementById('regWhatsapp')?.value || '').trim();
    const placa = (document.getElementById('regPlaca')?.value || '').trim();
    const categoria = (document.getElementById('regCategoriaNegocio')?.value || 'Gas GLP').trim();
    const productos = (document.getElementById('regProductos')?.value || '').trim();
    const zonas = (document.getElementById('regZonas')?.value || '').trim();
    const schedule = (document.getElementById('regSchedule')?.value || '').trim();

    if (!nombreNegocio || !whatsapp) {
      if (typeof showToast === 'function') showToast('⚠️ Ficha Incompleta', 'Ingresa el Nombre del Repartidor/Negocio y tu WhatsApp.', 'warning', 1000);
      return;
    }

    const repartidorData = {
      role: 'repartidor',
      nombre: nombreNegocio,
      whatsapp: whatsapp,
      placa: placa || 'Placa registrada',
      categoria: categoria || 'Gas GLP',
      productos: productos || 'Servicios de reparto a domicilio',
      zonas: zonas || 'OTB Central y zonas aledañas',
      schedule: schedule || 'Lunes a Sábado: 07:00 a 18:00'
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
    guardarRepartidorEnBaseDeDatos(repartidorData);

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
      switchTab(1);
    }
  } else {
    const gmailInput = document.getElementById('regGmail');
    const gmail = (gmailInput?.value || '').trim();
    const nombre = (document.getElementById('regNombre')?.value || '').trim();
    const apellido = (document.getElementById('regApellido')?.value || '').trim();

    if (!gmail || !nombre || !apellido) {
      if (typeof showToast === 'function') showToast('⚠️ Datos Incompletos', 'Ingresa Correo Electrónico, Nombre y Apellido.', 'warning', 2000);
      return;
    }

    const clienteData = { role: 'vecino', gmail, nombre, apellido };
    localStorage.setItem('notigas_user_data', JSON.stringify(clienteData));
    databaseEmails.push({ gmail: gmail, role: 'Cliente', fecha: new Date().toISOString().split('T')[0] });

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof verificarYActivarChatAdminAuto === 'function') {
      verificarYActivarChatAdminAuto();
    }

    if (typeof showToast === 'function') showToast('✅ Registro Exitoso', `Bienvenido a NOTIGAS ${nombre}`, 'success', 2000);
  }
}

function closeDriverModal() { 
  const modalDriver = document.getElementById('modalDriver');
  if (modalDriver) modalDriver.style.display = 'none'; 
}

function iniciarSesionRepartidor() {
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
  try {
     const saved = localStorage.getItem('notigas_user_data');
     if (saved) {
       const u = JSON.parse(saved);
       if (u.gmail) existingGmail = u.gmail;
     }
  } catch(e){}

  // COMPROBACIÓN ESTRICTA DE BANEO POR LA ADMINISTRACIÓN
  if (typeof esRepartidorBaneado === 'function' && esRepartidorBaneado(nombreNegocio, plate, whatsapp, existingGmail)) {
    if (typeof showToast === 'function') {
      showToast('⛔ Acceso Suspendido', 'Tu cuenta de repartidor ha sido suspendida/baneada por la administración de NOTIGAS.', 'error', 2000);
    }
    return;
  }

  const repartidorData = { 
    role: 'repartidor', 
    nombre: nombreNegocio,
    whatsapp: whatsapp, 
    placa: plate, 
    categoria: categoria, 
    productos: productos,
    zonas: zonas,
    schedule: schedule
  };
  if (existingGmail) repartidorData.gmail = existingGmail;

  localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
  guardarRepartidorEnBaseDeDatos(repartidorData);
  sessionStorage.removeItem('notigas_temp_gmail');

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

function ejecutarEliminacionTotalCuenta() {
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

function ingresarComoRepartidorDirecto() {
  // 1. Verificar si existe un perfil de repartidor previo o guardado
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

  if (!driverProfile) {
    try {
      const rawDrivers = localStorage.getItem('notigas_registered_drivers_list');
      if (rawDrivers) {
        const list = JSON.parse(rawDrivers);
        if (list && list.length > 0) {
          driverProfile = list[0];
        }
      }
    } catch(e){}
  }

  // 2. Si ya hay un perfil de repartidor, activar el modo repartidor inmediatamente
  if (driverProfile) {
    const repartidorData = {
      role: 'repartidor',
      nombre: driverProfile.nombre || driverProfile.name || 'Repartidor Gas GLP',
      whatsapp: driverProfile.whatsapp || '74xxxx28',
      placa: driverProfile.placa || driverProfile.plate || '3842-XYZ',
      categoria: driverProfile.categoria || driverProfile.category || 'Gas GLP',
      productos: driverProfile.productos || driverProfile.products || 'Garrafas GLP 10kg',
      zonas: driverProfile.zonas || driverProfile.zones || 'OTB Central y calles vecinas',
      schedule: driverProfile.schedule || 'Lunes a Sábado: 07:00 a 18:00'
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
    if (typeof guardarRepartidorEnBaseDeDatos === 'function') {
      guardarRepartidorEnBaseDeDatos(repartidorData);
    }

    if (typeof setAppMode === 'function') {
      setAppMode('driver');
    }

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

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
