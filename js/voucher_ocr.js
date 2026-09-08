/* ==========================================================================
   NOTIGAS - MÓDULO DE LECTURA Y VALIDACIÓN AUTOMÁTICA DE VOUCHERS CON OCR
   ========================================================================== */

(function() {
  'use strict';

  let _tesseractWorker = null;
  let _tesseractLoading = null;

  /**
   * Carga dinámica de Tesseract.js desde CDN solo cuando sea necesario.
   */
  async function obtenerTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (_tesseractLoading) return _tesseractLoading;

    _tesseractLoading = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => {
        console.log('✅ [OCR] Tesseract.js inicializado correctamente.');
        resolve(window.Tesseract);
      };
      script.onerror = (err) => {
        console.warn('⚠️ [OCR] No se pudo cargar Tesseract.js desde CDN:', err);
        resolve(null);
      };
      document.head.appendChild(script);
    });

    return _tesseractLoading;
  }

  /**
   * Preprocesa una imagen (contraste + escala de grises) usando Canvas para mejorar precisión de OCR.
   */
  async function preprocesarImagenCanvas(fileOrBlob) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        const url = URL.createObjectURL(fileOrBlob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          let w = img.width;
          let h = img.height;
          const maxDim = 1200;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);

          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          // Escala de grises + realce de contraste
          for (let i = 0; i < d.length; i += 4) {
            const gray = (d[i] * 0.299) + (d[i + 1] * 0.587) + (d[i + 2] * 0.114);
            // Umbral suave para texto oscuro sobre fondo claro o viceversa
            const contrast = gray > 140 ? 255 : (gray < 80 ? 0 : gray);
            d[i] = contrast;
            d[i + 1] = contrast;
            d[i + 2] = contrast;
          }
          ctx.putImageData(imgData, 0, 0);

          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(fileOrBlob);
        img.src = url;
      } catch (_) {
        resolve(fileOrBlob);
      }
    });
  }

  /**
   * Analiza el texto en bruto para extraer monto, plataforma, número de operación y validez.
   */
  function parsearTextoVoucher(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return {
        rawText: '',
        monto: null,
        app: 'Desconocida',
        operacion: null,
        fecha: null,
        esValido: false,
        resumen: 'No se detecto texto legible'
      };
    }

    const clean = rawText.replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const lower = clean.toLowerCase();

    // 1. Detectar Billetera / Remesa
    let app = 'Remesa por Yape';
    if (lower.includes('remesa') && lower.includes('yape')) {
      app = 'Remesa por Yape';
    } else if (lower.includes('remesa')) {
      app = 'Remesa por Yape';
    } else if (lower.includes('yape')) {
      app = 'Remesa por Yape';
    } else if (lower.includes('plin')) {
      app = 'Plin';
    } else if (lower.includes('takenos')) {
      app = 'Takenos';
    } else if (lower.includes('bcp') || lower.includes('credito') || lower.includes('crédito')) {
      app = 'BCP';
    } else if (lower.includes('bbva') || lower.includes('continental')) {
      app = 'BBVA';
    } else if (lower.includes('interbank')) {
      app = 'Interbank';
    } else if (lower.includes('scotiabank')) {
      app = 'Scotiabank';
    } else if (lower.includes('nacion') || lower.includes('nación')) {
      app = 'Banco de la Nación';
    } else if (lower.includes('transferencia') || lower.includes('constancia') || lower.includes('pago')) {
      app = 'Transferencia Bancaria';
    }

    // 2. Detectar Monto (Buscamos S/ 15, S/ 15.00, 15.00 o similar)
    let monto = null;
    // Regex para montos monetarios con moneda
    const currencyMatches = clean.match(/(?:s\/?\.?|pen|usd|\$)\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi);
    if (currencyMatches) {
      for (const m of currencyMatches) {
        const numStr = m.replace(/[^0-9.,]/g, '').replace(',', '.');
        const val = parseFloat(numStr);
        if (!isNaN(val)) {
          monto = val;
          if (Math.abs(val - 15) <= 0.5) break; // Coincidencia exacta de S/ 15
        }
      }
    }

    // Si no encontró con símbolo, buscar números decimales aislados
    if (monto === null) {
      const numberMatches = clean.match(/\b([0-9]{1,3}(?:[.,][0-9]{2}))\b/g);
      if (numberMatches) {
        for (const n of numberMatches) {
          const val = parseFloat(n.replace(',', '.'));
          if (!isNaN(val)) {
            monto = val;
            if (Math.abs(val - 15) <= 0.5) break;
          }
        }
      }
    }

    // Si el texto incluye explícitamente el número 15 junto a pago/yape/plin
    if (monto === null && /\b15\b/.test(clean)) {
      monto = 15.0;
    }

    // 3. Detectar Número de Operación / Referencia
    let operacion = null;
    const opRegex = /(?:operaci[oó]n|op|ref|referencia|nro|c[oó]digo|codigo)[\s:#.]*([0-9A-Za-z-]{4,18})/i;
    const opMatch = clean.match(opRegex);
    if (opMatch && opMatch[1]) {
      operacion = opMatch[1].trim();
    } else {
      // Búsqueda de secuencia numérica larga típica de operación (6 a 12 dígitos)
      const digitsMatch = clean.match(/\b([0-9]{7,12})\b/);
      if (digitsMatch && digitsMatch[1]) {
        operacion = digitsMatch[1];
      }
    }

    // 4. Detectar Fecha
    let fecha = null;
    const dateMatch = clean.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
    if (dateMatch && dateMatch[1]) {
      fecha = dateMatch[1];
    }

    // 5. Criterio de Validación Automática:
    // Es válido si detectó monto de S/ 15 (o aprox) Y tiene palabras de pago o billetera
    const tieneMonto15 = (monto !== null && Math.abs(monto - 15) <= 1.0);
    const tienePalabrasPago = /remesa|giro|yape|plin|takenos|bcp|bbva|interbank|scotiabank|transferencia|pago|enviaste|constancia|exitoso|operaci[oó]n|comprobante|recibo|soles/i.test(clean);

    const esValido = tieneMonto15 && tienePalabrasPago;

    let resumen = '';
    if (esValido) {
      resumen = `Voucher ${app} validado automáticamente (S/ ${monto ? monto.toFixed(2) : '15.00'})`;
    } else if (tienePalabrasPago) {
      resumen = `Comprobante ${app} detectado. Monto: ${monto ? 'S/ ' + monto.toFixed(2) : 'no precisado'} (Sujeto a verificación)`;
    } else {
      resumen = 'Texto detectado pero no se confirmaron datos de pago S/ 15';
    }

    return {
      rawText: clean,
      monto: monto,
      app: app,
      operacion: operacion,
      fecha: fecha,
      esValido: esValido,
      resumen: resumen
    };
  }

  /**
   * Ejecuta el OCR sobre una imagen (archivo File o Blob) y retorna los datos analizados.
   */
  async function leerYValidarVoucherOCR(imageFile, onProgress = null) {
    if (!imageFile) {
      return { esValido: false, resumen: 'Sin archivo de imagen', monto: null, app: null, operacion: null, rawText: '' };
    }

    try {
      if (onProgress) onProgress({ status: 'preparando', message: 'Preprocesando imagen...' });
      const processedSrc = await preprocesarImagenCanvas(imageFile);

      if (onProgress) onProgress({ status: 'cargando_ocr', message: 'Iniciando motor de lectura OCR...' });
      const Tesseract = await obtenerTesseract();

      if (!Tesseract) {
        console.warn('[OCR] Tesseract no disponible. Se omitira lectura OCR y se activara por subida directa.');
        return {
          esValido: false,
          monto: 15.0,
          app: 'Comprobante QR',
          operacion: null,
          rawText: 'OCR no disponible en este navegador/red',
          resumen: 'Comprobante subido directamente'
        };
      }

      if (onProgress) onProgress({ status: 'analizando', message: 'Extrayendo texto del comprobante...' });

      // Ejecutar OCR con timeout de seguridad de 9 segundos
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera OCR agotado')), 9000);
      });

      const ocrPromise = Tesseract.recognize(processedSrc, 'spa+eng', {
        logger: (m) => {
          if (m && m.status === 'recognizing text' && onProgress) {
            const pct = Math.round((m.progress || 0) * 100);
            onProgress({ status: 'progreso', pct: pct, message: `Leyendo comprobante (${pct}%)...` });
          }
        }
      });

      const ocrResult = await Promise.race([ocrPromise, timeoutPromise]);
      const rawText = ocrResult?.data?.text || '';

      console.log('📄 [OCR RAW TEXT]:', rawText.substring(0, 300));
      const parsed = parsearTextoVoucher(rawText);

      if (onProgress) {
        onProgress({
          status: 'completado',
          esValido: parsed.esValido,
          message: parsed.resumen
        });
      }

      return parsed;
    } catch (err) {
      console.warn('⚠️ [OCR Error / Timeout]:', err.message);
      return {
        esValido: false,
        monto: 15.0,
        app: 'Comprobante QR',
        operacion: null,
        rawText: 'Error o timeout de lectura OCR: ' + err.message,
        resumen: 'Comprobante subido (revisión manual requerida)'
      };
    }
  }

  // Exports globales
  window.leerYValidarVoucherOCR = leerYValidarVoucherOCR;
  window.parsearTextoVoucher = parsearTextoVoucher;

})();
