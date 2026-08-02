/* ==========================================================================
   NOTIGAS - MÓDULO DE AUTENTICACIÓN Y REGISTRO ÚNICO (GMAIL & REPARTIDORES)
   ========================================================================== */

let databaseEmails = [
  { gmail: "vecino_cochabamba@gmail.com", role: "Comprador", fecha: "2026-08-01" },
  { gmail: "repartidor_glp_otb@gmail.com", role: "Repartidor / Chofer", fecha: "2026-08-01" }
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
    const placa = (document.getElementById('regPlaca')?.value || '').trim();
    const telReferencia = (document.getElementById('regTelReferencia')?.value || '').trim();

    if (!placa || !telReferencia) {
      alert('Para repartidores es obligatorio ingresar el Número de Placa y un Teléfono de Referencia privado.');
      return;
    }
    data.placa = placa;
    data.telReferencia = telReferencia; // Teléfono privado de referencia interna
  } else {
    const nombre = (document.getElementById('regNombre')?.value || '').trim();
    const apellido = (document.getElementById('regApellido')?.value || '').trim();

    if (!nombre || !apellido) {
      alert('Para compradores es obligatorio ingresar Nombre y Apellido.');
      return;
    }
    data.nombre = nombre;
    data.apellido = apellido;
  }

  localStorage.setItem('notigas_user_data', JSON.stringify(data));
  databaseEmails.push({ gmail: gmail, role: role, fecha: new Date().toISOString().split('T')[0] });

  const modalAuth = document.getElementById('modalWelcomeAuth');
  if (modalAuth) modalAuth.style.display = 'none';

  alert(`✅ REGISTRO REGISTRADO EN EL SISTEMA\n\nBienvenido a NOTIGAS (${gmail}).`);
}

function closeDriverModal() { 
  const modalDriver = document.getElementById('modalDriver');
  if (modalDriver) modalDriver.style.display = 'none'; 
}

function iniciarSesionChofer() {
  const gmail = (document.getElementById('inputDriverGmail')?.value || '').trim();
  const plate = (document.getElementById('inputDriverPlate')?.value || '').trim();
  const telReferencia = (document.getElementById('inputDriverTelRef')?.value || '').trim();

  if (!gmail || !plate || !telReferencia) {
    alert('Por favor ingresa tu Correo Gmail, Número de Placa y Teléfono de Referencia privado.');
    return;
  }

  const choferData = { role: 'chofer', gmail, placa: plate, telReferencia: telReferencia };
  localStorage.setItem('notigas_user_data', JSON.stringify(choferData));

  closeDriverModal();
  alert(`🟢 CUENTA DE REPARTIDOR ACTIVADA\n\nRepartidor Placa: ${plate}\nGmail: ${gmail}\n(El teléfono de referencia se mantiene privado en el sistema).`);
  
  if (typeof truckMarker !== 'undefined' && truckMarker) {
    truckMarker.setPopupContent(`<b>🟢 Repartidor Activo (Placa: ${plate})</b><br><small>Comunicación por chat interno de NOTIGAS</small>`).openPopup();
  }
}
