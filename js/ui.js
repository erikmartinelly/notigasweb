/* UI UTILITIES */
window.addEventListener('error', (event) => {
  console.error('[Error Global]', event.message, event.filename, event.lineno);
  // Solo mostrar toast si el error viene de archivos de la app
  if (event.filename && (event.filename.includes('notigas') || event.filename.includes('localhost'))) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Error: ' + event.filename.split('/').pop(), event.message, 'warning', 8000);
    }
  }
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Promesa sin manejar]', event.reason);
  // Suprimir errores de red (comunes con GPS y APIs externas)
  const msg = event.reason?.message || event.reason || 'Desconocido';
  if (typeof msg === 'string' && !msg.includes('fetch') && !msg.includes('NetworkError') && !msg.includes('AbortError')) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Promesa: Error', msg, 'warning', 8000);
    }
  }
});
window.showLoadingOverlay = function(message = "Procesando...") {
  const overlay = document.getElementById('globalLoadingOverlay');
  const msgEl = document.getElementById('globalLoadingMessage');
  const btn = document.getElementById('globalLoadingCancelBtn');

  if (overlay && msgEl && btn) {
    msgEl.innerText = message;
    btn.style.display = 'none';
    overlay.style.display = 'flex';

    clearTimeout(window.globalLoadingTimeout);
    clearTimeout(window.globalLoadingAutoDismiss);

    // Botón de escape rápido tras 3.5 segundos
    window.globalLoadingTimeout = setTimeout(() => {
      msgEl.innerText = "La conexión está tardando más de lo normal...";
      btn.style.display = 'inline-flex';
    }, 3500);

    // Descarte automático de seguridad a los 6 segundos para NUNCA colgar la app
    window.globalLoadingAutoDismiss = setTimeout(() => {
      window.hideLoadingOverlay();
    }, 6000);
  }
};
window.hideLoadingOverlay = function() {
  const overlay = document.getElementById('globalLoadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    clearTimeout(window.globalLoadingTimeout);
    clearTimeout(window.globalLoadingAutoDismiss);
  }
};
function showToast(title, message, type = 'info', durationMs = 1000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `notigas-toast toast-${type}`;
  toast.style.position = 'relative';
  toast.style.overflow = 'hidden';
  toast.style.setProperty('--toast-duration', `${durationMs}ms`);

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', order: '📦' };

  toast.innerHTML = `
    <span class="toast-icon"></span>
    <div class="toast-body">
      <span class="toast-title"></span>
      <span class="toast-msg"></span>
    </div>
    <button class="toast-close" aria-label="Cerrar">&times;</button>
    <div class="toast-progress"></div>
  `;
  toast.querySelector('.toast-icon').textContent = icons[type] || 'ℹ️';
  toast.querySelector('.toast-title').textContent = String(title || 'Notificación');
  toast.querySelector('.toast-msg').textContent = String(message || '');

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn.addEventListener('click', dismiss);
  toast.addEventListener('click', (e) => { if (e.target !== closeBtn) dismiss(); });

  container.appendChild(toast);

  // Auto-cierre
  setTimeout(dismiss, durationMs);
}
function showConfirmModal(icon, title, text, acceptLabel, acceptCallback) {
  const overlay = document.getElementById('confirmModalOverlay');
  if (!overlay) { if (confirm(text)) { acceptCallback(); } return; }

  document.getElementById('confirmModalIcon').textContent = icon;
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalText').textContent = text;

  const btnAccept = document.getElementById('confirmModalAccept');
  const btnCancel = document.getElementById('confirmModalCancel');

  btnAccept.textContent = acceptLabel || 'Confirmar';

  // Limpiar listeners previos
  const newAccept = btnAccept.cloneNode(true);
  const newCancel = btnCancel.cloneNode(true);
  btnAccept.parentNode.replaceChild(newAccept, btnAccept);
  btnCancel.parentNode.replaceChild(newCancel, btnCancel);

  overlay.style.display = 'flex';

  newAccept.addEventListener('click', () => {
    overlay.style.display = 'none';
    acceptCallback();
  });

  newCancel.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  }, { once: true });
}
function mostrarPopupAlertaRepartidor(titulo, mensaje) {
  const popup = document.getElementById('driverAlertPopup');
  if (!popup) return;

  const heading = document.createElement('strong');
  const detail = document.createElement('span');
  heading.textContent = String(titulo || 'Alerta NOTIGAS');
  detail.textContent = String(mensaje || '');
  popup.replaceChildren(heading, document.createElement('br'), detail);
  popup.style.display = 'block';

  setTimeout(() => {
    if (popup) popup.style.display = 'none';
  }, 7000);
}
window.mostrarNotificacion = function(tipo, mensaje, duracion = 3000) {
    if (typeof showToast === 'function') {
        showToast(tipo, mensaje, tipo, duracion);
    } else {
        console.log(`[${tipo.toUpperCase()}] ${mensaje}`);
    }
};
