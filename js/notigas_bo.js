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
    { codigo: 'frutas',       etiqueta: '🍎 Frutas & Verduras',         chip: 'Frutas',     grupo: 'recolector',  icono: '🍎',  color: '#EF4444', tipo_solicitud: 'recogida' },
    { codigo: 'detergentes',  etiqueta: '🧽 Detergentes & Limpieza',     chip: 'Detergentes', grupo: 'compra',     icono: '🧽',  color: '#0EA5E9', tipo_solicitud: 'compra' },
    { codigo: 'sal',          etiqueta: '🧂 Sal',                        chip: 'Sal',        grupo: 'compra',      icono: '🧂',  color: '#E2E8F0', tipo_solicitud: 'compra' },
    { codigo: 'afilado',      etiqueta: '🔪 Afilado de Cuchillos',       chip: 'Afilado',    grupo: 'compra',      icono: '🔪',  color: '#A78BFA', tipo_solicitud: 'compra' },
    { codigo: 'agua',         etiqueta: '💧 Agua Purificada 20L',        chip: 'Agua 20L',   grupo: 'distribucion', icono: '💧', color: '#60A5FA', tipo_solicitud: 'compra' },
    { codigo: 'otros',        etiqueta: '📦 Otros Pedidos',              chip: 'Otros',      grupo: 'compra',      icono: '📦',  color: '#F472B6', tipo_solicitud: 'compra' }
  ];

  const CODIGOS_CATEGORIA = CATEGORIAS.map((c) => c.codigo);

  const CATEGORIAS_POR_CODIGO = CATEGORIAS.reduce((acc, c) => { acc[c.codigo] = c; return acc; }, {});

  /* Categorías que aparecen según el tipo de solicitud elegido. El grupo
     "recolector" es el de las recogidas; "compra" y "distribucion" el de
     las compras. */
  const categoriasPorTipo = (tipo) => CATEGORIAS.filter(
    (c) => (tipo === 'recogida' ? c.grupo === 'recolector' : c.grupo !== 'recolector')
  );

  const categoriaPorCodigo = (codigo) =>
    CATEGORIAS_POR_CODIGO[String(codigo || '').toLowerCase().trim()] || CATEGORIAS[0];

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

    /* LETRERO DEL MAPA ------------------------------------------------------
       Se pinta desde CATEGORIAS para que la leyenda y los pines compartan una
       sola fuente de verdad: si manana se agrega o cambia una categoria, el
       letrero se actualiza solo. */
    function pintarLetreroMapa() {
      const panel = document.getElementById('mapaLetrero');
      if (!panel) return;
      const contRecogida = document.getElementById('mapaLetreroRecogida');
      const contCompra = document.getElementById('mapaLetreroCompra');
      if (!contRecogida || !contCompra) return;

      const chip = (cat) => {
        const el = document.createElement('span');
        el.className = 'mapa-letrero__chip';
        el.style.color = cat.color;
        el.textContent = cat.icono + ' ' + cat.etiqueta;
        return el;
      };

      const encabezado = (texto) => {
        const h = document.createElement('p');
        h.className = 'mapa-letrero__etiqueta-grupo';
        h.textContent = texto;
        return h;
      };

      contRecogida.textContent = '';
      contCompra.textContent = '';

      contRecogida.appendChild(encabezado('Recoger en tu casa'));
      CATEGORIAS
        .filter(c => c.tipo_solicitud === 'recogida')
        .forEach(c => contRecogida.appendChild(chip(c)));

      contCompra.appendChild(encabezado('Te lo llevamos'));
      CATEGORIAS
        .filter(c => c.tipo_solicitud === 'compra')
        .forEach(c => contCompra.appendChild(chip(c)));

      const btn = document.getElementById('mapaLetreroToggle');
      if (btn && !btn.dataset.wired) {
        btn.dataset.wired = '1';
        btn.addEventListener('click', () => {
          const abierto = panel.dataset.abierto !== 'false';
          panel.dataset.abierto = abierto ? 'false' : 'true';
          btn.setAttribute('aria-expanded', abierto ? 'false' : 'true');
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', pintarLetreroMapa, { once: true });
    } else {
      pintarLetreroMapa();
    }
    window.pintarLetreroMapa = pintarLetreroMapa;
  })();
