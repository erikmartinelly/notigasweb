/* ==========================================================================
   NOTIGAS - MÓDULO DE ADMINISTRACIÓN & EXPORTACIÓN CSV DE USUARIOS
   ========================================================================== */

const AUTHORIZED_ADMIN_EMAILS = [
  "erikmartinelly@gmail.com",
  "leonmartinelly13@gmail.com"
];

function closeAdminModal() { 
  const modalAdmin = document.getElementById('modalAdmin');
  if (modalAdmin) modalAdmin.style.display = 'none'; 
}

function switchModalTab(idx) {
  document.querySelectorAll('.modal-tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
  document.querySelectorAll('.modal-tab-pane').forEach((pane, i) => pane.classList.toggle('active', i === idx));
}

function guardarSubmenuAnuncios() {
  const inputAd = document.getElementById('inputAdText');
  if (!inputAd) return;

  const text = inputAd.value.trim();
  if (typeof actualizarAnunciosEnVivo === 'function') {
    actualizarAnunciosEnVivo(text);
  }

  closeAdminModal();
  alert('📢 Anuncio publicitario actualizado con éxito en todas las secciones.');
}

function guardarAdminConfig() {
  const inputGmail = document.getElementById('inputGmail');
  if (!inputGmail) return;

  const gmail = inputGmail.value.trim().toLowerCase();
  if (!gmail) {
    alert('Por favor ingresa tu correo Gmail de Administrador.');
    return;
  }

  if (!AUTHORIZED_ADMIN_EMAILS.includes(gmail)) {
    alert(`⛔ ACCESO DENEGADO\n\nLa cuenta (${gmail}) no cuenta con permisos de administración en NOTIGAS.\nCuentas habilitadas: erikmartinelly@gmail.com y leonmartinelly13@gmail.com`);
    return;
  }

  sessionStorage.setItem('notigas_admin_session', gmail);
  alert(`🔐 ACCESO DE ADMINISTRADOR CONCEDIDO\n\nBienvenido Administrador (${gmail}). Tienes acceso total a la gestión de anuncios y exportación de listas CSV.`);
}

/* DESCARGA COMPLETA DE CORREOS ELECTRONICOS REGISTRADOS (.CSV DE USUARIOS) */
function descargarListaCorreosCSV() {
  const currentAdmin = sessionStorage.getItem('notigas_admin_session');
  
  if (!currentAdmin || !AUTHORIZED_ADMIN_EMAILS.includes(currentAdmin.toLowerCase())) {
    const promptGmail = prompt("🔐 Acceso Administrador Requerido:\nPor favor ingresa tu correo Gmail habilitado de Administrador:");
    if (!promptGmail || !AUTHORIZED_ADMIN_EMAILS.includes(promptGmail.trim().toLowerCase())) {
      alert("⛔ ACCESO DENEGADO\nSolo las cuentas erikmartinelly@gmail.com y leonmartinelly13@gmail.com pueden descargar la lista de usuarios.");
      return;
    }
    sessionStorage.setItem('notigas_admin_session', promptGmail.trim().toLowerCase());
  }

  let emailsList = [];

  // 1. Cargar base por defecto
  if (typeof databaseEmails !== 'undefined' && Array.isArray(databaseEmails)) {
    emailsList = [...databaseEmails];
  }

  // 2. Agregar cuentas administradoras autorizadas
  AUTHORIZED_ADMIN_EMAILS.forEach(email => {
    emailsList.push({
      gmail: email,
      role: 'Administrador',
      fecha: new Date().toISOString().split('T')[0]
    });
  });

  // 3. Cargar usuario registrado en localStorage
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.gmail) {
        emailsList.push({
          gmail: u.gmail,
          role: u.role === 'chofer' ? 'Repartidor' : 'Cliente',
          fecha: new Date().toISOString().split('T')[0]
        });
      }
    }
  } catch(e){}

  // 4. Eliminar duplicados por Gmail
  const uniqueEmailsMap = new Map();
  emailsList.forEach(item => {
    if (item.gmail && !uniqueEmailsMap.has(item.gmail.toLowerCase())) {
      uniqueEmailsMap.set(item.gmail.toLowerCase(), item);
    }
  });

  const finalEmails = Array.from(uniqueEmailsMap.values());

  if (finalEmails.length === 0) {
    alert('No hay correos electrónicos de usuarios registrados aún.');
    return;
  }

  // Generar contenido CSV con BOM UTF-8 para apertura directa en Microsoft Excel
  let csvRows = ["Email,Rol,Fecha Registro"];
  finalEmails.forEach(item => {
    csvRows.push(`"${item.gmail}","${item.role || 'Cliente'}","${item.fecha || new Date().toISOString().split('T')[0]}"`);
  });

  const csvString = "\uFEFF" + csvRows.join("\n");
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `lista_usuarios_notigas_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert(`📥 DESCARGA COMPLETADA EN FORMATO .CSV\n\nSe exportaron ${finalEmails.length} correos electrónicos de usuarios para campañas de Email Marketing.`);
}
