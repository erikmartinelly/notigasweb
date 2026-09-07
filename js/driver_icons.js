/* ==========================================================================
   NOTIGAS - MOTOR DINÁMICO DE ÍCONOS DE CAMIONES TOYOTA DINA MULTICOLORES
   Y PERSONALIZACIÓN DE INICIALES PARA REPARTIDORES
   ========================================================================== */

(function() {
  const PALETTE = [
  {
    "key": "rojo",
    "name": "Rojo Pasi\u00f3n",
    "primary": "#E11D48",
    "dark": "#9F1239",
    "light": "#FB7185",
    "badgeBg": "#BE123C",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FECDD3"
  },
  {
    "key": "azul",
    "name": "Azul Real",
    "primary": "#2563EB",
    "dark": "#1D4ED8",
    "light": "#60A5FA",
    "badgeBg": "#1E40AF",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#BFDBFE"
  },
  {
    "key": "verde",
    "name": "Verde Esmeralda",
    "primary": "#059669",
    "dark": "#047857",
    "light": "#34D399",
    "badgeBg": "#065F46",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#A7F3D0"
  },
  {
    "key": "naranja",
    "name": "Naranja Fuego",
    "primary": "#EA580C",
    "dark": "#C2410C",
    "light": "#FB923C",
    "badgeBg": "#9A3412",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FED7AA"
  },
  {
    "key": "amarillo",
    "name": "Amarillo \u00c1mbar",
    "primary": "#EAB308",
    "dark": "#CA8A04",
    "light": "#FDE047",
    "badgeBg": "#A16207",
    "badgeText": "#0F172A",
    "badgeBorder": "#FEF08A"
  },
  {
    "key": "morado",
    "name": "Morado P\u00farpura",
    "primary": "#9333EA",
    "dark": "#7E22CE",
    "light": "#C084FC",
    "badgeBg": "#6B21A8",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#E9D5FF"
  },
  {
    "key": "cian",
    "name": "Cian El\u00e9ctrico",
    "primary": "#06B6D4",
    "dark": "#0891B2",
    "light": "#67E8F9",
    "badgeBg": "#0E7490",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#CFFAFE"
  },
  {
    "key": "magenta",
    "name": "Magenta Ne\u00f3n",
    "primary": "#DB2777",
    "dark": "#BE185D",
    "light": "#F472B6",
    "badgeBg": "#9D174D",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FCE7F3"
  },
  {
    "key": "lima",
    "name": "Verde Lima",
    "primary": "#65A30D",
    "dark": "#4D7C0F",
    "light": "#A3E635",
    "badgeBg": "#3F6212",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#ECFCCB"
  },
  {
    "key": "cobalto",
    "name": "Azul Cobalto",
    "primary": "#1E40AF",
    "dark": "#1E3A8A",
    "light": "#3B82F6",
    "badgeBg": "#172554",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#93C5FD"
  },
  {
    "key": "violeta",
    "name": "Violeta Intenso",
    "primary": "#7C3AED",
    "dark": "#6D28D9",
    "light": "#A78BFA",
    "badgeBg": "#5B21B6",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#DDD6FE"
  },
  {
    "key": "turquesa",
    "name": "Turquesa Oc\u00e9ano",
    "primary": "#0D9488",
    "dark": "#0F766E",
    "light": "#2DD4BF",
    "badgeBg": "#115E59",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#99F6E4"
  },
  {
    "key": "bronce",
    "name": "Bronce Met\u00e1lico",
    "primary": "#B45309",
    "dark": "#92400E",
    "light": "#F59E0B",
    "badgeBg": "#78350F",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FDE68A"
  },
  {
    "key": "grafito",
    "name": "Grafito Espacial",
    "primary": "#475569",
    "dark": "#334155",
    "light": "#94A3B8",
    "badgeBg": "#1E293B",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#CBD5E1"
  },
  {
    "key": "rubi",
    "name": "Rojo Rub\u00ed",
    "primary": "#DC2626",
    "dark": "#B91C1C",
    "light": "#F87171",
    "badgeBg": "#991B1B",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FECACA"
  },
  {
    "key": "cielo",
    "name": "Azul Cielo",
    "primary": "#0284C7",
    "dark": "#0369A1",
    "light": "#38BDF8",
    "badgeBg": "#075985",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#BAE6FD"
  },
  {
    "key": "bosque",
    "name": "Verde Bosque",
    "primary": "#166534",
    "dark": "#14532D",
    "light": "#22C55E",
    "badgeBg": "#052E16",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#86EFAC"
  },
  {
    "key": "tangerina",
    "name": "Naranja Tangerina",
    "primary": "#F97316",
    "dark": "#EA580C",
    "light": "#FDBA74",
    "badgeBg": "#C2410C",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FED7AA"
  },
  {
    "key": "fucsia",
    "name": "Fucsia Radiante",
    "primary": "#D946EF",
    "dark": "#C026D3",
    "light": "#F0ABFC",
    "badgeBg": "#A21CAF",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#F5D0FE"
  },
  {
    "key": "indigo",
    "name": "\u00cdndigo Profundo",
    "primary": "#4F46E5",
    "dark": "#4338CA",
    "light": "#818CF8",
    "badgeBg": "#3730A3",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#C7D2FE"
  },
  {
    "key": "menta",
    "name": "Verde Menta",
    "primary": "#10B981",
    "dark": "#059669",
    "light": "#6EE7B7",
    "badgeBg": "#047857",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#D1FAE5"
  },
  {
    "key": "cobre",
    "name": "Cobre Brillante",
    "primary": "#C2410C",
    "dark": "#9A3412",
    "light": "#FB923C",
    "badgeBg": "#7C2D12",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FFEDD5"
  },
  {
    "key": "titanio",
    "name": "Gris Titanio",
    "primary": "#64748B",
    "dark": "#475569",
    "light": "#94A3B8",
    "badgeBg": "#334155",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#E2E8F0"
  },
  {
    "key": "mostaza",
    "name": "Amarillo Mostaza",
    "primary": "#D97706",
    "dark": "#B45309",
    "light": "#FBBF24",
    "badgeBg": "#92400E",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FEF3C7"
  },
  {
    "key": "rosa",
    "name": "Rosa Carmes\u00ed",
    "primary": "#F43F5E",
    "dark": "#E11D48",
    "light": "#FDA4AF",
    "badgeBg": "#BE123C",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FFE4E6"
  },
  {
    "key": "ultramar",
    "name": "Azul Ultramar",
    "primary": "#3B82F6",
    "dark": "#1D4ED8",
    "light": "#93C5FD",
    "badgeBg": "#1E40AF",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#DBEAFE"
  },
  {
    "key": "jade",
    "name": "Verde Jade",
    "primary": "#047857",
    "dark": "#064E3B",
    "light": "#10B981",
    "badgeBg": "#022C22",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#6EE7B7"
  },
  {
    "key": "siena",
    "name": "Tierra Siena",
    "primary": "#854D0E",
    "dark": "#713F12",
    "light": "#CA8A04",
    "badgeBg": "#542D08",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FEF08A"
  },
  {
    "key": "lavanda",
    "name": "Lavanda Real",
    "primary": "#8B5CF6",
    "dark": "#6D28D9",
    "light": "#C4B5FD",
    "badgeBg": "#5B21B6",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#EDE9FE"
  },
  {
    "key": "aguamarina",
    "name": "Aguamarina",
    "primary": "#14B8A6",
    "dark": "#0F766E",
    "light": "#5EEAD4",
    "badgeBg": "#115E59",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#CCFBF1"
  },
  {
    "key": "noche",
    "name": "Azul Medianoche",
    "primary": "#1E3A8A",
    "dark": "#172554",
    "light": "#3B82F6",
    "badgeBg": "#0F172A",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#60A5FA"
  },
  {
    "key": "borgona",
    "name": "Borgo\u00f1a Intenso",
    "primary": "#881337",
    "dark": "#4C0519",
    "light": "#BE123C",
    "badgeBg": "#360210",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FDA4AF"
  },
  {
    "key": "manzana",
    "name": "Verde Manzana",
    "primary": "#84CC16",
    "dark": "#65A30D",
    "light": "#BEF264",
    "badgeBg": "#3F6212",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#F7FEE7"
  },
  {
    "key": "coral",
    "name": "Coral Tropical",
    "primary": "#FB923C",
    "dark": "#EA580C",
    "light": "#FDBA74",
    "badgeBg": "#9A3412",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#FFEDD5"
  },
  {
    "key": "plata",
    "name": "Plata Cromado",
    "primary": "#94A3B8",
    "dark": "#64748B",
    "light": "#E2E8F0",
    "badgeBg": "#475569",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#F8FAFC"
  },
  {
    "key": "purpura",
    "name": "P\u00farpura Profundo",
    "primary": "#581C87",
    "dark": "#3B0764",
    "light": "#7E22CE",
    "badgeBg": "#2E0854",
    "badgeText": "#FFFFFF",
    "badgeBorder": "#C084FC"
  }
];

  const PALETTE_MAP = {};
  PALETTE.forEach(c => {
    PALETTE_MAP[c.key] = c;
  });

  window.NOTIGAS_TRUCK_PALETTE = PALETTE;

  /**
   * Extrae 1 o 2 iniciales limpias y legibles del nombre del repartidor.
   * Ej: "Juan Pérez" -> "JP", "Carlos Mendoza Quispe" -> "CM", "Alberto" -> "AL"
   */
  function getDriverInitials(name) {
    if (!name || typeof name !== 'string') return 'R';
    let clean = name
      .replace(/\b(repartidor|chofer|distribuidora|gas|otb|don|sr|sra|empresa|comercial)\b/gi, '')
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '')
      .trim();

    if (!clean) clean = name.replace(/[^a-zA-Z]/g, '').trim() || 'R';

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    if (words.length === 1 && words[0].length >= 2) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return (clean[0] || 'R').toUpperCase();
  }
  window.getDriverInitials = getDriverInitials;

  /**
   * Obtiene de forma determinista el tema de color del repartidor a partir de su ID o nombre,
   * o utiliza su color preferido si fue configurado en su ficha.
   */
  function getDriverColorTheme(keyOrName, preferredColorKey) {
    if (preferredColorKey && PALETTE_MAP[preferredColorKey.toLowerCase().trim()]) {
      return PALETTE_MAP[preferredColorKey.toLowerCase().trim()];
    }

    const str = String(keyOrName || 'notigas').toLowerCase().trim();
    // Algoritmo Hash DJB2 mejorado para distribución uniforme en la paleta de 36 colores
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % PALETTE.length;
    return PALETTE[idx];
  }
  window.getDriverColorTheme = getDriverColorTheme;

  /**
   * Genera el código SVG vectorial del camión Toyota Dina personalizado con el color e iniciales.
   */
  function generarSvgCamionDina(opts = {}) {
    const name = opts.name || opts.driverName || 'Repartidor';
    const initials = opts.initials || getDriverInitials(name);
    const theme = (opts.color && PALETTE_MAP[opts.color]) ? PALETTE_MAP[opts.color] : getDriverColorTheme(opts.id || name, opts.color);
    const withBg = !!opts.withBg;
    const uid = 't_' + Math.random().toString(36).substr(2, 6);

    const p = theme.primary;
    const d = theme.dark;
    const l = theme.light;
    const bgP = theme.badgeBg;
    const bgT = theme.badgeText;
    const bgB = theme.badgeBorder;
    const initStr = (initials || 'R').slice(0, 2).toUpperCase();
    const fontSize = initStr.length > 1 ? 26 : 34;

    const viewBox = withBg ? "0 0 512 512" : "60 130 400 240";
    const wAttr = opts.width ? `width="${opts.width}"` : '';
    const hAttr = opts.height ? `height="${opts.height}"` : '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${wAttr} ${hAttr} class="dina-truck-svg" style="display:block; max-width:100%; height:auto;">
        <defs>
          <linearGradient id="cab_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${l}"/>
            <stop offset="35%" stop-color="${p}"/>
            <stop offset="75%" stop-color="${d}"/>
            <stop offset="100%" stop-color="${d}"/>
          </linearGradient>
          <linearGradient id="cargo_${uid}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#F8FAFC"/>
            <stop offset="40%" stop-color="#E2E8F0"/>
            <stop offset="100%" stop-color="#CBD5E1"/>
          </linearGradient>
          <linearGradient id="badge_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${bgB}"/>
            <stop offset="50%" stop-color="${bgP}"/>
            <stop offset="100%" stop-color="${d}"/>
          </linearGradient>
          <linearGradient id="win_${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.85"/>
            <stop offset="40%" stop-color="#0284C7" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="#0369A1" stop-opacity="0.95"/>
          </linearGradient>
        </defs>

        <g>
          <!-- CARROCERÍA POSTERIOR FURGÓN -->
          <rect x="70" y="145" width="205" height="185" rx="14" fill="url(#cargo_${uid})" stroke="#94A3B8" stroke-width="3"/>
          <line x1="138" y1="148" x2="138" y2="328" stroke="#CBD5E1" stroke-width="2.5"/>
          <line x1="206" y1="148" x2="206" y2="328" stroke="#CBD5E1" stroke-width="2.5"/>

          <!-- MARCA NOTIGAS EN CARROCERÍA -->
          <rect x="86" y="195" width="125" height="34" rx="6" fill="#0F172A" opacity="0.88"/>
          <text x="148" y="218" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="16" fill="#FFD200" text-anchor="middle" letter-spacing="2">NOTIGAS</text>

          <!-- CABINA FRONTAL TOYOTA DINA -->
          <path d="M 260 140 L 370 140 Q 405 142 418 175 L 442 245 Q 446 258 446 275 L 446 332 Q 446 338 440 338 L 260 338 Z" fill="url(#cab_${uid})" stroke="${d}" stroke-width="3"/>

          <!-- PARABRISAS CON REFLEJO -->
          <path d="M 285 152 L 366 152 Q 390 154 398 176 L 418 226 Q 420 232 414 232 L 285 232 Z" fill="url(#win_${uid})" stroke="#0284C7" stroke-width="2.5"/>
          <path d="M 305 156 L 332 156 L 305 224 L 290 224 Z" fill="rgba(255,255,255,0.45)"/>
          <path d="M 285 152 L 285 232 L 270 232 L 270 152 Z" fill="#0369A1" opacity="0.95"/>
          <path d="M 255 138 L 385 138 Q 400 138 406 146 L 255 146 Z" fill="#1E293B"/>

          <!-- ESPEJO RETROVISOR -->
          <rect x="424" y="172" width="16" height="38" rx="4" fill="#0F172A" stroke="#475569" stroke-width="1.5"/>
          <line x1="416" y1="184" x2="424" y2="184" stroke="#0F172A" stroke-width="3"/>

          <!-- LÍNEA DE PUERTA Y MANIJA -->
          <line x1="265" y1="248" x2="350" y2="248" stroke="${d}" stroke-width="2"/>
          <rect x="312" y="252" width="22" height="6" rx="2" fill="#F8FAFC" stroke="#0F172A" stroke-width="1"/>

          <!-- INSIGNIA CON INICIALES PERSONALIZADAS -->
          <circle cx="340" cy="286" r="30" fill="url(#badge_${uid})" stroke="#FFFFFF" stroke-width="3.5"/>
          <circle cx="340" cy="286" r="25" fill="none" stroke="${bgB}" stroke-width="1.5" opacity="0.7"/>
          <text x="340" y="${initStr.length > 1 ? 297 : 299}" font-family="'Impact', 'Arial Black', sans-serif" font-weight="900" font-size="${fontSize}" fill="${bgT}" text-anchor="middle" letter-spacing="1">${initStr}</text>

          <!-- PARRILLA Y FARO -->
          <path d="M 426 270 L 444 270 L 444 316 L 426 316 Z" fill="#0F172A"/>
          <line x1="428" y1="280" x2="442" y2="280" stroke="#64748B" stroke-width="2"/>
          <line x1="428" y1="290" x2="442" y2="290" stroke="#64748B" stroke-width="2"/>
          <line x1="428" y1="300" x2="442" y2="300" stroke="#64748B" stroke-width="2"/>
          <rect x="432" y="248" width="12" height="18" rx="3" fill="#FEF08A" stroke="#EAB308" stroke-width="1.5"/>
          <rect x="436" y="252" width="6" height="10" rx="1" fill="#FFFFFF"/>

          <!-- PARACHOQUES -->
          <path d="M 260 328 L 452 328 Q 456 328 456 336 L 454 348 Q 452 352 444 352 L 260 352 Z" fill="#334155" stroke="#1E293B" stroke-width="2"/>

          <!-- RUEDAS DEPORTIVAS CON AROS CROMADOS -->
          <g>
            <circle cx="140" cy="352" r="38" fill="#0F172A" stroke="#020617" stroke-width="3"/>
            <circle cx="140" cy="352" r="24" fill="#64748B" stroke="#CBD5E1" stroke-width="3"/>
            <circle cx="140" cy="352" r="10" fill="#0F172A"/>
            <circle cx="140" cy="352" r="4" fill="#F8FAFC"/>
          </g>
          <g>
            <circle cx="378" cy="352" r="38" fill="#0F172A" stroke="#020617" stroke-width="3"/>
            <circle cx="378" cy="352" r="24" fill="#64748B" stroke="#CBD5E1" stroke-width="3"/>
            <circle cx="378" cy="352" r="10" fill="#0F172A"/>
            <circle cx="378" cy="352" r="4" fill="#F8FAFC"/>
          </g>
        </g>
      </svg>
    `;
  }
  window.generarSvgCamionDina = generarSvgCamionDina;

  /**
   * Genera el HTML completo para el marcador de Leaflet de un chofer en vivo.
   */
  function crearMarcadorCamionRepartidorHtml(data = {}) {
    const driverName = data.distribuidor_nombre || data.nombre_completo || data.nombre || 'Repartidor';
    const initials = getDriverInitials(driverName);
    const key = data.user_id || data.id || driverName;
    const theme = getDriverColorTheme(key, data.color_camion);

    const truckSvg = generarSvgCamionDina({
      name: driverName,
      initials: initials,
      color: theme.key,
      withBg: false,
      width: 72,
      height: 46
    });

    const safeName = (typeof escapeHtmlStr === 'function') ? escapeHtmlStr(driverName) : driverName;

    return `
      <div class="driver-map-marker" data-driver-color="${theme.key}" title="${safeName} (Repartidor Oficial)">
        <div class="driver-3d-truck-img">${truckSvg}</div>
        <span class="driver-marker-badge" style="background:${theme.badgeBg}; color:${theme.badgeText}; border-color:${theme.badgeBorder};" aria-hidden="true">${initials}</span>
        <span class="driver-marker-online" title="GPS en Tiempo Real"></span>
      </div>
    `;
  }
  window.crearMarcadorCamionRepartidorHtml = crearMarcadorCamionRepartidorHtml;

  /**
   * Genera el HTML de avatar para las tarjetas de negocio en la Lista de Repartidores.
   */
  function crearAvatarCamionChoferHtml(driverName, options = {}) {
    const name = driverName || 'Repartidor';
    const initials = getDriverInitials(name);
    const theme = getDriverColorTheme(name, options.color);

    return `
      <div class="driver-truck-avatar-wrap" style="position:relative; width:54px; height:42px; display:inline-flex; align-items:center; justify-content:center;">
        ${generarSvgCamionDina({
          name: name,
          initials: initials,
          color: theme.key,
          withBg: false,
          width: 54,
          height: 38
        })}
        <span style="position:absolute; top:-3px; right:-2px; background:${theme.badgeBg}; color:${theme.badgeText}; border:1.5px solid ${theme.badgeBorder}; border-radius:50%; width:18px; height:18px; font-size:9.5px; font-weight:900; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.5);">${initials}</span>
      </div>
    `;
  }
  window.crearAvatarCamionChoferHtml = crearAvatarCamionChoferHtml;

})();
