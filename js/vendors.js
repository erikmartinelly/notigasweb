/* ==========================================================================
   NOTIGAS - MÓDULO DE MINI PÁGINAS DE NEGOCIO ESTILO FACEBOOK POR CATEGORÍA
   ========================================================================== */

const defaultVendorsList = [
  {
    id: "v1",
    name: "Distribuidora Express Gas GLP N° 42",
    category: "Gas GLP",
    icon: "🔥",
    plate: "3842-XYZ (Camión Garrafero)",
    products: "Garrafas GLP 10kg, mangueras de seguridad, reguladores de gas.",
    zones: "OTB Central, Av. Principal, Calle 1 a Calle 15 y plazas cercanas.",
    active: true
  },
  {
    id: "v2",
    name: "Agua Purificada Cristallina 20L",
    category: "Agua 20L",
    icon: "💧",
    plate: "2910-ABC (Camión Cisterna/Repartidor)",
    products: "Botellones de agua tratada 20L, dispensadores de mesa y bomba manual.",
    zones: "Toda la OTB, condominios, escuelas y comercios locales.",
    active: true
  },
  {
    id: "v3",
    name: "Recicladora & Compra de Chatarra El Vecino",
    category: "Chatarra",
    icon: "♻️",
    plate: "4021-PQR (Camión Recolector)",
    products: "Pago en efectivo por chatarra, cartón, papel periódico, cobre, aluminio y baterías.",
    zones: "Recorrido puerta a puerta por todas las calles de la OTB.",
    active: true
  },
  {
    id: "v4",
    name: "Camión Agrícola Frutas & Verduras Frescas",
    category: "Frutas",
    icon: "🍎",
    plate: "5123-STU (Camión Frutero)",
    products: "Manzanas, plátanos, naranjas, verduras de temporada por kilo o caja.",
    zones: "Plaza Principal, Av. Circunvalación y esquinas fijas.",
    active: true
  },
  {
    id: "v5",
    name: "Distribuidora de Detergentes & Limpieza Barrial",
    category: "Detergentes",
    icon: "🧼",
    plate: "6234-VWX (Furgón de Venta)",
    products: "Detergente en polvo a granel, lavavajillas, lavandina, desinfectantes 5L.",
    zones: "Tiendas de barrio, lavanderías y entregas a domicilio.",
    active: true
  },
  {
    id: "v6",
    name: "Carbonería & Leña El Fuego del Sur",
    category: "Carbón",
    icon: "🪵",
    plate: "1845-KLM (Camioneta de Reparto)",
    products: "Bolsas de Carbón Vegetal 5kg/10kg, Leña seca para parrilla y restaurantes.",
    zones: "OTB Norte, Zona de Parrilleros y Mercado Local.",
    active: true
  },
  {
    id: "v7",
    name: "Servicio de Encargos & Paquetes Barriales",
    category: "Otros",
    icon: "📦",
    plate: "7345-YZA (Motocicleta / Triciclo)",
    products: "Mandados rápidos, entrega de documentos, medicamentos y paquetería local.",
    zones: "Cobertura total en el barrio y zonas aledañas.",
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

  // Cargar vendedores registrados de localStorage + por defecto
  let allVendors = [...defaultVendorsList];
  try {
    const saved = localStorage.getItem('notigas_user_data');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.role === 'chofer' && u.nombre) {
        allVendors.unshift({
          id: `custom_${Date.now()}`,
          name: u.nombre,
          category: u.categoria || "Gas GLP",
          icon: getIconForCategory(u.categoria),
          plate: `${u.placa} (Repartidor Registrado)`,
          products: u.productos || "Servicios generales",
          zones: u.zonas || "OTB Local",
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
        No hay repartidores o distribuidores registrados en esta categoría aún.<br>
        <button class="btn-driver" style="margin: 10px auto;" onclick="document.getElementById('modalDriver').style.display='flex'">➕ Publicar mi Mini Página de Negocio</button>
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
          <div class="vendor-field"><strong>📦 Productos / Oferta:</strong> ${v.products}</div>
          <div class="vendor-field"><strong>📍 Zonas de Entrega:</strong> ${v.zones}</div>
        </div>

        <div class="vendor-fb-footer">
          <button class="btn-vendor-chat" onclick="abrirChatDirectoVendedor('${v.category}')">
            <i class="fa-solid fa-comments"></i> 💬 CHAT PRIVADO CON DISTRIBUIDOR
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
  if (cat.includes("Fruta")) return "🍎";
  if (cat.includes("Deterg")) return "🧼";
  if (cat.includes("Carbón")) return "🪵";
  return "📦";
}
