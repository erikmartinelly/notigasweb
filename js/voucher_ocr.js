/* ==========================================================================
   NOTIGAS - OCR LOCAL DE COMPROBANTES YAPE / REMESAS
   - OCR gratuito con Tesseract.js en el navegador.
   - La imagen NO se persiste: solo se envían datos estructurados al servidor.
   - El monto esperado proviene del cobro real generado por Supabase.
   ========================================================================== */
(function () {
  'use strict';

  let _tesseractLoading = null;

  async function obtenerTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (_tesseractLoading) return _tesseractLoading;
    _tesseractLoading = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => resolve(window.Tesseract || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
    return _tesseractLoading;
  }

  async function preprocesarImagenCanvas(fileOrBlob) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        const url = URL.createObjectURL(fileOrBlob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          let w = img.width;
          let h = img.height;
          const maxDim = 1800;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            const contrast = gray > 190 ? 255 : (gray < 65 ? 0 : gray);
            d[i] = contrast; d[i + 1] = contrast; d[i + 2] = contrast;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(fileOrBlob); };
        img.src = url;
      } catch (_) { resolve(fileOrBlob); }
    });
  }

  function limpiarTexto(value) {
    return String(value || '').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function extraerMonto(clean, expectedAmount = null) {
    const candidatos = [];
    const reMoneda = /(?:S\/?\.?|PEN|soles?)\s*[:=]?\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)/gi;
    let match;
    while ((match = reMoneda.exec(clean)) !== null) {
      const val = Number(String(match[1]).replace(',', '.'));
      if (Number.isFinite(val)) candidatos.push(val);
    }
    if (!candidatos.length) {
      const reDecimal = /\b([0-9]{1,6}[.,][0-9]{2})\b/g;
      while ((match = reDecimal.exec(clean)) !== null) {
        const val = Number(String(match[1]).replace(',', '.'));
        if (Number.isFinite(val)) candidatos.push(val);
      }
    }
    if (!candidatos.length) return null;
    const esperado = Number(expectedAmount);
    if (Number.isFinite(esperado) && esperado > 0) {
      candidatos.sort((a, b) => Math.abs(a - esperado) - Math.abs(b - esperado));
      return candidatos[0];
    }
    return candidatos[0];
  }

  function extraerOperacion(clean) {
    const patrones = [
      /(?:n[uú]mero\s+de\s+(?:orden|operaci[oó]n)|nro\.?\s*(?:orden|operaci[oó]n)|orden\s*(?:nro\.?|n[uú]mero)?|operaci[oó]n|c[oó]digo\s+de\s+operaci[oó]n|transacci[oó]n|referencia|ref\.?)[\s:#-]*([0-9A-Za-z-]{5,32})/i,
      /(?:id\s+de\s+(?:operaci[oó]n|transacci[oó]n|orden))[\s:#-]*([0-9A-Za-z-]{5,32})/i
    ];
    for (const re of patrones) {
      const m = clean.match(re);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  }

  function extraerFechaHoraPeru(rawText) {
    const text = String(rawText || '');
    const mFecha = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (!mFecha) return { fechaTexto: null, fechaISO: null, tieneHora: false };
    const mHora = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\b/i);
    if (!mHora) return { fechaTexto: mFecha[0], fechaISO: null, tieneHora: false };
    const dd = Number(mFecha[1]);
    const mm = Number(mFecha[2]);
    let yyyy = Number(mFecha[3]);
    if (yyyy < 100) yyyy += 2000;
    let hh = Number(mHora[1]);
    const min = Number(mHora[2]);
    const sec = Number(mHora[3] || 0);
    const ap = (mHora[4] || '').toLowerCase().replace(/[.\s]/g, '');
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    const pad = (n) => String(n).padStart(2, '0');
    return {
      fechaTexto: `${mFecha[0]} ${mHora[0]}`,
      fechaISO: `${yyyy}-${pad(mm)}-${pad(dd)}T${pad(hh)}:${pad(min)}:${pad(sec)}-05:00`,
      tieneHora: true
    };
  }

  function extraerDni(clean) {
    const labelled = clean.match(/(?:DNI|documento|doc\.?\s*identidad|c\.?i\.?)\s*[:#-]?\s*([0-9]{5,12})\b/i);
    return labelled?.[1] || null;
  }

  function extraerYapeRemitente(clean) {
    const patrones = [
      /(?:mi\s+yape|yape\s+remitente|celular|tel[eé]fono)[\s:#-]*(9[0-9]{8})\b/i,
      /(?:desde|de)[\s:#-]*(9[0-9]{8})\b/i
    ];
    for (const re of patrones) {
      const m = clean.match(re);
      if (m?.[1]) return m[1];
    }
    return null;
  }

  function extraerNombreRemitente(rawText) {
    const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const labels = /^(?:de|enviado\s+por|remitente)\s*[:\-]\s*(.+)$/i;
    for (const line of lines) {
      const m = line.match(labels);
      if (!m?.[1]) continue;
      const name = m[1].replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g, '').replace(/\s+/g, ' ').trim();
      if (name.length >= 5 && name.length <= 100) return name;
    }
    return null;
  }

  function parsearTextoVoucher(rawText, confidence = null, expectedAmount = null) {
    const clean = limpiarTexto(rawText);
    if (!clean) {
      return { rawText: '', monto: null, app: 'Desconocida', operacion: null, fecha: null, fechaISO: null,
        remitenteNombre: null, remitenteDni: null, remitenteYape: null, paisDestino: null, canalPago: null,
        confianza: confidence, esValido: false, resumen: 'No se detectó texto legible' };
    }
    const lower = clean.toLowerCase();
    const esYape = lower.includes('yape');
    const esRemesa = /remesa|remesas|env[ií]o\s+internacional|enviar\s+dinero/i.test(clean);
    const paisDestino = /\bbolivia\b/i.test(clean) ? 'Bolivia' : null;
    const canalPago = esYape && esRemesa ? 'Yape Remesas' : (esYape ? 'Yape' : null);
    const monto = extraerMonto(clean, expectedAmount);
    const operacion = extraerOperacion(clean);
    const fechaInfo = extraerFechaHoraPeru(rawText);
    const remitenteDni = extraerDni(clean);
    const remitenteYape = extraerYapeRemitente(clean);
    const remitenteNombre = extraerNombreRemitente(rawText);
    const camposMinimos = monto !== null && !!operacion && !!fechaInfo.fechaISO && esYape && esRemesa && paisDestino === 'Bolivia';
    const faltantes = [];
    if (!esYape) faltantes.push('Yape');
    if (!esRemesa) faltantes.push('Remesas');
    if (!paisDestino) faltantes.push('Bolivia');
    if (monto === null) faltantes.push('monto');
    if (!operacion) faltantes.push('número de orden/transacción');
    if (!fechaInfo.fechaISO) faltantes.push(fechaInfo.fechaTexto ? 'hora del pago' : 'fecha y hora');
    return {
      rawText: clean, monto, app: canalPago || 'Desconocida', operacion,
      fecha: fechaInfo.fechaTexto, fechaISO: fechaInfo.fechaISO,
      remitenteNombre, remitenteDni, remitenteYape, paisDestino, canalPago,
      confianza: confidence, esValido: Boolean(camposMinimos),
      resumen: camposMinimos
        ? `OCR completado: Yape Remesas a Bolivia, S/ ${monto.toFixed(2)}, orden ${operacion}.`
        : `OCR incompleto. Falta: ${faltantes.join(', ') || 'confirmar datos de la remesa'}.`
    };
  }

  async function leerYValidarVoucherOCR(imageFile, onProgress = null, options = {}) {
    if (!imageFile) return { esValido: false, resumen: 'Sin archivo de imagen', monto: null, operacion: null, fechaISO: null };
    if (!String(imageFile.type || '').startsWith('image/')) return { esValido: false, resumen: 'El comprobante debe ser una imagen', monto: null, operacion: null, fechaISO: null };
    try {
      onProgress?.({ status: 'preparando', message: 'Preparando recibo digital localmente...' });
      const processedSrc = await preprocesarImagenCanvas(imageFile);
      onProgress?.({ status: 'cargando_ocr', message: 'Iniciando OCR del recibo Yape...' });
      const Tesseract = await obtenerTesseract();
      if (!Tesseract) return { esValido: false, resumen: 'OCR no disponible. No se guardó la imagen.', monto: null, operacion: null, fechaISO: null };
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera OCR agotado')), 22000));
      const ocrPromise = Tesseract.recognize(processedSrc, 'spa+eng', {
        logger: (m) => {
          if (m?.status === 'recognizing text' && onProgress) {
            const pct = Math.round((m.progress || 0) * 100);
            onProgress({ status: 'progreso', pct, message: `Leyendo recibo (${pct}%)...` });
          }
        }
      });
      const result = await Promise.race([ocrPromise, timeoutPromise]);
      const rawText = result?.data?.text || '';
      const confidence = Number.isFinite(result?.data?.confidence) ? Number(result.data.confidence) : null;
      const parsed = parsearTextoVoucher(rawText, confidence, options?.expectedAmount ?? null);
      onProgress?.({ status: 'completado', esValido: parsed.esValido, message: parsed.resumen });
      return parsed;
    } catch (err) {
      return { esValido: false, resumen: `No se pudo completar OCR: ${err?.message || 'error desconocido'}. La imagen no fue almacenada.`, monto: null, operacion: null, fechaISO: null };
    }
  }

  window.leerYValidarVoucherOCR = leerYValidarVoucherOCR;
  window.parsearTextoVoucher = parsearTextoVoucher;
})();
