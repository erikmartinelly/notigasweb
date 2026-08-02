/* ==========================================================================
   NOTIGAS - MÓDULO PRINCIPAL DE NAVEGACIÓN Y CONTROLADOR DE LA APLICACIÓN
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenAdmin = document.getElementById('btnOpenAdmin');
  const btnOpenDriver = document.getElementById('btnOpenDriver');
  const modalAdmin = document.getElementById('modalAdmin');
  const modalDriver = document.getElementById('modalDriver');

  if (btnOpenAdmin && modalAdmin) {
    btnOpenAdmin.addEventListener('click', () => modalAdmin.style.display = 'flex');
  }

  if (btnOpenDriver && modalDriver) {
    btnOpenDriver.addEventListener('click', () => modalDriver.style.display = 'flex');
  }
});

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
  
  closePedidoModal();
  alert(`📦 PEDIDO EN VIVO REGISTRADO\n\nCategoría: ${cat}\nDetalle: ${cant}\n📍 Ubicación de Entrega: Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}\n\nEl vendedor en ruta ha recibido tu ubicación de entrega en el mapa.`);
}

function notificarEscucheCamion() {
  if (typeof userMarker === 'undefined' || !userMarker) return;
  const pos = userMarker.getLatLng();
  alert(`🔔 ¡GRACIAS VECINO!\n\nSe ha emitido tu aviso voluntario de que el camión de gas está pasando cerca (radio ~20m).`);
}

function lanzarEspecialEsperame() {
  if (typeof userMarker === 'undefined' || !userMarker) return;
  const pos = userMarker.getLatLng();
  alert(`🛑 AVISO DE PÁNICO "ESPÉRAME" ENVIADO AL CAMIÓN DE GLP CERCANO.\n📍 Ubicación Exacta: Lat ${pos.lat.toFixed(5)}, Lng ${pos.lng.toFixed(5)}`);
}
