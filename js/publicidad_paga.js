/* ============================================================================
   NOTIGAS BOLIVIA - PUBLICIDAD PAGADA POR DÍA (AUTOSERVICIO)
   ----------------------------------------------------------------------------
   Flujo: el negocio arma su anuncio -> paga por QR local -> sube la foto del
   comprobante -> el OCR lo valida en el navegador -> rpc_publicar_anuncio_pagado
   lo publica al instante. El admin puede revisarlo/retirarlo después.

   El precio NUNCA se toma del cliente: se lee de rpc_publicidad_pagos_config()
   y el servidor vuelve a validar monto, país, canal y duplicados.
   ============================================================================ */
(function () {
  'use strict';

  var CFG = {
    precio_por_dia: 9,
    moneda: 'Bs',
    dias_minimo: 1,
    dias_maximo: 30,
    activo: false,
    pais_destino: 'Bolivia',
    beneficiario_nombre: '',
    beneficiario_documento: '',
    metodo_entrega: '',
    numero_cuenta: '',
    instrucciones: ''
  };

  var _cfgCargada = false;
  var _cfgCargando = null;
  var _voucherParsed = null;
  var _voucherFile = null;
  var _publicando = false;
  var _eventosEnlazados = false;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(String(s == null ? '' : s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(titulo, msg, tipo) {
    if (typeof window.showToast === 'function') window.showToast(titulo, msg, tipo || 'info', 4500);
    else console.log('[Publicidad]', titulo, msg);
  }

  function money(n) {
    return CFG.moneda + ' ' + (Number(n) || 0).toFixed(2);
  }

  function mostrarError(msg) {
    var el = $('pubPagaError');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = msg;
  }

  function setOcrEstado(html, color) {
    var el = $('pubPagaOcrEstado');
    if (!el) return;
    el.style.color = color || '#CBD5E1';
    el.innerHTML = html;
  }

  function getUid() {
    if (window._tempAuthUser && window._tempAuthUser.id) return Promise.resolve(window._tempAuthUser.id);
    if (!window.supabaseClient) return Promise.resolve(null);
    return window.supabaseClient.auth.getUser().then(function (r) {
      if (r && r.data && r.data.user && r.data.user.id) return r.data.user.id;
      return window.supabaseClient.auth.getSession().then(function (s) {
        if (s && s.data && s.data.session && s.data.session.user) return s.data.session.user.id;
        return null;
      });
    }).catch(function () { return null; });
  }

  function diasActuales() {
    var input = $('pubPagaDias');
    var n = input ? parseInt(input.value, 10) : CFG.dias_minimo;
    if (isNaN(n)) n = CFG.dias_minimo;
    return n;
  }

  function actualizarTotal() {
    var d = diasActuales();
    var total = Math.round(CFG.precio_por_dia * d * 100) / 100;
    var box = $('pubPagaTotalMonto');
    if (box) box.textContent = money(total);
    var box2 = $('pubPagaTotalBox');
    if (box2) {
      var label = box2.querySelector('span');
      if (label) label.textContent = 'Total a pagar \u00b7 ' + d + (d === 1 ? ' d\u00eda' : ' d\u00edas') + ' \u00d7 ' + money(CFG.precio_por_dia);
    }
    return total;
  }

  function operacionDisponible() {
    var opEl = $('pubPagaOperacionManual');
    var manual = opEl ? opEl.value.trim() : '';
    if (manual.replace(/[^A-Za-z0-9]/g, '').length >= 5) return true;
    return !!(_voucherParsed && _voucherParsed.operacion);
  }

  function refrescarBotonPublicar() {
    var btn = $('pubPagaBtnPublicar');
    if (!btn) return;
    var total = Math.round(CFG.precio_por_dia * diasActuales() * 100) / 100;
    var ok = !!(_voucherParsed && _voucherParsed.esValido && _voucherFile) &&
      _voucherParsed.monto !== null && _voucherParsed.monto !== undefined &&
      Math.abs(Number(_voucherParsed.monto) - total) <= 0.01 &&
      operacionDisponible();
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '.5';
  }

  function bindEventosModal() {
    if (_eventosEnlazados) return;
    var en = function (id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };
    en('pubPagaBtnCerrar', 'click', function () { window.cerrarPublicidadPaga(); });
    en('pubPagaDiasMenos', 'click', function () { window.publicidadPagaCambiarDias(-1); });
    en('pubPagaDiasMas', 'click', function () { window.publicidadPagaCambiarDias(1); });
    en('pubPagaDias', 'input', function () { if (_voucherParsed) limpiarVoucher(); actualizarTotal(); });
    en('pubPagaDias', 'blur', function () { window.publicidadPagaCambiarDias(0); });
    en('pubPagaBtnContinuar', 'click', function () { window.publicidadPagaIrAPago(); });
    en('pubPagaVoucherFile', 'change', function () { window.publicidadPagaProcesarVoucher($('pubPagaVoucherFile')); });
    en('pubPagaBtnPublicar', 'click', function () { window.publicidadPagaPublicar(); });
    en('pubPagaBtnVolver', 'click', function () { window.publicidadPagaVolver(); });
    en('pubPagaBtnActualizar', 'click', function () { window.publicidadPagaCargarMisAnuncios(); });
    en('pubPagaOperacionManual', 'input', function () { refrescarBotonPublicar(); });
    _eventosEnlazados = true;
  }

  function limpiarVoucher() {
    _voucherParsed = null;
    _voucherFile = null;
    var f = $('pubPagaVoucherFile');
    if (f) f.value = '';
    var m = $('pubPagaOperacionManual');
    if (m) m.value = '';
    setOcrEstado('Sube una foto legible del comprobante del pago por QR.');
    refrescarBotonPublicar();
  }

  function cargarConfig() {
    if (_cfgCargada) return Promise.resolve(CFG);
    if (_cfgCargando) return _cfgCargando;
    if (!window.supabaseClient) return Promise.resolve(CFG);
    _cfgCargando = window.supabaseClient.rpc('rpc_publicidad_pagos_config').then(function (res) {
      if (res && !res.error && res.data) {
        Object.keys(CFG).forEach(function (k) {
          if (res.data[k] !== undefined && res.data[k] !== null) CFG[k] = res.data[k];
        });
        CFG.precio_por_dia = Number(CFG.precio_por_dia) || 9;
        CFG.dias_minimo = parseInt(CFG.dias_minimo, 10) || 1;
        CFG.dias_maximo = parseInt(CFG.dias_maximo, 10) || 30;
        _cfgCargada = true;
      }
      _cfgCargando = null;
      return CFG;
    }).catch(function (e) {
      _cfgCargando = null;
      console.warn('[Publicidad] No se pudo cargar la configuración:', e);
      return CFG;
    });
    return _cfgCargando;
  }

  function llenarCiudades() {
    var select = $('pubPagaCiudad');
    if (!select || select.dataset.poblado === 'true') return;
    var origen = document.getElementById('selectCiudadCapital');
    var activa = (typeof AppState !== 'undefined' && AppState.get('city')) || 'cochabamba';
    select.innerHTML = '';
    if (origen && origen.options.length) {
      Array.prototype.forEach.call(origen.options, function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.textContent;
        if (opt.value === activa) o.selected = true;
        select.appendChild(o);
      });
    } else {
      ['cochabamba', 'lapaz', 'santacruz', 'sucre', 'oruro', 'potosi', 'tarija', 'trinidad', 'cobija']
        .forEach(function (c) {
          var o = document.createElement('option');
          o.value = c; o.textContent = c;
          if (c === activa) o.selected = true;
          select.appendChild(o);
        });
    }
    select.dataset.poblado = 'true';
  }

  function precargarDatosUsuario() {
    var u = (typeof AppState !== 'undefined' ? AppState.get('userData') : null) || {};
    var nombreEl = $('pubPagaNombre');
    var contactoEl = $('pubPagaContacto');
    if (nombreEl && !nombreEl.value) {
      var nombre = [u.nombre, u.apellido].filter(Boolean).join(' ').trim();
      if (nombre) nombreEl.value = nombre;
    }
    if (contactoEl && !contactoEl.value) {
      var tel = u.telefono || u.celular || u.whatsapp;
      if (tel) contactoEl.value = String(tel);
    }
  }

  function renderPagoInfo(total) {
    var el = $('pubPagaPagoInfo');
    if (!el) return;
    var d = diasActuales();
    var filas = [];
    filas.push('<div style="font-size:15px;font-weight:800;color:#34D399;margin-bottom:6px;">Paga ' + esc(money(total)) + '</div>');
    filas.push('<div>' + esc(d) + (d === 1 ? ' d\u00eda' : ' d\u00edas') + ' \u00d7 ' + esc(money(CFG.precio_por_dia)) + '</div>');
    if (CFG.metodo_entrega) filas.push('<div>M\u00e9todo: <strong>' + esc(CFG.metodo_entrega) + '</strong></div>');
    if (CFG.beneficiario_nombre) filas.push('<div>Beneficiario: <strong>' + esc(CFG.beneficiario_nombre) + '</strong>' + (CFG.beneficiario_documento ? ' (CI ' + esc(CFG.beneficiario_documento) + ')' : '') + '</div>');
    if (CFG.numero_cuenta) filas.push('<div>Cuenta / QR: <strong>' + esc(CFG.numero_cuenta) + '</strong></div>');
    if (CFG.instrucciones) filas.push('<div style="margin-top:6px;opacity:.9;">' + esc(CFG.instrucciones) + '</div>');
    filas.push('<div style="margin-top:8px;font-size:11.5px;opacity:.75;">Al pagar, sube la foto n\u00edtida del comprobante. Debe pagarse desde Bolivia por QR local.</div>');
    el.innerHTML = filas.join('');
  }

  function mostrarPaso(n) {
    var p1 = $('pubPagaPaso1');
    var p2 = $('pubPagaPaso2');
    if (p1) p1.style.display = (n === 1 ? 'block' : 'none');
    if (p2) p2.style.display = (n === 2 ? 'block' : 'none');
  }

  function resetFormulario() {
    ['pubPagaTitulo', 'pubPagaDescripcion', 'pubPagaUrl'].forEach(function (id) {
      var el = $(id);
      if (el) el.value = '';
    });
    var d = $('pubPagaDias');
    if (d) d.value = String(CFG.dias_minimo);
    limpiarVoucher();
    mostrarError('');
    actualizarTotal();
    mostrarPaso(1);
  }

  // --------------------------------------------------------------------------
  // API pública
  // --------------------------------------------------------------------------

  window.abrirPublicidadPaga = function () {
    var modal = $('modalPublicidadPaga');
    if (!modal) return;
    bindEventosModal();
    llenarCiudades();
    precargarDatosUsuario();
    resetFormulario();
    modal.style.display = 'flex';

    var notice = $('pubPagaConfigNotice');
    if (notice) notice.textContent = 'Cargando tarifas...';

    cargarConfig().then(function () {
      if (notice) {
        if (CFG.activo === false) {
          notice.textContent = 'La publicidad pagada no est\u00e1 disponible por ahora.';
        } else {
          notice.innerHTML = 'Publica tu anuncio por <strong>' + esc(money(CFG.precio_por_dia)) +
            '</strong> por cada 24 horas. Elige de ' + esc(CFG.dias_minimo) + ' a ' + esc(CFG.dias_maximo) + ' d\u00edas.';
        }
      }
      var d = $('pubPagaDias');
      if (d) { d.min = String(CFG.dias_minimo); d.max = String(CFG.dias_maximo); }
      var btnPagar = document.querySelector('#pubPagaPaso1 .btn-submit');
      if (btnPagar) btnPagar.disabled = (CFG.activo === false);
      actualizarTotal();
    });

    window.publicidadPagaCargarMisAnuncios();
  };

  window.cerrarPublicidadPaga = function () {
    var modal = $('modalPublicidadPaga');
    if (modal) modal.style.display = 'none';
  };

  window.publicidadPagaCambiarDias = function (delta) {
    var input = $('pubPagaDias');
    if (!input) return;
    var n = diasActuales() + (delta || 0);
    if (n < CFG.dias_minimo) n = CFG.dias_minimo;
    if (n > CFG.dias_maximo) n = CFG.dias_maximo;
    input.value = String(n);
    // Cambió el total: el comprobante anterior ya no sirve.
    if (_voucherParsed) limpiarVoucher();
    actualizarTotal();
  };

  window.publicidadPagaIrAPago = function () {
    mostrarError('');
    var titulo = ($('pubPagaTitulo') ? $('pubPagaTitulo').value : '').trim();
    var desc = ($('pubPagaDescripcion') ? $('pubPagaDescripcion').value : '').trim();
    var url = ($('pubPagaUrl') ? $('pubPagaUrl').value : '').trim();
    var pos = $('pubPagaPosicion') ? $('pubPagaPosicion').value : 'mapa';
    var ciudad = $('pubPagaCiudad') ? $('pubPagaCiudad').value : '';
    var dias = diasActuales();

    if (titulo.length < 3 || titulo.length > 120) return mostrarError('El t\u00edtulo debe tener entre 3 y 120 caracteres.');
    if (desc.length > 800) return mostrarError('La descripci\u00f3n no puede pasar de 800 caracteres.');
    if (url && !/^https?:\/\//i.test(url)) return mostrarError('El enlace debe empezar con http:// o https://.');
    if (dias < CFG.dias_minimo || dias > CFG.dias_maximo) return mostrarError('Elige entre ' + CFG.dias_minimo + ' y ' + CFG.dias_maximo + ' d\u00edas.');
    if (!ciudad) return mostrarError('Elige la ciudad donde se mostrar\u00e1 el anuncio.');
    if (CFG.activo === false) return mostrarError('La publicidad pagada no est\u00e1 disponible por ahora.');

    getUid().then(function (uid) {
      if (!uid) {
        mostrarError('Inicia sesi\u00f3n para publicar tu anuncio.');
        toast('Inicia sesi\u00f3n', 'Necesitas una cuenta para contratar publicidad.', 'warning');
        return;
      }
      var total = Math.round(CFG.precio_por_dia * dias * 100) / 100;
      renderPagoInfo(total);
      mostrarPaso(2);
    });
  };

  window.publicidadPagaVolver = function () {
    mostrarPaso(1);
  };

  window.publicidadPagaProcesarVoucher = function (input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setOcrEstado('El comprobante debe ser una imagen (JPG o PNG).', '#FCA5A5');
      limpiarVoucher();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setOcrEstado('La imagen no puede pesar m\u00e1s de 5 MB.', '#FCA5A5');
      limpiarVoucher();
      return;
    }

    _voucherFile = file;
    _voucherParsed = null;
    refrescarBotonPublicar();
    setOcrEstado('Preparando lectura del comprobante...', '#FBBF24');

    var total = Math.round(CFG.precio_por_dia * diasActuales() * 100) / 100;

    var listo = (typeof window.leerYValidarVoucherOCR === 'function')
      ? Promise.resolve()
      : (typeof window.loadScriptAsync === 'function' ? window.loadScriptAsync('js/voucher_ocr.js') : Promise.reject(new Error('OCR no disponible')));

    listo.then(function () {
      if (typeof window.leerYValidarVoucherOCR !== 'function') throw new Error('OCR no disponible');
      return window.leerYValidarVoucherOCR(file, function (p) {
        if (!p) return;
        if (p.status === 'progreso') setOcrEstado('Leyendo recibo (' + p.pct + '%)...', '#FBBF24');
        else if (p.message) setOcrEstado(esc(p.message), '#FBBF24');
      }, { expectedAmount: total });
    }).then(function (parsed) {
      _voucherParsed = parsed || null;
      if (!parsed || !parsed.esValido) {
        var motivo = (parsed && parsed.resumen) ? parsed.resumen : 'No se pudo leer el comprobante.';
        setOcrEstado(esc(motivo) + '<br><span style="opacity:.8;">Prueba con una foto m\u00e1s n\u00edtida o completa.</span>', '#FCA5A5');
      } else if (Math.abs(Number(parsed.monto) - total) > 0.01) {
        setOcrEstado('El comprobante dice ' + esc(money(parsed.monto)) + ' pero el total es ' + esc(money(total)) + '. Verifica los d\u00edas o sube el comprobante correcto.', '#FCA5A5');
      } else {
        var extra = parsed.operacion ? ' Operaci\u00f3n ' + esc(parsed.operacion) + '.' : '';
        setOcrEstado('\u2714 Comprobante le\u00eddo: ' + esc(money(parsed.monto)) + ' \u00b7 ' + esc(parsed.canalPago || parsed.app || 'QR local') + '.' + extra, '#34D399');
      }
      refrescarBotonPublicar();
    }).catch(function (e) {
      _voucherParsed = null;
      setOcrEstado('No se pudo leer el comprobante: ' + esc(e && e.message ? e.message : 'error') + '.', '#FCA5A5');
      refrescarBotonPublicar();
    });
  };

  window.publicidadPagaPublicar = function () {
    if (_publicando) return;
    var btn = $('pubPagaBtnPublicar');
    if (btn && btn.disabled) return;

    var titulo = ($('pubPagaTitulo') ? $('pubPagaTitulo').value : '').trim();
    var desc = ($('pubPagaDescripcion') ? $('pubPagaDescripcion').value : '').trim();
    var url = ($('pubPagaUrl') ? $('pubPagaUrl').value : '').trim();
    var pos = $('pubPagaPosicion') ? $('pubPagaPosicion').value : 'mapa';
    var ciudad = $('pubPagaCiudad') ? $('pubPagaCiudad').value : '';
    var dias = diasActuales();
    var nombre = ($('pubPagaNombre') ? $('pubPagaNombre').value : '').trim();
    var contacto = ($('pubPagaContacto') ? $('pubPagaContacto').value : '').trim();
    var opManual = ($('pubPagaOperacionManual') ? $('pubPagaOperacionManual').value : '').trim();

    if (!_voucherParsed || !_voucherParsed.esValido || !_voucherFile) {
      mostrarError('Primero sube un comprobante v\u00e1lido.');
      return;
    }

    var total = Math.round(CFG.precio_por_dia * dias * 100) / 100;
    if (Math.abs(Number(_voucherParsed.monto) - total) > 0.01) {
      mostrarError('El monto del comprobante no coincide con el total a pagar.');
      return;
    }

    _publicando = true;
    mostrarError('');
    if (btn) btn.disabled = true;

    var uid = null;
    var rutaSubida = null;
    var ext = (_voucherFile.type === 'image/png') ? 'png' : (_voucherFile.type === 'image/webp' ? 'webp' : 'jpg');

    getUid().then(function (id) {
      uid = id;
      if (!uid) throw new Error('Sesi\u00f3n no v\u00e1lida. Inicia sesi\u00f3n de nuevo.');
      rutaSubida = uid + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      if (typeof window.showLoadingOverlay === 'function') window.showLoadingOverlay('Subiendo comprobante...');
      return window.supabaseClient.storage.from('vouchers-publicidad')
        .upload(rutaSubida, _voucherFile, { upsert: false, contentType: _voucherFile.type });
    }).then(function (up) {
      if (!up || up.error) throw new Error((up && up.error && up.error.message) || 'No se pudo subir el comprobante.');

      var voucher = {
        esValido: true,
        monto: _voucherParsed.monto,
        operacion: opManual || _voucherParsed.operacion,
        canalPago: _voucherParsed.canalPago,
        paisDestino: _voucherParsed.paisDestino,
        fechaISO: _voucherParsed.fechaISO,
        confianza: _voucherParsed.confianza,
        rawText: _voucherParsed.rawText
      };

      if (typeof window.showLoadingOverlay === 'function') window.showLoadingOverlay('Publicando tu anuncio...');
      return window.supabaseClient.rpc('rpc_publicar_anuncio_pagado', {
        p_titulo: titulo,
        p_descripcion: desc || null,
        p_url: url || null,
        p_ciudad: ciudad,
        p_posicion: pos,
        p_dias: dias,
        p_anunciante_nombre: nombre || null,
        p_anunciante_contacto: contacto || null,
        p_voucher: voucher,
        p_voucher_imagen_path: rutaSubida
      });
    }).then(function (res) {
      if (res && res.error) throw new Error(res.error.message || 'Error al publicar.');
      var out = res && res.data;
      if (!out || out.ok !== true) {
        var msg = (out && out.mensaje) || 'No se pudo publicar el anuncio.';
        // Si el servidor rechazó el comprobante, borra la imagen subida para no dejar huérfanos.
        if (rutaSubida) {
          try { window.supabaseClient.storage.from('vouchers-publicidad').remove([rutaSubida]); } catch (e) {}
        }
        throw new Error(msg);
      }

      var expira = out.expira_en ? new Date(out.expira_en) : null;
      var expiraTxt = expira ? expira.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      toast('\u00a1Anuncio publicado!', 'Tu anuncio ya est\u00e1 visible' + (expiraTxt ? ' hasta el ' + expiraTxt : '') + '.', 'success');
      if (out.sospechoso) {
        toast('En revisi\u00f3n', 'Tu comprobante qued\u00f3 marcado para revisi\u00f3n del administrador.', 'warning');
      }
      resetFormulario();
      window.publicidadPagaCargarMisAnuncios();
      if (typeof window.cargarAnunciosGuardados === 'function') window.cargarAnunciosGuardados();
    }).catch(function (e) {
      mostrarError((e && e.message) || 'No se pudo publicar el anuncio.');
    }).then(function () {
      _publicando = false;
      if (typeof window.hideLoadingOverlay === 'function') window.hideLoadingOverlay();
      refrescarBotonPublicar();
    });
  };

  window.publicidadPagaCargarMisAnuncios = function () {
    var cont = $('pubPagaMisAnunciosList');
    if (!cont) return;
    if (!window.supabaseClient) {
      cont.innerHTML = '<span style="opacity:.7;">Sin conexi\u00f3n. Intenta m\u00e1s tarde.</span>';
      return;
    }
    cont.innerHTML = '<span style="opacity:.7;">Cargando...</span>';
    window.supabaseClient.rpc('rpc_mis_anuncios_publicitarios').then(function (res) {
      if (res && res.error) {
        cont.innerHTML = '<span style="opacity:.7;">No se pudieron cargar tus anuncios.</span>';
        return;
      }
      var out = res && res.data;
      if (!out || out.ok !== true) {
        if (out && out.codigo === 'no_auth') {
          cont.innerHTML = '<span style="opacity:.7;">Inicia sesi\u00f3n para ver tus anuncios.</span>';
        } else {
          cont.innerHTML = '<span style="opacity:.7;">No se pudieron cargar tus anuncios.</span>';
        }
        return;
      }
      var lista = Array.isArray(out.anuncios) ? out.anuncios : [];
      if (!lista.length) {
        cont.innerHTML = '<span style="opacity:.7;">Todav\u00eda no tienes anuncios publicados.</span>';
        return;
      }
      cont.innerHTML = lista.map(renderAnuncio).join('');
    }).catch(function () {
      cont.innerHTML = '<span style="opacity:.7;">No se pudieron cargar tus anuncios.</span>';
    });
  };

  function renderAnuncio(a) {
    var vigente = a.vigente === true;
    var badge = vigente
      ? '<span style="background:rgba(16,185,129,.18);color:#34D399;border:1px solid rgba(16,185,129,.5);border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;">VIGENTE</span>'
      : (a.estado === 'retirado'
        ? '<span style="background:rgba(239,68,68,.18);color:#FCA5A5;border:1px solid rgba(239,68,68,.5);border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;">RETIRADO</span>'
        : '<span style="background:rgba(148,163,184,.18);color:#CBD5E1;border:1px solid rgba(148,163,184,.5);border-radius:6px;padding:2px 6px;font-size:10px;font-weight:800;">VENCIDO</span>');

    var restante = '';
    if (vigente && typeof a.dias_restantes === 'number') {
      restante = '<div style="opacity:.85;margin-top:2px;">' + esc(a.dias_restantes) + (a.dias_restantes === 1 ? ' d\u00eda restante' : ' d\u00edas restantes') + '</div>';
    }
    var exp = a.expira_en ? new Date(a.expira_en).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    return '<div style="background:rgba(15,23,42,.6);border:1px solid #334155;border-radius:10px;padding:10px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<strong style="color:#F1F5F9;font-size:12.5px;">' + esc(a.titulo || '') + '</strong>' + badge +
      '</div>' +
      '<div style="opacity:.85;margin-top:3px;">' + esc(String(a.posicion || '').toUpperCase()) + ' \u00b7 ' + esc(String(a.ciudad || '').toUpperCase()) + (exp ? ' \u00b7 hasta ' + esc(exp) : '') + '</div>' +
      restante +
    '</div>';
  }
})();
