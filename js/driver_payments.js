/* ==========================================================================
   NOTIGAS - PAGOS DEL REPARTIDOR (PERU -> REMESA A BOLIVIA)
   - Primeros 100 pedidos confirmados sin comisión.
   - Después: S/ 0.20 por balón. Ciclo fijo de S/ 50.
   - Único medio aceptado: Yape > Remesas > Bolivia.
   - El recibo se procesa localmente; la imagen NO se persiste.
   ========================================================================== */
(function () {
  'use strict';

  const esc = (value) => {
    if (typeof window.escapeHtmlStr === 'function') return window.escapeHtmlStr(value ?? '');
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const digits = (value) => {
    const out = String(value || '').replace(/[^0-9]/g, '');
    return out || null;
  };
  const norm = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  const money = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `S/ ${n.toFixed(2)}` : '—';
  };
  const fecha = (value) => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('es-PE', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
    catch (_) { return String(value); }
  };

  function isDriver() {
    const role = typeof AppState !== 'undefined' ? AppState.get('userRole') : null;
    const mode = typeof AppState !== 'undefined' ? AppState.get('appMode') : null;
    const user = typeof AppState !== 'undefined' ? AppState.get('userData') : null;
    return role === 'repartidor' || mode === 'driver' || user?.role === 'repartidor';
  }

  function ensurePaymentsModal() {
    let modal = document.getElementById('modalDriverPayments');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'modalDriverPayments';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="modal-content" style="max-width:720px;max-height:90vh;overflow:auto;">
      <div class="modal-title"><span id="driverPaymentsModalTitle"><i class="fa-solid fa-money-check-dollar"></i> Pagos</span>
      <button type="button" class="btn-close" id="btnCloseDriverPayments">✖</button></div>
      <div id="driverPaymentsModalBody"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#btnCloseDriverPayments')?.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.style.display = 'none'; });
    return modal;
  }

  function openPaymentsModal(title, html) {
    const modal = ensurePaymentsModal();
    const titleEl = modal.querySelector('#driverPaymentsModalTitle');
    const body = modal.querySelector('#driverPaymentsModalBody');
    if (titleEl) titleEl.innerHTML = title;
    if (body) body.innerHTML = html;
    modal.style.display = 'flex';
    return { modal, body };
  }

  function syncDriverMenuVisibility() {
    const visible = isDriver();
    const paymentMenu = document.getElementById('driverPaymentsMenu');
    const driverConfig = document.getElementById('driverConfigMenu');
    if (paymentMenu) paymentMenu.style.display = visible ? 'block' : 'none';
    if (driverConfig) driverConfig.style.display = visible ? 'block' : 'none';
    const commonConfigButton = document.getElementById('btnCambiarCiudadPref');
    const commonConfig = typeof commonConfigButton?.closest === 'function' ? commonConfigButton.closest('details') : null;
    const commonDelete = document.getElementById('btnDeleteMyAccount');
    const driverPrivacy = document.getElementById('btnPrivacyPolicyDriver');
    if (commonConfig) commonConfig.style.display = visible ? 'none' : '';
    if (commonDelete && visible) commonDelete.style.display = 'none';
    if (driverPrivacy) driverPrivacy.style.display = visible ? 'none' : '';
  }

  function ensureDriverMenu() {
    const section = document.getElementById('settingsDriverSection');
    if (!section) return;
    if (!document.getElementById('driverPaymentsMenu')) {
      const payments = document.createElement('details');
      payments.id = 'driverPaymentsMenu';
      payments.style.cssText = 'margin-top:12px;background:rgba(15,23,42,.85);border:1.5px solid rgba(16,185,129,.45);border-radius:12px;padding:10px 14px;';
      payments.innerHTML = `<summary style="font-size:13px;font-weight:900;color:#10B981;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
        <span><i class="fa-solid fa-money-check-dollar"></i> PAGOS</span><span style="font-size:10px;color:#94A3B8;">(Desplegar)</span></summary>
        <div style="display:grid;gap:9px;margin-top:10px;">
          <div style="font-size:11px;color:#CBD5E1;line-height:1.45;padding:8px;border-radius:8px;background:#0F172A;">
            <strong>Primeros 100 pedidos confirmados: GRATIS.</strong> Desde el pedido 101: S/ 0.20 por balón. <strong>Al llegar a S/ 50 se genera el pago fijo; la cuenta sigue activa solo tras confirmarse por Yape, usando Remesas con destino Bolivia.</strong>
          </div>
          <button type="button" id="btnDriverPaymentsHistory" style="width:100%;background:#1E293B;color:#E2E8F0;border:1px solid #475569;padding:10px;border-radius:10px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-clock-rotate-left"></i> Ver mis pagos</button>
          <button type="button" id="btnDriverNewPayment" style="width:100%;background:linear-gradient(135deg,#10B981,#059669);color:white;border:0;padding:10px;border-radius:10px;font-weight:900;cursor:pointer;"><i class="fa-solid fa-paper-plane"></i> Realizar un nuevo pago</button>
        </div>`;
      section.appendChild(payments);
      payments.querySelector('#btnDriverPaymentsHistory')?.addEventListener('click', verMisPagos);
      payments.querySelector('#btnDriverNewPayment')?.addEventListener('click', nuevoPago);
    }
    if (!document.getElementById('driverConfigMenu')) {
      const config = document.createElement('details');
      config.id = 'driverConfigMenu';
      config.style.cssText = 'margin-top:12px;background:rgba(15,23,42,.85);border:1.5px solid rgba(255,109,0,.4);border-radius:12px;padding:10px 14px;';
      config.innerHTML = `<summary style="font-size:13px;font-weight:900;color:#FF6D00;cursor:pointer;display:flex;align-items:center;justify-content:space-between;"><span><i class="fa-solid fa-gear"></i> CONFIGURACIÓN</span><span style="font-size:10px;color:#94A3B8;">(Desplegar)</span></summary>
      <div style="display:grid;gap:9px;margin-top:10px;">
        <button type="button" id="btnDriverProxyCity" style="width:100%;background:#0369A1;color:white;border:0;padding:9px;border-radius:9px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-map-location-dot"></i> Cambiar mi ciudad</button>
        <button type="button" id="btnDriverProxyRules" style="width:100%;background:#EA580C;color:white;border:0;padding:9px;border-radius:9px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-scroll"></i> Reglas y normas de uso</button>
        <button type="button" id="btnDriverPrivacyPolicy" style="width:100%;background:#334155;color:white;border:0;padding:9px;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-shield-halved"></i> Legal y privacidad</button>
        <button type="button" id="btnDriverDeleteAccount" style="width:100%;background:#991B1B;color:white;border:0;padding:9px;border-radius:8px;font-weight:800;cursor:pointer;"><i class="fa-solid fa-trash-can"></i> Eliminar totalmente mi cuenta</button>
      </div>`;
      section.appendChild(config);
      config.querySelector('#btnDriverProxyCity')?.addEventListener('click', () => document.getElementById('btnCambiarCiudadPref')?.click());
      config.querySelector('#btnDriverProxyRules')?.addEventListener('click', () => {
        if (typeof window.abrirModalReglasApp === 'function') window.abrirModalReglasApp(); else document.getElementById('btnVerReglasApp')?.click();
      });
      config.querySelector('#btnDriverPrivacyPolicy')?.addEventListener('click', () => {
        if (typeof window.abrirModalPoliticaPrivacidad === 'function') window.abrirModalPoliticaPrivacidad(); else document.getElementById('btnPrivacyPolicyDriver')?.click();
      });
      config.querySelector('#btnDriverDeleteAccount')?.addEventListener('click', () => document.getElementById('btnDeleteMyAccount')?.click());
    }
    syncDriverMenuVisibility();
  }

  async function verMisPagos() {
    if (!window.supabaseClient) return;
    const { body } = openPaymentsModal('<i class="fa-solid fa-clock-rotate-left"></i> Mis pagos', '<div style="padding:20px;text-align:center;color:#94A3B8;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</div>');
    try {
      const { data: authData } = await window.supabaseClient.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error('Debes iniciar sesión');
      const { data, error } = await window.supabaseClient.from('pagos_comisiones')
        .select('id,monto,estado,cobro_generado_at,pago_fecha,numero_transaccion,monto_enviado_pen,created_at,reviewed_at,admin_observacion,validado_automaticamente_at,verificado_recepcion_at')
        .eq('user_id', uid).order('created_at', { ascending:false }).limit(50);
      if (error) throw error;
      if (!data?.length) { body.innerHTML = '<div style="padding:24px;text-align:center;color:#94A3B8;">Todavía no tienes pagos registrados.</div>'; return; }
      const labels = {
        generado:'Cobro generado', pendiente_verificacion_recepcion:'Aprobado automáticamente · recepción por verificar',
        confirmado:'Remesa recibida · confirmada', no_recibido:'Remesa no recibida', ocr_no_valido:'Recibo no válido', fraude_confirmado:'Comprobante observado'
      };
      body.innerHTML = data.map((p) => `<div style="border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:10px;background:#0F172A;color:#E2E8F0;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;"><strong>${esc(labels[p.estado] || p.estado || 'Pendiente')}</strong><strong>${money(p.monto_enviado_pen ?? p.monto)}</strong></div>
        <div style="margin-top:6px;font-size:12px;color:#94A3B8;line-height:1.5;">Orden/transacción: ${esc(p.numero_transaccion || '—')}<br>Fecha de remesa: ${fecha(p.pago_fecha)}<br>${p.validado_automaticamente_at ? `Aprobación automática: ${fecha(p.validado_automaticamente_at)}<br>` : ''}${p.verificado_recepcion_at ? `Recepción verificada: ${fecha(p.verificado_recepcion_at)}<br>` : ''}${p.admin_observacion ? `Verificación: ${esc(p.admin_observacion)}` : ''}</div>
      </div>`).join('');
    } catch (err) { body.innerHTML = `<div style="padding:20px;color:#EF4444;">${esc(err.message || err)}</div>`; }
  }

  function findExpectedDigits(raw, expected) {
    const target = digits(expected);
    if (!target) return null;
    const compact = String(raw || '').replace(/[^0-9]/g, '');
    return compact.includes(target) ? target : null;
  }

  function extractRecipientName(raw, expectedName) {
    const expectedNorm = norm(expectedName);
    const lines = String(raw || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const re = /^(?:destinatario|beneficiario|recibe|para)\s*[:\-]?\s*(.+)$/i;
    for (const line of lines) {
      const match = line.match(re);
      if (match?.[1]) {
        const candidate = match[1].replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g, '').replace(/\s+/g, ' ').trim();
        if (candidate.length >= 3) return candidate;
      }
    }
    if (expectedNorm && norm(raw).includes(expectedNorm)) return String(expectedName || '').trim();
    return null;
  }

  function extractRecipientDocument(raw, expectedDocument) {
    const exact = findExpectedDigits(raw, expectedDocument);
    if (exact) return exact;
    const m = String(raw || '').match(/(?:documento|identidad|c\.?i\.?|dni)[^0-9]{0,20}([0-9]{5,12})\b/i);
    return m?.[1] || null;
  }

  async function getDriverProfile() {
    const { data: authData } = await window.supabaseClient.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) throw new Error('Debes iniciar sesión');
    const { data, error } = await window.supabaseClient.from('choferes_habilitados')
      .select('nombre_completo,dni,yape_numero,device_id').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return data || {};
  }

  async function nuevoPago() {
    if (!window.supabaseClient) return;
    const { body } = openPaymentsModal('<i class="fa-solid fa-paper-plane"></i> Realizar un nuevo pago', '<div style="padding:20px;text-align:center;color:#94A3B8;"><i class="fa-solid fa-spinner fa-spin"></i> Preparando cobro...</div>');
    try {
      const cobroRes = typeof window.generarCobroComisiones === 'function' ? await window.generarCobroComisiones() : (await window.supabaseClient.rpc('rpc_generar_cobro_comisiones')).data;
      if (!cobroRes?.ok) throw new Error(cobroRes?.message || 'No se pudo generar el cobro');
      const instructionsRes = typeof window.obtenerInstruccionesPago === 'function' ? await window.obtenerInstruccionesPago() : (await window.supabaseClient.rpc('rpc_get_payment_instructions')).data;
      if (!instructionsRes?.configured) throw new Error('Los datos de la remesa todavía no están configurados');
      const profile = await getDriverProfile();
      const pagoId = cobroRes.pago_id;
      const cuentaDestino = digits(instructionsRes.numero_cuenta);
      const documentoDestino = digits(instructionsRes.beneficiario_documento);
      if (!cuentaDestino || cuentaDestino.length < 6 || cuentaDestino.length > 20) throw new Error('La cuenta de destino de la remesa no está configurada correctamente');
      if (!documentoDestino) throw new Error('El documento del beneficiario no está configurado');
      const expectedAmount = Number(cobroRes.monto);

      body.innerHTML = `
        <div style="background:#7C2D12;border:1px solid #FDBA74;border-radius:12px;padding:13px;color:#FFF7ED;line-height:1.55;">
          <strong>⚠️ ÚNICO MEDIO ACEPTADO</strong><br>Solo aceptamos el pago de comisiones mediante <strong>Yape → Remesas → Bolivia</strong>. No envíes Plin, transferencia bancaria, pago directo a celular ni otro medio.
        </div>
        <div style="margin-top:12px;background:#0F172A;border:1px solid #334155;border-radius:12px;padding:14px;color:#E2E8F0;">
          <div style="font-size:12px;color:#94A3B8;">Monto exacto de la remesa</div><div style="font-size:28px;font-weight:900;color:#10B981;">${money(expectedAmount)}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:4px;">Cobro generado: ${fecha(cobroRes.cobro_generado_at)}</div>
        </div>
        <div style="margin-top:12px;background:#1E293B;border:1px solid #475569;border-radius:12px;padding:14px;color:#E2E8F0;line-height:1.6;">
          <strong>Pasos para pagar</strong>
          <ol style="margin:8px 0 0 20px;padding:0;">
            <li>Abre <strong>Yape</strong>.</li><li>Ingresa a <strong>Remesas</strong>.</li><li>Selecciona <strong>Bolivia</strong> como país de destino.</li>
            <li>Envía exactamente <strong>${money(expectedAmount)}</strong>.</li>
            <li>Registra al beneficiario indicado abajo y completa la remesa.</li>
            <li>Al finalizar, <strong>guarda el recibo digital</strong> y súbelo en esta pantalla.</li>
          </ol>
          <div style="margin-top:10px;padding:10px;background:#0F172A;border-radius:9px;">
            Beneficiario: <strong>${esc(instructionsRes.beneficiario_nombre || '—')}</strong><br>
            Documento de identidad: <strong>${esc(instructionsRes.beneficiario_documento || '—')}</strong><br>
            Cuenta de destino: <strong>${esc(cuentaDestino)}</strong><br>
            Método de entrega: <strong>${esc(instructionsRes.metodo_entrega || 'Billetera Móvil Yape')}</strong><br>
            Destino: <strong>${esc(instructionsRes.pais_destino || 'Bolivia')}</strong>
          </div>
        </div>
        <div style="margin-top:12px;background:#172554;border:1px solid #60A5FA;border-radius:12px;padding:12px;color:#DBEAFE;font-size:12px;line-height:1.55;">
          <strong>El recibo digital debe mostrar:</strong> Yape/Remesas, Bolivia, el monto exacto, el beneficiario, su documento, la cuenta de destino, una <strong>fecha y hora compatibles con este cobro</strong> y un <strong>número de orden o transacción único</strong>. Si falta alguno de estos datos, el sistema no lo aprobará.
        </div>
        <div style="margin-top:12px;"><label style="display:block;font-size:12px;font-weight:800;color:#CBD5E1;margin-bottom:5px;">Mi número Yape</label>
          <input id="inputDriverYapePayment" inputmode="numeric" maxlength="9" value="${esc(profile.yape_numero || '')}" placeholder="9XXXXXXXX" style="width:100%;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid #475569;background:#0F172A;color:white;"></div>
        <div style="margin-top:12px;"><label style="display:block;font-size:12px;font-weight:800;color:#CBD5E1;margin-bottom:5px;">Subir recibo digital de la remesa</label>
          <input id="inputDriverPaymentVoucher" type="file" accept="image/*" style="width:100%;color:#CBD5E1;"><div style="font-size:10.5px;color:#94A3B8;margin-top:5px;">La imagen se procesa localmente y no se guarda. Solo se envían los datos extraídos para validación.</div></div>
        <div id="driverPaymentOcrStatus" style="margin-top:12px;padding:10px;border-radius:9px;background:#0F172A;color:#94A3B8;font-size:12px;">Selecciona el recibo digital para validarlo.</div>`;

      const yapeInput = body.querySelector('#inputDriverYapePayment');
      const fileInput = body.querySelector('#inputDriverPaymentVoucher');
      const status = body.querySelector('#driverPaymentOcrStatus');
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          const ownYape = digits(yapeInput?.value);
          if (!ownYape || ownYape.length !== 9 || !ownYape.startsWith('9')) throw new Error('Registra primero un número Yape válido de 9 dígitos');
          const { error: yapeErr } = await window.supabaseClient.rpc('rpc_actualizar_yape_chofer', { p_yape: ownYape });
          if (yapeErr) throw yapeErr;
          if (typeof window.leerYValidarVoucherOCR !== 'function') throw new Error('OCR no disponible');
          const parsed = await window.leerYValidarVoucherOCR(file, (progress) => { if (status) status.textContent = progress?.message || 'Procesando OCR...'; }, { expectedAmount });
          const raw = parsed?.rawText || '';
          const amount = parsed?.monto ?? null;
          const operation = parsed?.operacion || null;
          const dateIso = parsed?.fechaISO || null;
          const recipientName = extractRecipientName(raw, instructionsRes.beneficiario_nombre);
          const recipientDocument = extractRecipientDocument(raw, instructionsRes.beneficiario_documento);
          const recipientAccount = findExpectedDigits(raw, cuentaDestino);
          const paisDestino = parsed?.paisDestino || null;
          const canalPago = parsed?.canalPago || null;
          const missing = [];
          if (!canalPago || !/yape/i.test(canalPago) || !/remesa/i.test(canalPago)) missing.push('Yape / Remesas');
          if (paisDestino !== 'Bolivia') missing.push('Bolivia');
          if (amount == null) missing.push('monto en soles');
          if (!operation) missing.push('número de orden/transacción');
          if (!dateIso) missing.push('fecha y hora');
          if (!recipientName) missing.push('nombre del beneficiario');
          if (!recipientDocument) missing.push('documento del beneficiario');
          if (!recipientAccount) missing.push('cuenta de destino');
          if (missing.length) {
            status.innerHTML = `<strong style="color:#DC2626;">Recibo incompleto.</strong><br>Falta reconocer: ${esc(missing.join(', '))}.<br><span style="color:#94A3B8;">Usa el recibo digital completo de Yape Remesas.</span>`;
            fileInput.value = ''; return;
          }
          let deviceId = null;
          try { deviceId = localStorage.getItem('notigas_device_id') || null; } catch (_) {}
          const { data: server, error: rpcError } = await window.supabaseClient.rpc('rpc_registrar_ocr_pago', {
            p_pago_id: pagoId,
            p_monto_enviado_pen: Number(amount), p_fecha_pago: dateIso, p_numero_transaccion: String(operation),
            p_destinatario_nombre: recipientName, p_destinatario_documento: recipientDocument, p_destinatario_yape: recipientAccount,
            p_pais_destino: paisDestino, p_canal_pago: canalPago,
            p_remitente_nombre: parsed?.remitenteNombre || null, p_remitente_dni: digits(parsed?.remitenteDni), p_remitente_yape: digits(parsed?.remitenteYape),
            p_device_id: deviceId, p_ocr_confianza: parsed?.confianza == null ? null : Number(parsed.confianza)
          });
          if (rpcError) throw rpcError;
          if (server?.estado === 'pendiente_verificacion_recepcion' && server?.ocr_valido === true) {
            status.innerHTML = `<strong style="color:#16A34A;">✓ Recibo aprobado automáticamente.</strong><br>Orden ${esc(operation)} · ${money(amount)}<br><span style="color:#CBD5E1;">Tu pago fue aplicado automáticamente${server?.reactivado ? ' y tu servicio fue reactivado' : ''}. Administración verificará posteriormente la llegada efectiva de la remesa a Bolivia.</span>`;
          } else {
            const checks = [server?.monto_valido === false ? 'monto' : null, server?.fecha_valida === false ? 'fecha/hora' : null,
              server?.transaccion_unica === false ? 'orden/transacción repetida' : null, server?.pais_destino_coincide === false ? 'país destino' : null,
              server?.canal_pago_coincide === false ? 'Yape Remesas' : null, server?.destinatario_nombre_coincide === false ? 'beneficiario' : null,
              server?.destinatario_documento_coincide === false ? 'documento beneficiario' : null, server?.destinatario_yape_coincide === false ? 'cuenta destino' : null].filter(Boolean);
            status.innerHTML = `<strong style="color:#DC2626;">✕ El recibo no superó la validación.</strong><br>${checks.length ? `Revisar: ${esc(checks.join(', '))}.` : 'Los datos no coinciden con el cobro generado.'}`;
          }
          fileInput.value = '';
        } catch (err) {
          if (status) status.innerHTML = `<strong style="color:#DC2626;">Error:</strong> ${esc(err.message || err)}`;
          if (fileInput) fileInput.value = '';
        }
      });
    } catch (err) { body.innerHTML = `<div style="padding:20px;color:#EF4444;">${esc(err.message || err)}</div>`; }
  }

  window.verMisPagos = verMisPagos;
  window.nuevoPago = nuevoPago;
  window.ensureDriverPaymentsMenu = ensureDriverMenu;
  const run = () => { ensureDriverMenu(); syncDriverMenuVisibility(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true }); else run();
  document.getElementById('btnOpenUserSettings')?.addEventListener('click', () => setTimeout(run, 0));
  if (typeof AppState !== 'undefined' && typeof AppState.on === 'function') { AppState.on('userRole', run); AppState.on('appMode', run); }
})();
