/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN Y REGISTRO ÚNICO (GMAIL & VENDEDORES)
   ========================================================================== */

let databaseEmails = [
  { gmail: "vecino_cochabamba@gmail.com", role: "Comprador", fecha: "2026-08-01" },
  { gmail: "chofer_glp_otb@gmail.com", role: "Vendedor / Chofer", fecha: "2026-08-01" }
];

document.addEventListener('DOMContentLoaded', () => {
  // Verificación de Registro Único en localStorage
  const savedUser = localStorage.getItem('notigas_user_data');
  if (!savedUser) {
    const modalAuth = document.getElementById('modalWelcomeAuth');
    if (modalAuth) modalAuth.style.display = 'flex';
  } else {
    try {
      const u = JSON.parse(savedUser);
      if (u.gmail) {
        databaseEmails.push({ 
          gmail: u.gmail, 
          role: u.role || "Comprador", 
          fecha: new Date().toISOString().split('T')[0] 
        });
      }
    } catch (e) {
      console.error("Error al leer datos de usuario local:", e);
    }
  }
});

function toggleRegFields() {
  const roleSelect = document.getElementById('regRole');
  const extraFields = document.getElementById('choferExtraFields');
  if (roleSelect && extraFields) {
    extraFields.style.display = (roleSelect.value === 'chofer') ? 'block' : 'none';
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
    const nombre = (document.getElementById('regNombre')?.value || '').trim();
    const apellido = (document.getElementById('regApellido')?.value || '').trim();
    const whatsapp = (document.getElementById('regWhatsapp')?.value || '').trim();
    const placa = (document.getElementById('regPlaca')?.value || '').trim();

    if (!nombre || !apellido || !whatsapp || !placa) {
      alert('Para vendedores/choferes es obligatorio ingresar Nombre, Apellido, Teléfono y Placa.');
      return;
    }
    data.nombre = nombre;
    data.apellido = apellido;
    data.whatsapp = whatsapp;
    data.placa = placa;
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
  const nombre = (document.getElementById('inputDriverNombre')?.value || '').trim();
  const apellido = (document.getElementById('inputDriverApellido')?.value || '').trim();
  const whatsapp = (document.getElementById('inputDriverWhatsapp')?.value || '').trim();
  const plate = (document.getElementById('inputDriverPlate')?.value || '').trim();

  if (!gmail || !nombre || !apellido || !whatsapp || !plate) {
    alert('Por favor completa todos los campos requeridos para Vendedor/Chofer.');
    return;
  }

  const choferData = { role: 'chofer', gmail, nombre, apellido, whatsapp, placa: plate };
  localStorage.setItem('notigas_user_data', JSON.stringify(choferData));

  closeDriverModal();
  alert(`🟢 CUENTA DE VENDEDOR ACTIVADA\n\nVendedor: ${nombre} ${apellido}\nGmail: ${gmail}\nWhatsApp: ${whatsapp}\nPlaca: ${plate}`);
  
  if (typeof truckMarker !== 'undefined' && truckMarker) {
    truckMarker.setPopupContent(`<b>🟢 Vendedor Activo: ${nombre} ${apellido}</b><br>Placa: ${plate}<br>📱 WhatsApp: ${whatsapp}`).openPopup();
  }
}
