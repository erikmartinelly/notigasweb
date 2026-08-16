/* Eventos generados automáticamente para reemplazar eventos inline */

// Declaraciones de funciones globales inmediatas
window.abrirModalReglasApp = function() {
  const modal = document.getElementById('modalAppRules');
  if (modal) modal.style.display = 'flex';
};

window.closeRulesModal = function() {
  const modal = document.getElementById('modalAppRules');
  if (modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
  try {
    const safeCall = (fnName, ...args) => {
      if (typeof window[fnName] === 'function') {
        return window[fnName](...args);
      }
      try {
        if (typeof eval(fnName) === 'function') {
          return eval(fnName)(...args);
        }
      } catch (err) {}
    };

    const el_auto_event_1 = document.getElementById('auto-event-1');
    if (el_auto_event_1) el_auto_event_1.addEventListener('click', () => { safeCall('conectarGPSAuto'); });

    const el_auto_event_2 = document.getElementById('auto-event-2');
    if (el_auto_event_2) el_auto_event_2.addEventListener('click', () => {
      const banner = document.getElementById('gpsMandatoryBanner');
      if (banner) banner.style.display = 'none';
    });

    const el_btnOpenUserSettings = document.getElementById('btnOpenUserSettings');
    if (el_btnOpenUserSettings) el_btnOpenUserSettings.addEventListener('click', () => { safeCall('abrirConfiguracionSegunRol'); });

    const el_auto_event_3 = document.getElementById('auto-event-3');
    if (el_auto_event_3) el_auto_event_3.addEventListener('click', () => { safeCall('switchTab', 0); });

    const el_auto_event_4 = document.getElementById('auto-event-4');
    if (el_auto_event_4) el_auto_event_4.addEventListener('click', () => { safeCall('switchTab', 1); });

    const el_auto_event_5 = document.getElementById('auto-event-5');
    if (el_auto_event_5) el_auto_event_5.addEventListener('click', () => { safeCall('switchTab', 2); });

    const el_auto_event_6 = document.getElementById('auto-event-6');
    if (el_auto_event_6) el_auto_event_6.addEventListener('click', () => { safeCall('conectarGPSAuto', true); });

    const el_selectCiudadCapital = document.getElementById('selectCiudadCapital');
    if (el_selectCiudadCapital) el_selectCiudadCapital.addEventListener('change', (event) => {
      safeCall('cambiarCiudadCapital', event.target.value);
    });

    const el_selectDriverModalCity = document.getElementById('selectDriverModalCity');
    if (el_selectDriverModalCity) el_selectDriverModalCity.addEventListener('change', (event) => {
      safeCall('cambiarCiudadCapital', event.target.value);
    });

    const el_btnCancelOrder = document.getElementById('btnCancelOrder');
    if (el_btnCancelOrder) el_btnCancelOrder.addEventListener('click', () => { safeCall('cancelarPedidoActivo'); });

    const el_btnMainOrder = document.getElementById('btnMainOrder');
    if (el_btnMainOrder) el_btnMainOrder.addEventListener('click', () => { safeCall('abrirSubmenuPedidos'); });

    const el_auto_event_7 = document.getElementById('auto-event-7');
    if (el_auto_event_7) el_auto_event_7.addEventListener('click', () => { safeCall('lanzarEspecialEsperame'); });

    const el_auto_event_8 = document.getElementById('auto-event-8');
    if (el_auto_event_8) el_auto_event_8.addEventListener('click', () => { safeCall('notificarEscucheCamion'); });

    const el_auto_event_9 = document.getElementById('auto-event-9');
    if (el_auto_event_9) el_auto_event_9.addEventListener('click', () => { safeCall('conectarGPSAuto', true); });

    const el_btnDriverMyLocation = document.getElementById('btnDriverMyLocation');
    if (el_btnDriverMyLocation) el_btnDriverMyLocation.addEventListener('click', () => { safeCall('activarMiUbicacionRepartidor'); });

    const el_btnDriverFollowMe = document.getElementById('btnDriverFollowMe');
    if (el_btnDriverFollowMe) el_btnDriverFollowMe.addEventListener('click', () => { safeCall('activarSeguirme'); });

    const el_btnDriverPause = document.getElementById('btnDriverPause');
    if (el_btnDriverPause) el_btnDriverPause.addEventListener('click', () => { safeCall('pausarRecorridoRepartidor'); });

    const el_auto_event_10 = document.getElementById('auto-event-10');
    if (el_auto_event_10) el_auto_event_10.addEventListener('click', () => { safeCall('abrirModalDriverOrders'); });

    const el_auto_event_12 = document.getElementById('auto-event-12');
    if (el_auto_event_12) el_auto_event_12.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'TODOS', e.currentTarget); });

    const el_auto_event_13 = document.getElementById('auto-event-13');
    if (el_auto_event_13) el_auto_event_13.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Gas GLP', e.currentTarget); });

    const el_auto_event_14 = document.getElementById('auto-event-14');
    if (el_auto_event_14) el_auto_event_14.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Agua 20L', e.currentTarget); });

    const el_auto_event_15 = document.getElementById('auto-event-15');
    if (el_auto_event_15) el_auto_event_15.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Chatarra', e.currentTarget); });

    const el_auto_event_16 = document.getElementById('auto-event-16');
    if (el_auto_event_16) el_auto_event_16.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Papel', e.currentTarget); });

    const el_auto_event_17 = document.getElementById('auto-event-17');
    if (el_auto_event_17) el_auto_event_17.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Frutas', e.currentTarget); });

    const el_auto_event_18 = document.getElementById('auto-event-18');
    if (el_auto_event_18) el_auto_event_18.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Detergentes', e.currentTarget); });

    const el_auto_event_19 = document.getElementById('auto-event-19');
    if (el_auto_event_19) el_auto_event_19.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Carbón', e.currentTarget); });

    const el_auto_event_20 = document.getElementById('auto-event-20');
    if (el_auto_event_20) el_auto_event_20.addEventListener('click', (e) => { safeCall('filterVendorCategory', 'Otros', e.currentTarget); });

    const el_auto_event_21 = document.getElementById('auto-event-21');
    if (el_auto_event_21) el_auto_event_21.addEventListener('click', () => { safeCall('abrirModalNuevoPost'); });

    const el_localAdContent = document.getElementById('localAdContent');
    if (el_localAdContent) el_localAdContent.addEventListener('click', () => { safeCall('abrirAnuncioWhatsApp'); });

    const el_auto_event_22 = document.getElementById('auto-event-22');
    if (el_auto_event_22) el_auto_event_22.addEventListener('click', () => { safeCall('closeUserSettingsModal'); });

    const el_auto_event_23 = document.getElementById('auto-event-23');
    if (el_auto_event_23) el_auto_event_23.addEventListener('click', () => { safeCall('guardarPrefUsuario'); });

    const el_auto_event_24 = document.getElementById('auto-event-24');
    if (el_auto_event_24) el_auto_event_24.addEventListener('click', () => { safeCall('guardarPrefUsuario'); });

    const el_auto_event_25 = document.getElementById('auto-event-25');
    if (el_auto_event_25) el_auto_event_25.addEventListener('click', () => {
      safeCall('closeUserSettingsModal');
      safeCall('abrirFichaRepartidorEdicion');
    });

    const el_auto_event_26 = document.getElementById('auto-event-26');
    if (el_auto_event_26) el_auto_event_26.addEventListener('click', () => { safeCall('cerrarSesionUsuario'); });

    const el_btnAdminAccessQuick = document.getElementById('btnAdminAccessQuick');
    if (el_btnAdminAccessQuick) el_btnAdminAccessQuick.addEventListener('click', () => { safeCall('abrirModalAdminDashboard'); });

    const el_auto_event_27 = document.getElementById('auto-event-27');
    if (el_auto_event_27) el_auto_event_27.addEventListener('click', () => { safeCall('cerrarSesionUsuario'); });

    const el_auto_event_28 = document.getElementById('auto-event-28');
    if (el_auto_event_28) el_auto_event_28.addEventListener('click', () => { safeCall('eliminarMiCuentaCompleta'); });

    const el_auto_event_29 = document.getElementById('auto-event-29');
    if (el_auto_event_29) el_auto_event_29.addEventListener('click', () => { safeCall('closeDriverModal'); });

    const el_auto_event_30 = document.getElementById('auto-event-30');
    if (el_auto_event_30) el_auto_event_30.addEventListener('click', () => { safeCall('iniciarSesionRepartidor'); });

    const el_auto_event_31 = document.getElementById('auto-event-31');
    if (el_auto_event_31) el_auto_event_31.addEventListener('click', () => {
      safeCall('setAuthAction', 'login');
      safeCall('showAuthStep', 2);
    });

    const el_auto_event_32 = document.getElementById('auto-event-32');
    if (el_auto_event_32) el_auto_event_32.addEventListener('click', () => {
      safeCall('setAuthAction', 'register');
      safeCall('showAuthStep', 2);
    });

    const el_btnAuthMethodEmail = document.getElementById('btnAuthMethodEmail');
    if (el_btnAuthMethodEmail) el_btnAuthMethodEmail.addEventListener('click', () => { safeCall('selectAuthMethod', 'email'); });

    const el_btnAuthMethodGoogle = document.getElementById('btnAuthMethodGoogle');
    if (el_btnAuthMethodGoogle) el_btnAuthMethodGoogle.addEventListener('click', () => { safeCall('selectAuthMethod', 'google'); });

    const el_btnEmailAction = document.getElementById('btnEmailAction');
    if (el_btnEmailAction) el_btnEmailAction.addEventListener('click', () => { safeCall('procesarAccionEmail'); });

    const el_auto_event_33 = document.getElementById('auto-event-33');
    if (el_auto_event_33) el_auto_event_33.addEventListener('click', () => { safeCall('showAuthStep', 1); });

    const el_auto_event_34 = document.getElementById('auto-event-34');
    if (el_auto_event_34) el_auto_event_34.addEventListener('click', () => { safeCall('finalizeRoleSelection', 'vecino'); });

    const el_auto_event_35 = document.getElementById('auto-event-35');
    if (el_auto_event_35) el_auto_event_35.addEventListener('click', () => { safeCall('finalizeRoleSelection', 'repartidor'); });

    const el_auto_event_36 = document.getElementById('auto-event-36');
    if (el_auto_event_36) el_auto_event_36.addEventListener('click', () => { safeCall('closeReportModal'); });

    const el_auto_event_37 = document.getElementById('auto-event-37');
    if (el_auto_event_37) el_auto_event_37.addEventListener('click', () => { safeCall('enviarDenuncia'); });

    const el_auto_event_38 = document.getElementById('auto-event-38');
    if (el_auto_event_38) el_auto_event_38.addEventListener('click', () => { safeCall('closeSubmenuModal'); });

    const el_auto_event_39 = document.getElementById('auto-event-39');
    if (el_auto_event_39) el_auto_event_39.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'gas'); });

    const el_auto_event_40 = document.getElementById('auto-event-40');
    if (el_auto_event_40) el_auto_event_40.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'agua'); });

    const el_auto_event_41 = document.getElementById('auto-event-41');
    if (el_auto_event_41) el_auto_event_41.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'chatarra'); });

    const el_auto_event_42 = document.getElementById('auto-event-42');
    if (el_auto_event_42) el_auto_event_42.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'papel'); });

    const el_auto_event_43 = document.getElementById('auto-event-43');
    if (el_auto_event_43) el_auto_event_43.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'frutas'); });

    const el_auto_event_44 = document.getElementById('auto-event-44');
    if (el_auto_event_44) el_auto_event_44.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'detergentes'); });

    const el_auto_event_45 = document.getElementById('auto-event-45');
    if (el_auto_event_45) el_auto_event_45.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'otros'); });

    const el_auto_event_46 = document.getElementById('auto-event-46');
    if (el_auto_event_46) el_auto_event_46.addEventListener('click', () => { safeCall('seleccionarYPedirDirecto', 'otros'); });

    const el_auto_event_47 = document.getElementById('auto-event-47');
    if (el_auto_event_47) el_auto_event_47.addEventListener('click', () => { safeCall('closePedidoModal'); });

    const el_selectCategoria = document.getElementById('selectCategoria');
    if (el_selectCategoria) el_selectCategoria.addEventListener('change', (event) => {
      const groupOtros = document.getElementById('groupOrderOtros');
      if (groupOtros) {
        groupOtros.style.display = (event.target.value === 'otros') ? 'block' : 'none';
      }
    });

    const el_auto_event_48 = document.getElementById('auto-event-48');
    if (el_auto_event_48) el_auto_event_48.addEventListener('click', () => { safeCall('confirmarPedido'); });

    const el_auto_event_49 = document.getElementById('auto-event-49');
    if (el_auto_event_49) el_auto_event_49.addEventListener('click', () => { safeCall('closeDriverOrdersModal'); });

    const el_auto_event_50 = document.getElementById('auto-event-50');
    if (el_auto_event_50) el_auto_event_50.addEventListener('click', () => { safeCall('closeCommentsModal'); });

    const el_inputNewComment = document.getElementById('inputNewComment');
    if (el_inputNewComment) el_inputNewComment.addEventListener('keypress', (event) => {
      if (event.key === 'Enter') safeCall('agregarComentarioPost');
    });

    const el_auto_event_51 = document.getElementById('auto-event-51');
    if (el_auto_event_51) el_auto_event_51.addEventListener('click', () => { safeCall('agregarComentarioPost'); });

    const el_auto_event_52 = document.getElementById('auto-event-52');
    if (el_auto_event_52) el_auto_event_52.addEventListener('click', () => { safeCall('closeNuevoPostModal'); });

    const el_auto_event_53 = document.getElementById('auto-event-53');
    if (el_auto_event_53) el_auto_event_53.addEventListener('click', () => { safeCall('crearNuevoPost'); });

    const el_globalLoadingCancelBtn = document.getElementById('globalLoadingCancelBtn');
    if (el_globalLoadingCancelBtn) el_globalLoadingCancelBtn.addEventListener('click', () => { safeCall('hideLoadingOverlay'); });

    const el_btnCloseAppRules = document.getElementById('btnCloseAppRules');
    if (el_btnCloseAppRules) el_btnCloseAppRules.addEventListener('click', () => { window.closeRulesModal(); });

    const el_btnEntendidoReglas = document.getElementById('btnEntendidoReglas');
    if (el_btnEntendidoReglas) el_btnEntendidoReglas.addEventListener('click', () => { window.closeRulesModal(); });

    const el_auto_event_54 = document.getElementById('auto-event-54');
    if (el_auto_event_54) el_auto_event_54.addEventListener('click', () => { safeCall('closeAdminModal'); });

    const el_auto_event_55 = document.getElementById('auto-event-55');
    if (el_auto_event_55) el_auto_event_55.addEventListener('click', () => { safeCall('switchModalTab', 0); });

    const el_auto_event_56 = document.getElementById('auto-event-56');
    if (el_auto_event_56) el_auto_event_56.addEventListener('click', () => { safeCall('switchModalTab', 1); });

    const el_auto_event_57 = document.getElementById('auto-event-57');
    if (el_auto_event_57) el_auto_event_57.addEventListener('click', () => { safeCall('switchModalTab', 2); });

    const el_auto_event_58 = document.getElementById('auto-event-58');
    if (el_auto_event_58) el_auto_event_58.addEventListener('click', () => { safeCall('switchModalTab', 3); });

    const el_auto_event_59 = document.getElementById('auto-event-59');
    if (el_auto_event_59) el_auto_event_59.addEventListener('click', () => { safeCall('switchModalTab', 4); });

    const el_auto_event_60 = document.getElementById('auto-event-60');
    if (el_auto_event_60) el_auto_event_60.addEventListener('click', () => { safeCall('switchModalTab', 5); });

    const el_auto_event_61 = document.getElementById('auto-event-61');
    if (el_auto_event_61) el_auto_event_61.addEventListener('click', () => { safeCall('emitirAlertaOficialAdmin'); });

    const el_auto_event_62 = document.getElementById('auto-event-62');
    if (el_auto_event_62) el_auto_event_62.addEventListener('click', () => { safeCall('ejecutarPurgaBaseDeDatosManual'); });

    const el_auto_event_63 = document.getElementById('auto-event-63');
    if (el_auto_event_63) el_auto_event_63.addEventListener('click', () => { safeCall('restaurarBaseDatosPorDefecto'); });

    const el_auto_event_64 = document.getElementById('auto-event-64');
    if (el_auto_event_64) el_auto_event_64.addEventListener('click', () => { safeCall('activarMapaCalorAdminLive'); });

    const el_inputAdImageFile = document.getElementById('inputAdImageFile');
    if (el_inputAdImageFile) el_inputAdImageFile.addEventListener('change', (event) => { safeCall('previewUploadAdImage', event); });

    const el_auto_event_65 = document.getElementById('auto-event-65');
    if (el_auto_event_65) el_auto_event_65.addEventListener('click', () => { safeCall('eliminarImagenAnuncio'); });

    const el_auto_event_66 = document.getElementById('auto-event-66');
    if (el_auto_event_66) el_auto_event_66.addEventListener('click', () => { safeCall('guardarSubmenuAnuncios'); });

    const el_auto_event_67 = document.getElementById('auto-event-67');
    if (el_auto_event_67) el_auto_event_67.addEventListener('click', () => { safeCall('banearUsuarioAdmin'); });

    const el_auto_event_68 = document.getElementById('auto-event-68');
    if (el_auto_event_68) el_auto_event_68.addEventListener('click', () => { safeCall('descargarListaCorreosCSV'); });

    const el_auto_event_69 = document.getElementById('auto-event-69');
    if (el_auto_event_69) el_auto_event_69.addEventListener('click', () => { safeCall('descargarFichasRepartidoresCSV'); });

    const el_auto_event_70 = document.getElementById('auto-event-70');
    if (el_auto_event_70) el_auto_event_70.addEventListener('click', () => { safeCall('descargarEstadisticasGeneralesCSV'); });

    const el_auto_event_71 = document.getElementById('auto-event-71');
    if (el_auto_event_71) el_auto_event_71.addEventListener('click', () => { safeCall('cerrarSesionAdminControl'); });

    const el_btnVerMiPedidoTrip = document.getElementById('btnVerMiPedidoTrip');
    if (el_btnVerMiPedidoTrip) el_btnVerMiPedidoTrip.addEventListener('click', () => { safeCall('centrarMapaEnMiPedido'); });

    const el_btnCambiarCiudadPref = document.getElementById('btnCambiarCiudadPref');
    if (el_btnCambiarCiudadPref) el_btnCambiarCiudadPref.addEventListener('click', () => {
      safeCall('closeUserSettingsModal');
      const sel = document.getElementById('selectCiudadCapital');
      if (sel) {
        sel.focus();
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

  } catch (err) {
    console.error('Error inicializando eventos DOM:', err);
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');

  try {
    if (action === 'confirmarEntregaPedido') {
      const id = btn.getAttribute('data-id');
      if (typeof window.confirmarEntregaPedido === 'function') window.confirmarEntregaPedido(id);
    }
    else if (action === 'cancelarPedidoActivo') {
      if (typeof window.cancelarPedidoActivo === 'function') window.cancelarPedidoActivo();
      if (typeof window.cerrarPanoramicaPedidos === 'function') window.cerrarPanoramicaPedidos();
    }
    else if (action === 'cerrarPanoramicaPedidos') {
      if (typeof window.cerrarPanoramicaPedidos === 'function') window.cerrarPanoramicaPedidos();
    }
    else if (action === 'aceptarGrupoDemanda') {
      const cid = btn.getAttribute('data-cluster-id');
      const city = btn.getAttribute('data-ciudad');
      const cat = btn.getAttribute('data-categoria');
      if (typeof window.aceptarGrupoDemanda === 'function') window.aceptarGrupoDemanda(cid, city, cat);
    }
    else if (action === 'abrirSubmenuPedidos') {
      if (typeof window.abrirSubmenuPedidos === 'function') window.abrirSubmenuPedidos();
    }
    else if (action === 'abrirModalNuevoPost') {
      if (typeof window.abrirModalNuevoPost === 'function') window.abrirModalNuevoPost();
    }
    else if (action === 'votarPost') {
      const val = parseInt(btn.getAttribute('data-val') || '0', 10);
      const id = btn.getAttribute('data-id');
      if (typeof window.votarPost === 'function') window.votarPost(btn, val, id);
    }
    else if (action === 'abrirComentariosPost') {
      const id = btn.getAttribute('data-id');
      const title = decodeURIComponent(btn.getAttribute('data-title') || '');
      const desc = decodeURIComponent(btn.getAttribute('data-desc') || '');
      const cat = decodeURIComponent(btn.getAttribute('data-cat') || '');
      if (typeof window.abrirComentariosPost === 'function') window.abrirComentariosPost(id, title, desc, cat, btn);
    }
    else if (action === 'abrirModalDenuncia') {
      const title = decodeURIComponent(btn.getAttribute('data-title') || '');
      if (typeof window.abrirModalDenuncia === 'function') window.abrirModalDenuncia('Aviso Noticias Vecinales', title);
    }
    else if (action === 'borrarPostForumAdmin') {
      const id = btn.getAttribute('data-id');
      if (typeof window.borrarPostForumAdmin === 'function') window.borrarPostForumAdmin(id);
    }
    else if (action === 'abrirAnuncioWhatsApp') {
      if (typeof window.abrirAnuncioWhatsApp === 'function') window.abrirAnuncioWhatsApp();
    }
    else if (action === 'votarComentario') {
      const id = btn.getAttribute('data-id');
      const val = parseInt(btn.getAttribute('data-val') || '0', 10);
      if (typeof window.votarComentario === 'function') window.votarComentario(id, val);
    }
    else if (action === 'abrirModalDriver') {
      const modal = document.getElementById('modalDriver');
      if (modal) modal.style.display = 'flex';
    }
    else if (action === 'eliminarFichaAdmin') {
      const id = btn.getAttribute('data-id');
      if (typeof window.eliminarFichaAdmin === 'function') window.eliminarFichaAdmin(id);
    }
    else if (action === 'seleccionarYPedirDirecto') {
      const cat = decodeURIComponent(btn.getAttribute('data-cat') || '');
      if (typeof window.seleccionarYPedirDirecto === 'function') window.seleccionarYPedirDirecto(cat);
    }
    else if (action === 'centrarPedidoEnMapa') {
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      const id = btn.getAttribute('data-id');
      if (typeof window.centrarPedidoEnMapa === 'function') window.centrarPedidoEnMapa(lat, lng, id);
    }
    else if (action === 'abrirRutaGoogleMaps') {
      e.preventDefault();
      e.stopPropagation();
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      const id = btn.getAttribute('data-id');
      const address = btn.getAttribute('data-address') || '';
      if (typeof window.abrirRutaGoogleMaps === 'function') {
        window.abrirRutaGoogleMaps(lat, lng, id, address);
      }
    }
    else if (action === 'borrarAnuncioLocalAdmin') {
      const id = btn.getAttribute('data-id');
      if (typeof window.borrarAnuncioLocalAdmin === 'function') window.borrarAnuncioLocalAdmin(id);
    }
    else if (action === 'aprobarRepartidorAdmin') {
      const id = btn.getAttribute('data-id');
      if (typeof window.aprobarRepartidorAdmin === 'function') window.aprobarRepartidorAdmin(id);
    }
    else if (action === 'desbanearRepartidorAdmin') {
      const userId = decodeURIComponent(btn.getAttribute('data-user-id') || '');
      const id = btn.getAttribute('data-id');
      const name = decodeURIComponent(btn.getAttribute('data-name') || '');
      if (typeof window.desbanearRepartidorAdmin === 'function') window.desbanearRepartidorAdmin(userId || id, name);
    }
    else if (action === 'banearRepartidorAdmin') {
      const userId = decodeURIComponent(btn.getAttribute('data-user-id') || '');
      const id = btn.getAttribute('data-id');
      const name = decodeURIComponent(btn.getAttribute('data-name') || '');
      const plate = decodeURIComponent(btn.getAttribute('data-plate') || '');
      if (typeof window.banearRepartidorAdmin === 'function') window.banearRepartidorAdmin(userId || id, name, plate);
    }
    else if (action === 'borrarRepartidorPermanente') {
      const id = btn.getAttribute('data-id');
      const name = decodeURIComponent(btn.getAttribute('data-name') || '');
      if (typeof window.borrarRepartidorPermanente === 'function') window.borrarRepartidorPermanente(id, name);
    }
    else if (action === 'banearUsuarioAdmin') {
      const gmailOrId = btn.getAttribute('data-gmail') || btn.getAttribute('data-id');
      if (typeof window.banearUsuarioAdmin === 'function') window.banearUsuarioAdmin(gmailOrId);
    }
    else if (action === 'borrarCompradorPermanente') {
      const gmail = btn.getAttribute('data-gmail');
      const name = btn.getAttribute('data-name');
      if (typeof window.borrarCompradorPermanente === 'function') window.borrarCompradorPermanente(gmail, name);
    }
    else if (action === 'limpiarTodosLosPedidosFantasmaAdmin') {
      if (typeof window.limpiarTodosLosPedidosFantasmaAdmin === 'function') window.limpiarTodosLosPedidosFantasmaAdmin();
    }
    else if (action === 'borrarPedidoFantasmaAdmin') {
      const type = btn.getAttribute('data-type');
      const id = btn.getAttribute('data-id');
      const idx = btn.getAttribute('data-idx');
      if (typeof window.borrarPedidoFantasmaAdmin === 'function') {
        if (type === 'supabase') window.borrarPedidoFantasmaAdmin(type, id);
        else if (type === 'truck_report') window.borrarPedidoFantasmaAdmin(type, parseInt(idx || '0', 10));
        else window.borrarPedidoFantasmaAdmin(type);
      }
    }
    else if (action === 'borrarDenunciaAdmin') {
      const id = btn.getAttribute('data-id');
      if (typeof window.borrarDenunciaAdmin === 'function') window.borrarDenunciaAdmin(id);
    }
    else if (action === 'desbanearUsuarioAdmin') {
      const id = btn.getAttribute('data-id');
      if (typeof window.desbanearUsuarioAdmin === 'function') window.desbanearUsuarioAdmin(id);
    }
    else if (action === 'dibujarRutaAlPedido') {
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      if (typeof window.dibujarRutaAlPedido === 'function') window.dibujarRutaAlPedido(lat, lng);
    }
    else if (action === 'centrarPedidoEnMapa') {
      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      const orderId = btn.getAttribute('data-order-id') || btn.getAttribute('data-id');
      if (typeof window.centrarPedidoEnMapa === 'function') window.centrarPedidoEnMapa(lat, lng, orderId);
    }
    else if (action === 'abrirModalReglasApp') {
      if (typeof window.abrirModalReglasApp === 'function') window.abrirModalReglasApp();
    }
  } catch (err) {
    console.error('Error ejecutando acción de evento:', action, err);
  }
});
