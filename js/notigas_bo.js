/* ==========================================================================
   NOTIGAS - CONFIGURACIÓN CENTRAL DE BOLIVIA
   - País: Bolivia · Cochabamba
   - Moneda: bolivianos (Bs / BOB) · es-BO
   - Teléfono: +591 (8 dígitos, prefijo móvil 6 u 7)
   - Documento: CI (cédula de identidad) o NIT
   - Pagos: solo QR local (Simple / Banesco QR). Sin comisión por cobro.
   - Categorías: primero los recolectores (chatarra, papel, botellas,
     plástico y orgánico); al final detergentes.
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

  /* Catálogo canónico NOTIGAS Bolivia. Fuente única de verdad: el servidor
     replica esta misma lista en notigas_catalogo_categorias() y la valida
     con el CHECK pedidos_categoria_catalogo_chk.

     Orden de producto: primero el material que las casas ofrecen para que
     sea recogido, después las compras y por último "Otros".

     tipo_solicitud:
       'recogida' -> la casa publica el material y el repartidor va a buscarlo.
       'compra'   -> el comprador pide que le lleven el producto.
     El servidor lo re-deriva desde la categoría; aquí solo ordena la UI. */
  const CATEGORIAS = [
    { codigo: 'plastico',     etiqueta: '♻️  Plástico',                  chip: 'Plástico',   grupo: 'recolector',  icono: '♻️',  color: '#22C55E', tipo_solicitud: 'recogida' },
    { codigo: 'papel',        etiqueta: '📄 Papel / Cartón',            chip: 'Papel',      grupo: 'recolector',  icono: '📄',  color: '#F59E0B', tipo_solicitud: 'recogida' },
    { codigo: 'chatarra',     etiqueta: '⚙️  Chatarra',                  chip: 'Chatarra',   grupo: 'recolector',  icono: '⚙️',  color: '#94A3B8', tipo_solicitud: 'recogida' },
    { codigo: 'botellas',     etiqueta: '🥤 Botellas Plástico / Vidrio', chip: 'Botellas',  grupo: 'recolector',  icono: '🥤',  color: '#38BDF8', tipo_solicitud: 'recogida' },
    { codigo: 'organico',     etiqueta: '🌿 Orgánico Seleccionado',      chip: 'Orgánico',   grupo: 'recolector',  icono: '🌿',  color: '#84CC16', tipo_solicitud: 'recogida' },
    { codigo: 'detergentes',  etiqueta: '🧽 Detergentes & Limpieza',     chip: 'Detergentes', grupo: 'compra',     icono: '🧽',  color: '#0EA5E9', tipo_solicitud: 'compra' }
  ];

  const CODIGOS_CATEGORIA = CATEGORIAS.map((c) => c.codigo);

  const CATEGORIAS_POR_CODIGO = CATEGORIAS.reduce((acc, c) => { acc[c.codigo] = c; return acc; }, {});

  /* Categorías que aparecen según el tipo de solicitud elegido. El grupo
     "recolector" es el de las recogidas; "compra" agrupa los productos que
     el recolector lleva al domicilio (hoy solo detergentes). */
  const categoriasPorTipo = (tipo) => CATEGORIAS.filter(
    (c) => (tipo === 'recogida' ? c.grupo === 'recolector' : c.grupo !== 'recolector')
  );

  const categoriaPorCodigo = (codigo) =>
    CATEGORIAS_POR_CODIGO[String(codigo || '').toLowerCase().trim()] || CATEGORIAS[0];

  const PAGO = {
    /* NOTIGAS es gratuito: no cobra cuota, ni suscripcion, ni comision, y no
       intermedia fondos. El precio y el acuerdo entre el vecino y el recolector
       se coordinan fuera de la plataforma. */
    comisionActiva: false,
    montoCiclo: null,
    metodo: 'acuerdo_directo',
    metodoEtiqueta: 'Acuerdo directo entre las partes',
    metodosAceptados: [],
    pais: 'Bolivia',
    requiereComprobante: false
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
    categoriasPorTipo,
    categoriaPorCodigo,
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

    /* Ya no hay letrero sobre el mapa: tapaba la vista y la lista de categorías
       vive en el submenú de pedidos, junto al botón de pedir. Los pines siguen
       usando CATEGORIAS para su icono, asi que la fuente de verdad no cambia. */
  })();
