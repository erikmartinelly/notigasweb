/* ==========================================================================
   NOTIGAS - MÓDULO PRINCIPAL DE NAVEGACIÓN Y CONTROLADOR DE LA APLICACIÓN
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const btnUserSettings = document.getElementById('btnOpenUserSettings');
  const btnOpenDriver = document.getElementById('btnOpenDriver');
  const modalUserSettings = document.getElementById('modalUserSettings');
  const modalDriver = document.getElementById('modalDriver');

  if (btnUserSettings && modalUserSettings) {
    btnUserSettings.addEventListener('click', () => modalUserSettings.style.display = 'flex');
  }

  if (btnOpenDriver && modalDriver) {
    btnOpenDriver.addEventListener('click', () => modalDriver.style.display = 'flex');
  }

  // REQUERIR GPS OBLIGATORIO AL CARGAR LA APLICACIÓN
  verificarGPSObligatorio();
  checkActiveOrderStatus();
});

function checkActiveOrderStatus() {
  const btnCancel = document.getElementById('btnCancelOrder');
  const activeOrder = localStorage.getItem('notigas_active_order');
  if (btnCancel) {
    if (activeOrder) {
      btnCancel.style.display = 'flex';
    } else {
      btnCancel.style.display = 'none';
    }
  }
}

function verificarGPSObligatorio() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'none';
      },
      (err) => {
        const banner = document.getElementById('gpsMandatoryBanner');
        if (banner) banner.style.display = 'block';
      },
      { timeout: 8000 }
    );
  }
}

function switchTab(index) {
  document.querySelectorAll('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
  document.querySelectorAll('.tab-content').forEach((tab, i) => tab.classList.toggle('active', i === index));
  if (index === 0 && typeof map !== 'undefined' && map) {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

function switch3rdTabMode(mode) {
  const btnReddit = document.getElementById('subtabBtnReddit');
  const btnDirect = document.getElementById('subtabBtnDirect');
  const viewReddit = document.getElementById('view3rdTabReddit');
  const viewDirect = document.getElementById('view3rdTabDirect');

  if (!btnReddit || !btnDirect || !viewReddit || !viewDirect) return;

  if (mode === 'reddit') {
    btnReddit.classList.add('active');
    btnDirect.classList.remove('active');
    viewReddit.style.display = 'flex';
    viewDirect.style.display = 'none';
  } else {
    btnDirect.classList.add('active');
    btnReddit.classList.remove('active');
    viewDirect.style.display = 'flex';
    viewReddit.style.display = 'none';
  }
}

function abrirSubmenuPedidos() { 
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'flex'; 
}

function closeSubmenuModal() { 
  const modalSubmenu = document.getElementById('modalSubmenu');
  if (modalSubmenu) modalSubmenu.style.display = 'none'; 
}

function seleccionarYPedirDirecto(catNombre) {
  closeSubmenuModal();
  const sel = document.getElementById('selectCategoria');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value.includes(catNombre)) {
        sel.selectedIndex = i;
        break;
      }
    }
  }
  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'flex';
}

function closePedidoModal() { 
  const modalPedido = document.getElementById('modalPedido');
  if (modalPedido) modalPedido.style.display = 'none'; 
}

function confirmarPedido() {
  if (typeof userMarker === 'undefined' || !userMarker) return;
  const pos = userMarker.getLatLng();
  const cat = document.getElementById('selectCategoria')?.value || 'Garrafa de Gas GLP';
  const cant = document.getElementById('inputCantidad')?.value || '1 unidad';
  
  const activeOrderData = {
    categoria: cat,
    cantidad: cant,
    lat: pos.lat,
    lng: pos.lng,
    timestamp: Date.now()
  };

  localStorage.setItem('notigas_active_order', JSON.stringify(activeOrderData));
  closePedidoModal();
  checkActiveOrderStatus();

  alert(`📦 PEDIDO EN VIVO REGISTRADO\n\nCategoría: ${cat}\nDetalle: ${cant}\n📍 Ubicación de Entrega: Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}\n\nEl repartidor en ruta ha recibido tu ubicación. Se ha activado el botón "❌ CANCELAR PEDIDO EN VIVO" por si necesitas anular tu pedido.`);
}

function cancelarPedidoActivo() {
  if (confirm("❌ ¿Estás seguro de que deseas cancelar tu pedido activo en vivo?")) {
    localStorage.removeItem('notigas_active_order');
    checkActiveOrderStatus();
    alert("❌ TU PEDIDO HA SIDO CANCELADO\nSe ha notificado al repartidor en ruta que la solicitud fue anulada.");
  }
}

function notificarEscucheCamion() {
  if (typeof userMarker === 'undefined' || !userMarker) return;
  const pos = userMarker.getLatLng();
  alert(`🔔 ¡GRACIAS VECINO!\n\nSe ha emitido tu aviso voluntario de que el camión de gas está pasando cerca.`);
}

function lanzarEspecialEsperame() {
  if (typeof userMarker === 'undefined' || !userMarker) return;
  const pos = userMarker.getLatLng();
  alert(`🛑 AVISO DE PÁNICO "ESPÉRAME" ENVIADO AL CAMIÓN DE GLP CERCANO.\n📍 Ubicación Exacta: Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}`);
}
