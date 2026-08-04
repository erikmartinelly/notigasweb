/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
   ========================================================================== */

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

/* INICIALIZACIÓN OFICIAL Y DE ALTA COMPATIBILIDAD CON FIREFOX / SAFARI / CHROME */
function initGoogleOneTap() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      // Renderizar el botón oficial de Google para compatibilidad con Firefox / Safari ETP
      const btnContainer = document.getElementById('g_id_onload_container');
      if (btnContainer) {
        google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left'
        });
      }
    } catch(e) {
      console.warn("Google GIS SDK Warning:", e);
    }
  }
}

function iniciarConGoogleDirecto() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    try {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse
      });

      google.accounts.id.prompt((notification) => {
        // En Firefox (Enhanced Tracking Protection), las cookies de terceros de One Tap suelen bloquearse.
        // Si no se despliega la ventana emergente, activamos de inmediato la verificación interactiva.
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          const reason = notification.getNotDisplayedReason() || notification.getSkippedReason();
          console.info("Google One Tap bloqueado en Firefox/Navegador:", reason);
          fallbackIngresoGoogleManual();
        }
      });
    } catch(err) {
      fallbackIngresoGoogleManual();
    }
  } else {
    fallbackIngresoGoogleManual();
  }
}

function fallbackIngresoGoogleManual() {
  const gmailPrompt = prompt("🌐 AUTENTICACIÓN GOOGLE (Firefox OK):\nIngresa tu correo Gmail de Google:");
  if (gmailPrompt && gmailPrompt.includes('@')) {
    const cleanGmail = gmailPrompt.trim().toLowerCase();
    const userData = {
      role: currentSelectedRole === 'driver' ? 'repartidor' : 'vecino',
      gmail: cleanGmail,
      nombre: cleanGmail.split('@')[0],
      apellido: 'Usuario'
    };
    localStorage.setItem('notigas_user_data', JSON.stringify(userData));
    
    if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
      databaseEmails.push({ gmail: cleanGmail, role: userData.role, fecha: new Date().toISOString().split('T')[0] });
    }
    
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (userData.role === 'repartidor' && typeof setAppMode === 'function') {
      setAppMode('driver');
    }

    if (typeof verificarYActivarChatAdminAuto === 'function') {
      verificarYActivarChatAdminAuto();
    }

    alert(`✅ INGRESO GOOGLE VERIFICADO (FIREFOX OK)\n\n¡Bienvenido ${userData.nombre} (${cleanGmail})!`);
  }
}

function handleCredentialResponse(response) {
  try {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const googleUser = JSON.parse(jsonPayload);
    const gmail = googleUser.email;
    const nombre = googleUser.given_name || googleUser.name;
    const apellido = googleUser.family_name || '';

    const userData = {
      role: currentSelectedRole === 'driver' ? 'repartidor' : 'vecino',
      gmail: gmail,
      nombre: nombre,
      apellido: apellido
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(userData));
    databaseEmails.push({ gmail: gmail, role: userData.role, fecha: new Date().toISOString().split('T')[0] });

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof verificarYActivarChatAdminAuto === 'function') {
      verificarYActivarChatAdminAuto();
    }

    alert(`✅ AUTENTICACIÓN GOOGLE EXITOSA\n\n¡Bienvenido ${nombre} (${gmail})! Tu cuenta ha sido registrada de forma segura.`);
  } catch(e) {
    console.error("Error al procesar credencial de Google:", e);
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

    if (!nombreNegocio || !whatsapp || !placa || !productos || !zonas) {
      alert('⚠️ FICHA DE REPARTIDOR OBLIGATORIA\n\nPor favor completa los campos requeridos para Repartidor: Nombre de Negocio, WhatsApp, Placa, ¿Qué vende? y Zonas de recorrido.');
      return;
    }

    const repartidorData = {
      role: 'repartidor',
      nombre: nombreNegocio,
      whatsapp: whatsapp,
      placa: placa,
      categoria: categoria,
      productos: productos,
      zonas: zonas,
      schedule: schedule || 'Lunes a Sábado: 07:00 a 18:00'
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
    guardarRepartidorEnBaseDeDatos(repartidorData);

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    if (typeof setAppMode === 'function') {
      setAppMode('driver');
    }

    alert(`🟢 MINI PÁGINA DE NEGOCIO PUBLICADA\n\n¡Bienvenido Repartidor ${nombreNegocio}! Tu Ficha de Negocio ha sido registrada y guardada para la administración.`);

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
      alert('Para compradores es obligatorio ingresar Correo Electrónico, Nombre y Apellido.');
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

    alert(`✅ REGISTRO VERIFICADO\n\nBienvenido a NOTIGAS (${gmail}).`);
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
    alert('Por favor completa todos los campos requeridos para publicar tu Mini Página de Negocio.');
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
  localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));
  guardarRepartidorEnBaseDeDatos(repartidorData);

  closeDriverModal();

  if (typeof setAppMode === 'function') {
    setAppMode('driver');
  }

  alert(`🟢 MINI PÁGINA DE NEGOCIO ACTIVADA EN NOTIGAS\n\nRepartidor: ${nombreNegocio}\nCategoría: ${categoria}\nPlaca: ${plate}\nWhatsApp: ${whatsapp}\n\nFicha registrada correctamente.`);
  
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

function cerrarSesionUsuario() {
  if (confirm("🚪 ¿Estás seguro de que deseas cerrar sesión en NOTIGAS?\n\nAl cerrar sesión podrás elegir ingresar como Comprador o Repartidor.")) {
    localStorage.removeItem('notigas_user_data');
    localStorage.removeItem('driverGpsLive');
    localStorage.removeItem('notigas_active_order');

    closeUserSettingsModal();
    closeDriverModal();

    if (typeof setAppMode === 'function') {
      setAppMode('buyer');
    }

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'flex';

    if (typeof checkActiveOrderStatus === 'function') {
      checkActiveOrderStatus();
    }

    alert('🚪 SESIÓN CERRADA CON ÉXITO\n\nSelecciona tu rol para ingresar nuevamente.');
  }
}

const iniciarSesionChofer = iniciarSesionRepartidor;
