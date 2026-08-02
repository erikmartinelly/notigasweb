/* ==========================================================================
   NOTIGAS - MÓDULO DE ADMINISTRACIÓN & EXPORTACIÓN CSV
   ========================================================================== */

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
  alert('Anuncio publicitario actualizado con éxito en todas las secciones.');
}

function guardarAdminConfig() {
  const inputGmail = document.getElementById('inputGmail');
  if (!inputGmail) return;

  const gmail = inputGmail.value.trim();
  if (gmail) {
    closeAdminModal();
    alert(`Sesión de Administrador iniciada como (${gmail}).`);
  } else {
    alert('Por favor ingresa tu correo Gmail de Administrador.');
  }
}

function descargarListaCorreosCSV() {
  if (typeof databaseEmails === 'undefined' || !databaseEmails) return;

  let csvContent = "data:text/csv;charset=utf-8,Email,Rol,Fecha\n";
  databaseEmails.forEach(item => {
    csvContent += `${item.gmail},${item.role},${item.fecha}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "lista_correos_notigas.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert("📥 LISTA DE CORREOS DESCARGADA EN FORMATO .CSV");
}
