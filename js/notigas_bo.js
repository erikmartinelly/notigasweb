/* ==========================================================================
   NOTIGAS - CONFIGURACIÓN CENTRAL DE BOLIVIA
   - País: Bolivia · Cochabamba
   - Moneda: bolivianos (Bs / BOB) · es-BO
   - Teléfono: +591 (8 dígitos, prefijo móvil 6 u 7)
   - Documento: CI (cédula de identidad) o NIT
   - Pagos: solo QR local (Simple / Banesco QR). Sin comisión por cobro.
   - Categorías: primero los recolectores (chatarra, papel, botellas);
     al final agua, detergentes, frutas/verduras y otros.
   ========================================================================== */
(function () {
  'use strict';

  const PAIS = {
    nombre: 'Bolivia',
    nombreCorto: 'BO',
    codigo: 'BO',
    iso2: 'BO',
    prefijoTelefono: '591',
    dialing: '+591',
    bandera: '🇧🇴',
    locale: 'es-BO',
    timeZone: 'America/La_Paz',
    moneda: 'BOB',
    simbolo: 'Bs',
    monedaNombre: 'bolivianos',
    monedaNombreSingular: 'boliviano',
    lat: -17.3895,
    lng: -66.1568,
    radioAceptado: 600,
    documento: 'CI o NIT',
    documentoCorto: 'CI/NIT'
  };

  const CIUDAD_PREDETERMINADA = 'cochabamba';

  /* Orden canónico de categorías. Los recolectores van primero; los pedidos
     de agua, detergentes, frutas/verduras y otros, al final. */
  const CATEGORIAS = [
    { codigo: 'chatarra',    etiqueta: '♻️  Chatarra',                  chip: 'Chatarra',   grupo: 'recolector',  icono: '♻️' },
    { codigo: 'papel',       etiqueta: '📄 Papel / Cartón',            chip: 'Papel',      grupo: 'recolector',  icono: '📄' },
    { codigo: 'botellas',    etiqueta: '🥤 Botellas Plástico / Vidrio', chip: 'Botellas',  grupo: 'recolector',  icono: '🥤' },
    { codigo: 'gas',         etiqueta: '🔥 Gas GLP',                    chip: 'Gas GLP',    grupo: 'distribucion', icono: '🔥' },
    { codigo: 'carbon',      etiqueta: '🪵 Carbón / Leña',              chip: 'Carbón',     grupo: 'distribucion', icono: '🪵' },
    { codigo: 'agua',        etiqueta: '💧 Agua 20L',                   chip: 'Agua 20L',   grupo: 'compra',      icono: '💧' },
    { codigo: 'detergentes', etiqueta: '🧽 Detergentes & Limpieza',     chip: 'Detergentes', grupo: 'compra',      icono: '🧽' },
    { codigo: 'frutas',      etiqueta: '🍎 Frutas & Verduras',         chip: 'Frutas',     grupo: 'compra',      icono: '🍎' },
    { codigo: 'otros',       etiqueta: '📦 Otros Pedidos',              chip: 'Otros',      grupo: 'compra',      icono: '📦' }
  ];

  const CODIGOS_CATEGORIA = CATEGORIAS.map((c) => c.codigo);

  const CATEGORIAS_POR_CODIGO = CATEGORIAS.reduce((acc, c) => { acc[c.codigo] = c; return acc; }, {});

  const PAGO = {
    /* Sin cobro: NOTIGAS no retiene comisión por generar, escanear ni
       procesar un pago con QR. El monto del ciclo queda por configurar. */
    comisionActiva: false,
    montoCiclo: null,
    metodo: 'qr_local',
    metodoEtiqueta: 'QR local (Simple / Banesco QR)',
    metodosAceptados: ['Simple', 'Banesco QR'],
    pais: 'Bolivia',
    requiereComprobante: true
  };

  const money = (value, opciones = {}) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${opciones.simbolo ?? PAIS.simbolo} ${n.toLocaleString(PAIS.locale, {
      minimumFractionDigits: opciones.decimales ?? 2,
      maximumFractionDigits: opciones.decimales ?? 2
    })}`;
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(PAIS.locale, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) { return String(value); }
  };

  const onlyDigits = (value) => String(value || '').replace(/[^0-9]/g, '');

  /* Teléfono boliviano: 8 dígitos nationally; se acepta +591 / 591 / 0XX
     y se normaliza a los 8 dígitos locales. */
  const normalizarTelefono = (value) => {
    let d = onlyDigits(value);
    if (d.startsWith('591') && d.length > 8) d = d.slice(3);
    if (d.startsWith('0') && d.length > 8) d = d.slice(1);
    return d;
  };

  const esTelefonoValido = (value) => {
    const d = normalizarTelefono(value);
    return d.length === 8;
  };

  const whatsappUrl = (value, texto = '') => {
    const d = normalizarTelefono(value);
    if (!d) return '';
    const base = `https://wa.me/${PAIS.prefijoTelefono}${d}`;
    return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
  };

  /* CI boliviano: 4 a 10 dígitos. NIT: 10 a 13 dígitos y con sufijo. */
  const normalizarDocumento = (value) => onlyDigits(value).slice(0, 13);

  const esDocumentoValido = (value) => {
    const d = onlyDigits(value);
    if (d.length >= 4 && d.length <= 10) return true;
    return d.length >= 10 && d.length <= 13;
  };

  const estaEnBolivia = (lat, lng) => {
    const la = Number(lat); const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
    return la >= -22.95 && la <= -9.85 && ln >= -69.65 && ln <= -57.45;
  };

  window.NOTIGAS_BO = {
    PAIS,
    CIUDAD_PREDETERMINADA,
    CATEGORIAS,
    CODIGOS_CATEGORIA,
    CATEGORIAS_POR_CODIGO: CATEGORIAS_POR_CODIGO,
    PAGO,
    money,
    formatDateTime,
    onlyDigits,
    normalizarTelefono,
    esTelefonoValido,
    whatsappUrl,
    normalizarDocumento,
    esDocumentoValido,
    estaEnBolivia
  };

  /* Atajos de uso frecuente en el resto de módulos. */
  window.boMoney = money;
  window.boDateTime = formatDateTime;
  window.boWhatsappUrl = whatsappUrl;
})();
