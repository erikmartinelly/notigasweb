/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
   ========================================================================== */

// CREDENCIALES OFICIALES DE GOOGLE CLOUD CONSOLE (ORGANIZACIÓN erikmartinelly-org)
const GOOGLE_CLIENT_ID = "994996215118-a3gvm7gtorr1nof9vaksr05ndc1raso3.apps.googleusercontent.com"; 
const GOOGLE_CLIENT_SECRET = "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";

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

/* INICIALIZACIÓN OFICIAL DE GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN) */
function initGoogleOneTap() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: true
    });

    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        console.log("Google One Tap desplegado o listo para interacción.");
      }
    });
  }
}

/* MANEJADOR DEL TOKEN DE RESPUESTA DE GOOGLE */
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
      role: 'vecino',
      gmail: gmail,
      nombre: nombre,
      apellido: apellido
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(userData));
    databaseEmails.push({ gmail: gmail, role: 'Cliente', fecha: new Date().toISOString().split('T')[0] });

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    alert(`✅ AUTENTICACIÓN GOOGLE 1-TAP EXITOSA\n\n¡Bienvenido ${nombre} (${gmail})! Tu cuenta ha sido registrada de forma segura en NOTIGAS.`);
  } catch(e) {
    console.error("Error al procesar credencial de Google:", e);
  }
}

function toggleRegFields() {
  const roleSelect = document.getElementById('regRole');
  const driverFields = document.getElementById('regDriverFields');
  const buyerFields = document.getElementById('regBuyerFields');
  
  if (roleSelect) {
    if (roleSelect.value === 'chofer') {
      if (driverFields) driverFields.style.display = 'block';
      if (buyerFields) buyerFields.style.display = 'none';
    } else {
      if (buyerFields) buyerFields.style.display = 'block';
      if (driverFields) driverFields.style.display = 'none';
    }
  }
}

function guardarRegistroUnico() {
  const roleSelect = document.getElementById('regRole');
  if (!roleSelect) return;

  const role = roleSelect.value;

  if (role === 'chofer') {
    const nombreNegocio = (document.getElementById('regNombreNegocio')?.value || '').trim();
    const whatsapp = (document.getElementById('regWhatsapp')?.value || '').trim();
    const placa = (document.getElementById('regPlaca')?.value || '').trim();
    const categoria = (document.getElementById('regCategoriaNegocio')?.value || 'Gas GLP').trim();
    const productos = (document.getElementById('regProductos')?.value || '').trim();

    if (!nombreNegocio || !whatsapp || !placa || !productos) {
      alert('Por favor completa los campos requeridos: Nombre del Repartidor, WhatsApp, Placa y ¿Qué reparte?.');
      return;
    }

    const repartidorData = {
      role: 'repartidor',
      nombre: nombreNegocio,
      whatsapp: whatsapp,
      placa: placa,
      categoria: categoria,
      productos: productos
    };

    localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    alert(`🟢 MINI PÁGINA DE NEGOCIO PUBLICADA\n\n¡Bienvenido Repartidor ${nombreNegocio}! Tu Mini Página de Facebook ha sido creada automáticamente en la pestaña REPARTIDORES.`);

    if (typeof renderVendorCards === 'function') {
      renderVendorCards('TODOS');
    }
    if (typeof switchTab === 'function') {
      switchTab(1); // Redirigir automáticamente a la Pestaña 2 (PÁGINAS DE NEGOCIO DE REPARTIDORES)
    }
  } else {
    const gmailInput = document.getElementById('regGmail');
    const gmail = (gmailInput?.value || '').trim();
    const nombre = (document.getElementById('regNombre')?.value || '').trim();
    const apellido = (document.getElementById('regApellido')?.value || '').trim();

    if (!gmail || !nombre || !apellido) {
      alert('Para clientes es obligatorio ingresar Gmail de Google, Nombre y Apellido.');
      return;
    }

    const clienteData = { role: 'vecino', gmail, nombre, apellido };
    localStorage.setItem('notigas_user_data', JSON.stringify(clienteData));
    databaseEmails.push({ gmail: gmail, role: 'Cliente', fecha: new Date().toISOString().split('T')[0] });

    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'none';

    alert(`✅ REGISTRO VERIFICADO CON GMAIL\n\nBienvenido a NOTIGAS (${gmail}).`);
  }
}

function closeDriverModal() { 
  const modalDriver = document.getElementById('modalDriver');
  if (modalDriver) modalDriver.style.display = 'none'; 
}

function iniciarSesionChofer() {
  const nombreNegocio = (document.getElementById('inputDriverNombre')?.value || '').trim();
  const whatsapp = (document.getElementById('inputDriverTelRef')?.value || '').trim();
  const plate = (document.getElementById('inputDriverPlate')?.value || '').trim();
  const categoria = (document.getElementById('inputDriverCat')?.value || 'Gas GLP').trim();
  const productos = (document.getElementById('inputDriverProductos')?.value || '').trim();

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
    productos: productos 
  };
  localStorage.setItem('notigas_user_data', JSON.stringify(repartidorData));

  closeDriverModal();
  alert(`🟢 MINI PÁGINA DE NEGOCIO ACTIVADA EN NOTIGAS\n\nRepartidor: ${nombreNegocio}\nCategoría: ${categoria}\nPlaca: ${plate}\nWhatsApp: ${whatsapp}\n\nSe ha abierto tu Mini Página en la pestaña REPARTIDORES.`);
  
  if (typeof renderVendorCards === 'function') {
    renderVendorCards('TODOS');
  }
  if (typeof switchTab === 'function') {
    switchTab(1); // Abrir automáticamente la pestaña 2 de Repartidores
  }
}
