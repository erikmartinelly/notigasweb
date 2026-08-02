/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */

const defaultVendorsList = [
  {
    id: "v1",
    name: "Repartidor Express Gas GLP N° 42",
    category: "Gas GLP",
    icon: "🔥",
    plate: "3842-XYZ (Camión Garrafero)",
    products: "Garrafas de Gas GLP 10kg, reguladores de presión y mangueras reforzadas.",
    zones: "OTB Central, Av. Principal, Calle 1 a Calle 15 y plazas cercanas.",
    schedule: "Lunes a Sábado: 07:00 a 18:30 (Mañanas: Zonas Centro, Tardes: OTB Norte).",
    active: true
  },
  {
    id: "v2",
    name: "Repartidor Agua Purificada Cristallina 20L",
    category: "Agua 20L",
    icon: "💧",
    plate: "2910-ABC (Camión Cisterna / Repartidor)",
    products: "Botellones de agua tratada 20L, dispensadores de mesa y bombas manuales.",
    zones: "Toda la OTB, condominios, escuelas y comercios locales.",
    schedule: "Lunes, Miércoles y Viernes: 08:00 a 17:00.",
    active: true
  },
  {
    id: "v3",
    name: "Recicladora & Compra de Chatarra El Vecino",
    category: "Chatarra",
    icon: "♻️",
    plate: "4021-PQR (Camión Recolector)",
    products: "Pago en efectivo por chatarra, metales, cobre, aluminio, baterías usadas.",
    zones: "Recorrido puerta a puerta por todas las calles de la OTB.",
    schedule: "Martes y Jueves: 09:00 a 16:00.",
    active: true
  },
  {
    id: "v4",
    name: "Recolector de Papel & Cartón Barrial",
    category: "Papel",
    icon: "📄",
    plate: "8120-MNO (Camioneta de Reciclaje)",
    products: "Compra y recolección de papel periódico, cartón comprimido, revistas y cuadernos.",
    zones: "OTB Sur, Mercado Local y zonas comerciales.",
    schedule: "Lunes a Viernes: 08:30 a 15:00.",
    active: true
  },
  {
    id: "v5",
    name: "Camión Agrícola Frutas & Verduras Frescas",
    category: "Frutas",
    icon: "🍎",
    plate: "5123-STU (Camión Frutero)",
    products: "Manzanas, plátanos, naranjas, verduras de temporada por kilo, malla o caja.",
    zones: "Plaza Principal, Av. Circunvalación y esquinas fijas de la OTB.",
    schedule: "Martes, Jueves y Sábados: 06:30 a 14:00.",
    active: true
  },
  {
    id: "v6",
    name: "Repartidor de Detergentes & Limpieza Barrial",
    category: "Detergentes",
    icon: "🧼",
    plate: "6234-VWX (Furgón de Venta)",
    products: "Detergente a granel, lavavajillas, lavandina 5L, desinfectantes y suavizantes.",
    zones: "Tiendas de barrio, lavanderías y entregas a domicilio.",
    schedule: "Lunes a Sábado: 09:00 a 18:00.",
    active: true
  },
  {
    id: "v7",
    name: "Repartidor de Carbón & Leña El Fuego del Sur",
    category: "Carbón",
    icon: "🪵",
    plate: "1845-KLM (Camioneta de Reparto)",
    products: "Bolsas de Carbón Vegetal 5kg/10kg, Leña seca para parrilla y restaurantes.",
    zones: "OTB Norte, Zona de Parrilleros y Mercado Local.",
    schedule: "Viernes, Sábados y Domingos: 10:00 a 20:00.",
    active: true
  },
  {
    id: "v8",
    name: "Servicio de Encargos & Paquetes Barriales",
    category: "Otros",
    icon: "📦",
    plate: "7345-YZA (Motocicleta / Triciclo)",
    products: "Mandados rápidos, entrega de documentos, medicamentos y paquetería local.",
    zones: "Cobertura total en el barrio y zonas aledañas.",
    schedule: "Todos los días: 07:00 a 21:00.",
    active: true
  }
];

document.addEventListener('DOMContentLoaded', () => {
  renderVendorCards('TODOS');
});

function filterVendorCategory(cat, chipElem) {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  if (chipElem) chipElem.classList.add('active');
  renderVendorCards(cat);
}

