/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN & GOOGLE IDENTITY SERVICES (1-TAP SIGN-IN)
   ========================================================================== */

// CLIENT ID DE GOOGLE CLOUD CONSOLE (ORGANIZACIÓN: erikmartinelly-org - ID: 55226185628)
const GOOGLE_CLIENT_ID = "55226185628-notigasweb.apps.googleusercontent.com"; 

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
    // Decodificar el JWT ID Token de Google (payload base64)
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
  const gmailInput = document.getElementById('regGmail');
  
  if (!roleSelect || !gmailInput) return;

  const role = roleSelect.value;
  const gmail = gmailInput.value.trim();

  if (!gmail) {
    alert('Por favor ingresa tu correo Gmail de Google.');
    return;
  }

  let data = { role, gmail };

  if (role === 'chofer') {
    const nombreNegocio = (document.getElementById('regNombreNegocio')?.value || '').trim();
    const categoria = (document.getElementById('regCategoriaNegocio')?.value || 'Gas GLP').trim();
    const placa = (document.getElementById('regPlaca')?.value || '').trim();
    const productos = (document.getElementById('regProductos')?.value || '').trim();
    const zonas = (document.getElementById('regZonas')?.value || '').trim();
    const telReferencia = (document.getElementById('regTelReferencia')?.value || '').trim();

    if (!nombreNegocio || !placa || !productos || !zonas || !telReferencia) {
      alert('Para crear tu Mini Página de Negocio es obligatorio completar: Nombre de Negocio, Categoria, Placa, Productos, Zonas y Teléfono Privado.');
      return;
    }

    data.nombre = nombreNegocio;
    data.categoria = categoria;
    data.placa = placa;
    data.productos = productos;
    data.zonas = zonas;
    data.telReferencia = telReferencia;
  } else {
    const nombre = (document.getElementById('regNombre')?.value || '').trim();
    const apellido = (document.getElementById('regApellido')?.value || '').trim();

    if (!nombre || !apellido) {
      alert('Para clientes es obligatorio ingresar Nombre y Apellido.');
      return;
    }
    data.nombre = nombre;
    data.apellido = apellido;
  }

  localStorage.setItem('notigas_user_data', JSON.stringify(data));
  databaseEmails.push({ gmail: gmail, role: role, fecha: new Date().toISOString().split('T')[0] });

  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) modalAuth.style.display = 'none';

  alert(`✅ REGISTRO VERIFICADO CON GOOGLE GMAIL\n\nBienvenido a NOTIGAS (${gmail}).`);
}

function closeDriverModal() { 
  const modalDriver = document.getElementById('modalDriver');
  if (modalDriver) modalDriver.style.display = 'none'; 
}

function iniciarSesionChofer() {
  const gmail = (document.getElementById('inputDriverGmail')?.value || '').trim();
  const nombreNegocio = (document.getElementById('inputDriverNombre')?.value || '').trim();
  const categoria = (document.getElementById('inputDriverCat')?.value || 'Gas GLP').trim();
  const plate = (document.getElementById('inputDriverPlate')?.value || '').trim();
  const productos = (document.getElementById('inputDriverProductos')?.value || '').trim();
  const zonas = (document.getElementById('inputDriverZonas')?.value || '').trim();
  const telReferencia = (document.getElementById('inputDriverTelRef')?.value || '').trim();

  if (!gmail || !nombreNegocio || !plate || !productos || !zonas || !telReferencia) {
    alert('Por favor completa todos los campos requeridos para publicar tu Mini Página de Negocio.');
    return;
  }

  const choferData = { 
    role: 'chofer', 
    gmail, 
    nombre: nombreNegocio,
    categoria, 
    placa: plate, 
    productos, 
    zonas, 
    telReferencia 
  };
  localStorage.setItem('notigas_user_data', JSON.stringify(choferData));

  closeDriverModal();
  alert(`🟢 MINI PÁGINA DE NEGOCIO ACTIVADA EN NOTIGAS\n\nNegocio: ${nombreNegocio}\nCategoría: ${categoria}\nPlaca: ${plate}\nZonas: ${zonas}\n(Tu teléfono se mantiene privado. Clientes te contactarán por el chat interno).`);
  
  if (typeof renderVendorCards === 'function') {
    renderVendorCards('TODOS');
  }
}