function renderVendorCards(filterCat) {
  const container = document.getElementById('vendorGridContainer');
  if (!container) return;

  let allVendors = [...defaultVendorsList];
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if ((u.role === 'chofer' || u.role === 'repartidor') && u.nombre) {
        allVendors.unshift({
          id: `custom_${Date.now()}`,
          name: u.nombre,
          category: u.categoria || "Gas GLP",
          icon: getIconForCategory(u.categoria),
          plate: `${u.placa || 'Placa en tramite'} (Repartidor Registrado)`,
          products: u.productos || "Servicios generales de reparto a domicilio",
          zones: u.zonas || "OTB Central y zonas aledañas",
          schedule: u.schedule || "Lunes a Sábado: 08:00 a 18:00",
          active: true
        });
      }
    }
  } catch(e){}

  const filtered = (filterCat === 'TODOS') 
    ? allVendors 
    : allVendors.filter(v => v.category.toLowerCase().includes(filterCat.toLowerCase()) || filterCat.toLowerCase().includes(v.category.toLowerCase()));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color:#94A3B8; padding:30px; font-size:12px;">
        No hay repartidores registrados en esta categoría aún.<br>
        <button class="btn-driver" style="margin: 10px auto;" onclick="document.getElementById('modalDriver').style.display='flex'">➕ Publicar Mi Mini Página de Negocio</button>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach((v, index) => {
    html += `
      <div class="vendor-fb-card">
        <div class="vendor-fb-header">
          <div class="vendor-profile">
            <div class="vendor-avatar">${v.icon}</div>
            <div class="vendor-meta">
              <div class="vendor-name">${v.name}</div>
              <div class="vendor-badge-cat"><i class="fa-solid fa-circle-check"></i> Repartidor Verificado • ${v.category}</div>
            </div>
          </div>
          <span class="ad-badge" style="font-size:8px;">EN RUTA 🚛</span>
        </div>

        <div class="vendor-fb-body">
          <div class="vendor-field"><strong>🚘 Vehículo / Placa:</strong> ${v.plate}</div>
          <div class="vendor-field"><strong>📦 ¿Qué Vende / Oferta?:</strong> ${v.products}</div>
          <div class="vendor-field"><strong>📍 Zonas de Recorrido:</strong> ${v.zones}</div>
          <div class="vendor-field"><strong>📅 Días y Horarios por Zona:</strong> ${v.schedule}</div>
          <div class="vendor-field" style="font-size: 10px; color: #00E676; margin-top: 2px;">
            <i class="fa-solid fa-lock"></i> Comunicación 100% interna y confidencial por la app.
          </div>
        </div>

        <div class="vendor-fb-footer">
          <button class="btn-vendor-chat" onclick="abrirChatDirectoVendedor('${v.category}')">
            <i class="fa-solid fa-comments"></i> 💬 CHAT PRIVADO INTERNO
          </button>
          <button class="btn-vendor-order" onclick="seleccionarYPedirDirecto('${v.category}')">
            <i class="fa-solid fa-paper-plane"></i> Hacer Pedido
          </button>
        </div>
      </div>
    `;

    // INSERTAR TARJETA PATROCINADA ESTILO FACEBOOK FEED AL MEDIO
    if (index === 2) {
      html += `
        <div class="ad-facebook-feed-card" onclick="abrirAnuncioWhatsApp()" style="cursor:pointer;">
          <div class="ad-fb-header">
            <div class="ad-fb-profile">
              <div class="ad-fb-icon"><i class="fa-solid fa-rectangle-ad"></i></div>
              <div class="ad-fb-info">
                <div class="ad-fb-name" id="adShopTitle">📢 Publicidad OTB & Google Ads</div>
                <div class="ad-fb-sub"><i class="fa-solid fa-globe"></i> ANUNCIO PATROCINADO EN EL FEED</div>
              </div>
            </div>
            <span class="ad-badge">SPONSOR</span>
          </div>
          <div class="ad-fb-body" id="adShopSubtext">
            Promociona tu comercio, taller o servicio profesional directamente ante todos los vecinos de tu OTB.
          </div>
          <div class="ad-fb-media">
            <div>
              <div class="ad-fb-media-title">Espacio Publicitario Destacado</div>
              <div class="ad-fb-media-desc">Haz clic para contratar tu banner publicitario</div>
            </div>
            <button class="btn-ad-contact" onclick="event.stopPropagation(); abrirAnuncioWhatsApp()"><i class="fa-solid fa-bullhorn"></i> Contactar</button>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

function getIconForCategory(cat) {
  if (!cat) return "📦";
  if (cat.includes("Gas")) return "🔥";
  if (cat.includes("Agua")) return "💧";
  if (cat.includes("Chatarra")) return "♻️";
  if (cat.includes("Papel")) return "📄";
  if (cat.includes("Fruta")) return "🍎";
  if (cat.includes("Deterg")) return "🧼";
  if (cat.includes("Carbón")) return "🪵";
  return "📦";
}
