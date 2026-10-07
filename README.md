# NOTIGAS - Noticias de generación de reciclables

NOTIGAS es una Aplicación Web Progresiva (PWA) dinámica y de alto rendimiento para el reciclaje comunitario y la geolocalización en tiempo real en Bolivia. Conecta a vecinos que tienen materiales reciclables con recolectores locales, y a vecinos que necesitan productos de limpieza y víveres con quienes los suministran, todo a través de un mapa interactivo en vivo. Los archivos del navegador se sirven desde el hosting, mientras que todas las operaciones dinámicas y en tiempo real son impulsadas por Supabase (Auth, PostgreSQL, PostGIS y Realtime WebSockets).

Engineered with **Vanilla JavaScript**, **Supabase PostgreSQL with PostGIS**, and Google developer technologies.

---

## 🌟 Project Identity & Google Technologies

* 🤖 **AI-Assisted Engineering:** The core architecture, full-stack database triggers, real-time spatial algorithms, iterative refactoring, and technical hardening of NOTIGAS were built with AI coding models, tailored to a neighborhood-scale real-time logistics model.
* 🔑 **Google Identity Services (Google Sign-In & OAuth 2.0):** Rapid, secure, frictionless authentication using Google accounts for neighbors and drivers, seamlessly integrated with Supabase Auth and JWT verification.
* 🗺️ **Turn-by-Turn Navigation with Google Maps:** Once a driver selects and is assigned a request, the system launches **Google Maps** with pre-configured coordinates for direct turn-by-turn routing to the destination.
* 🎨 **Google Maps Visual Aesthetics:** The in-app map interface features a clean, high-contrast visual layout, crisp white floating controls, and a subtle cartographic palette inspired by the Google Maps user experience.
* 📱 **PWA & Google Chrome Optimization:** Complete Progressive Web App compliance featuring offline caching, instant load times, and installability on Android and desktop Chrome.

---

## 🚀 Key Features

* **Real-Time Interactive Map:** Live synchronized visualization for neighbors and drivers. Material posts generate geolocated map markers, while collection trucks transmit live GPS telemetry as they navigate neighborhood streets.
* **Two Operation Types, One Map:** Every catalog entry is either `recogida` (a driver comes to you) or `compra` (a driver brings it to you), and the map badge shows which one applies.
* **Map Signage:** A permanent map banner explains what the colored markers mean, so the map is readable without prior instruction.
* **Spatial Demand Radar:** When zoomed out on the map (`zoom <= 14`), requests and density clusters emit radiating sonar radar waves. When zoomed in, registered users see free requests only as 50 m uncertainty areas; exact coordinates are revealed only to the assigned driver.
* **Instant WebSocket Sync (Supabase Realtime):** Sub-second updates for request statuses, markers, and active trucks without requiring page refreshes.
* **Dual User Roles:**
  * **Neighbor:** Publish recyclable material you have at home, or request everyday products, and track the approaching truck in real time.
  * **Driver (Recolector):** Register a business profile, stream GPS location telemetry, choose individual requests, and trigger external turn-by-turn routing with Google Maps.
* **Community Board / Neighborhood News:** Interactive bulletin board for community alerts, official notifications, and local announcements with single-vote reputation scoring and automatic scheduled purging.
* **Hardened Admin Panel:** Secure administrative controls restricted to verified Google Admin accounts, featuring request renewals/cancellations, user moderation, and driver onboarding controls.
* **Automated Driver Onboarding:** Driver profiles publish automatically without manual pre-approval, with administrative moderation handled through instant ban and deletion controls.
* **Separated Advertising Hierarchy:** Google AdSense is integrated centrally within the Drivers and Community News feeds. Local sponsor ads remain fixed in the bottom banner.

---

## 🌍 Social Impact, Market Evolution & Purpose (The "Why")

### Current Operating Model: Bolivia (Cochabamba)

NOTIGAS operates in **Bolivia**, starting in **Cochabamba**, as a neighborhood recycling and services platform. The platform's single source of truth for the catalog is `window.NOTIGAS_BO.CATEGORIAS` in `js/notigas_bo.js`.

There are exactly **6 active categories**, and each one has a fixed operation type:

| # | Code | Label | Type | Meaning |
| :-- | :--- | :--- | :--- | :--- |
| 1 | `plastico` | Plástico | `recogida` | A driver comes to pick it up |
| 2 | `papel` | Papel y cartón | `recogida` | A driver comes to pick it up |
| 3 | `chatarra` | Chatarra y metal | `recogida` | A driver comes to pick it up |
| 4 | `botellas` | Botellas y vidrio | `recogida` | A driver comes to pick it up |
| 5 | `organico` | Orgánico | `recogida` | A driver comes to pick it up |
| 6 | `detergentes` | Detergentes | `compra` | A driver brings it to you |

*Note: Free requests for other materials (`otros`) are routed to `solicitudes_otros` for demand intelligence and do not create public orders. Retired services (sal, afilado, agua, frutas) remain in historical logs to preserve legacy references.*

**NOTIGAS does not charge.** There is no subscription, no commission, no credit cycle, and no price displayed anywhere in the interface. The agreement is made **directly between neighbor and collector**. Drivers compete on availability, coverage, and service, never on platform fees.

The server is authoritative: `tipo_solicitud` is **derived from the category**, never trusted from the client, and `pedidos.categoria` is constrained by a database `CHECK` against the canonical catalog. That keeps the front end, the database, and the map from drifting apart.

The production architecture uses server-authoritative PostgreSQL RPCs and RLS for assignment, delivery confirmation, accounting, complaints, and administrative actions.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Engineering** | AI-assisted software engineering, architecture, and code generation |
| **Authentication** | **Google Identity Services** (Google OAuth 2.0 & One-Tap) + Supabase Auth |
| **Navigation** | **Google Maps** (External route guidance for assigned drivers) |
| **Web Platform** | Google Chrome, PWA, HTML5, CSS3, and Vanilla JavaScript |
| **Database & Realtime** | **Supabase** (PostgreSQL 15+, PostGIS, Realtime WebSockets, Row Level Security) |
| **Production Hosting** | **Hostinger Web App** with a lightweight Express static asset adapter; Supabase powers the dynamic backend |

---

## 📂 Project Structure

```text
├── index.html              # Main single-page application entry point (Neighbor, Driver, and Admin views)
├── package.json            # Deployment configuration and build scripts for Hostinger Web App runtime
├── server.js               # Static asset server adapter; business logic remains in Supabase
├── .htaccess               # HTTPS enforcement, security headers, cache policies, and SPA routing
├── ads.txt                 # Authorized Google AdSense digital seller declaration
├── sw.js                   # Service Worker (Progressive caching, asset versioning, and offline PWA support)
├── manifest.json           # PWA Web Application Manifest
├── icons/                  # PWA icons and the NOTIGAS identity assets
├── js/                     # Modular frontend JavaScript architecture
│   ├── state.js            # Centralized reactive state management (Pub/Sub)
│   ├── notigas_bo.js       # Canonical Bolivia catalog, types, colors, icons, and map signage
│   ├── ui.js               # Visual helpers, loading overlays, modals, and toast alerts
│   ├── supabase-config.js  # Supabase client initialization, Realtime channels, and subscriptions
│   ├── auth.js             # Google OAuth integration, session persistence, and role management
│   ├── vendors.js          # Driver business profiles and category filtering
│   ├── map.js              # Leaflet map engine, live marker rendering, and demand sonar radar
│   ├── map_search.js       # Address geocoding and street search with multi-engine fallback
│   ├── map_gps.js          # Adaptive GPS geolocation tracking and live telemetry broadcasting
│   ├── forum.js            # Community bulletin board, neighborhood posts, and comments
│   ├── ads.js              # Google AdSense in-feed units and bottom local sponsor banner
│   ├── orders.js           # Request creation, individual selection, assignment, and delivery lifecycle
│   ├── admin.js            # Administrative dashboard and operational metrics
│   ├── admin_users.js      # User management, driver/buyer moderation, ban and deletion controls
│   └── events.js           # Delegated DOM event handlers and global UI interactions
├── styles/
│   └── main.css            # Application design tokens, responsive layouts, and map signage
├── scripts/                # Verification guards (syntax, structure, and product contracts)
├── supabase/
│   ├── full_production_schema.sql # DEPRECATED: fails intentionally; do not use
│   └── migrations/         # Canonical source of the production schema and security rules
└── .github/
    └── workflows/ci.yml    # CI automated syntax & integrity verification
```

---

## ⚙️ Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/erikmartinelly/notigasweb.git
cd notigasweb
```

### 2. Configure Database & Backend (Supabase)
* Create a new project at [Supabase](https://supabase.com/).
* **Canonical deployment:** apply every file in `supabase/migrations/` in ascending order using the project migration workflow. The remote migration history must match Git. The current recycling catalog lives in `supabase/migrations/20260926090000_bolivia_catalogo_reciclaje.sql`.
* `supabase/full_production_schema.sql` is intentionally deprecated and aborts if executed; it must never be used for production, staging, recovery, or a fresh install.
* Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as environment variables in the hosting runtime. `server.js` builds `/runtime-config.js` from those variables on each request; the static `runtime-config.js` file in the repository is a security placeholder with no credentials and will fail explicitly if loaded by a pure Apache deployment. A publishable/anon key is intentionally public and remains constrained by RLS; never configure or commit `SUPABASE_SERVICE_ROLE_KEY` in this app.
* Payment details do not belong in the platform. Do not commit any beneficiary, wallet, or bank data.

### 3. Configure Google Identity Services & Auth
* In the Google Cloud Console, configure an **OAuth 2.0 Client ID** for Web Applications.
* In Supabase Dashboard -> **Authentication** -> **Providers** -> enable **Google** and add your credentials (`Client ID` and `Client Secret`).
* Add your authorized domains and redirect URIs in both Google Cloud Console and Supabase Auth settings.

### 4. Local Development
The PWA runs natively in modern browsers with zero build step required. The `package.json` and `server.js` files are provided to support standard Node.js hosting environments (such as Hostinger Web Apps). For full local testing with Google Sign-In and Geolocation APIs, serve over HTTPS or `localhost`.

```bash
# Local server (use your project's public browser credentials)
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key \
node server.js
```

### 5. Local Verification Guards
The product contracts are enforced by standalone Python guards, so they can run without Node:

```bash
pip install esprima
python scripts/check_bolivia_reciclaje_catalogo.py   # canonical catalog and Bolivia contract
python scripts/check_estructura_html.py               # HTML nesting, manifest, CSS, brand strings
python scripts/parse_js.py                            # parse all 25 js/ modules for syntax errors
python scripts/test_guard_estructura.py               # proves the structure guard really fails when it should
```

### 6. Production Deployment (Hostinger)
1. Enable SSL/HTTPS on your custom domain in Hostinger.
2. In Hostinger Web App deployment settings, specify `npm start` as the startup command.
3. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Hostinger's environment-variable settings before starting the application.
4. Verify that hidden directories (`.git`, `.agents`, `scripts`, `supabase`) are restricted from public directory browsing.
5. Validate that `https://www.notigas.com/manifest.json`, `https://www.notigas.com/ads.txt`, and `https://www.notigas.com/sw.js` serve with appropriate MIME types.
6. In Supabase Auth, register `https://www.notigas.com` as the primary Site URL and as an authorized redirect URI.

---

## 🏗️ Production Architecture & Core Logistics Model

### 📡 Collective Demand Aggregation Philosophy
* **Demand Aggregation & Collection Beacons:** NOTIGAS is fundamentally designed around **collective neighborhood demand aggregation**. Individual material posts act as live **geospatial demand beacons and collection waypoints**.
* **Spatial Density Sonar for Drivers:** When zoomed out (`zoom <= 14`), NOTIGAS clusters active neighborhood posts into weighted concentration zones with real-time sonar pulses (`🔥 18 un`, `⚡ 5 un`, etc.). Registered drivers examine the collective demand map in real time to plan efficient collection routes.
* **Turn-by-Turn Navigation via Reference Posts:** Drivers select an active post as a reference waypoint to trigger external turn-by-turn routing with Google Maps, serving that primary beacon and all neighboring posts clustered along that street.
* **Strict Category & City Isolation:** Drivers exclusively access posts and telemetry matching their registered category and their registered operational city, preventing cross-category interference.

### Catalog Integrity
* **One source of truth:** `window.NOTIGAS_BO.CATEGORIAS` in `js/notigas_bo.js` defines code, label, type, color, and icon for all 11 categories. The UI, the map badges, the map signage, and the PWA favicon are all generated from it.
* **Server-derived type:** `tipo_solicitud` is computed by the database from `categoria`; a client cannot forge it.
* **Database constraint:** `pedidos.categoria` has a `CHECK` against the canonical catalog, so an out-of-catalog value is rejected at the storage layer rather than silently persisting.
* **No prices in the interface:** the driver avatar, the driver card, the live vendor list, and the map truck popup deliberately render no price. Guards fail the build if a price badge reappears.

### Database & Row Level Security (RLS)
* **Publicidad separada de Muro de Comentarios:** `public.anuncios_globales` contiene anuncios publicitarios persistentes administrados; `public.avisos` contiene publicaciones comunitarias con ciclo de vida de 48 horas. El espacio publicitario del tercer feed usa `posicion = 'muro_avisos'`, nunca una fila de `avisos`.
* **Strict Row Level Security:** RLS is enforced across all tables in the `public` schema. Neighbors can only modify their own posts, and registered drivers access only sanitized free-post radar areas for their category/city; exact post data is available only after atomic assignment.
* **6-State Finite State Machine:** Enforces canonical lifecycle transitions (`pendiente` → `visto` → `asignado` → `entregado` / `recibido` / `cancelado`) strictly validated by database triggers (`trg_check_pedido_transition` & `guard_pedido_mutation`).
* **Automated Terminal Record Purge:** Cancelled and delivered posts are automatically swept by `rpc_purge_old_records()`, keeping PostgreSQL clean, optimized, and free of obsolete clutter.
* **Live GPS Telemetry (`rutas_repartidores`):** Atomic upserts per driver (`user_id`, `last_active`) with automated pruning of inactive telemetry.
* **Atomic RPC Functions (`SECURITY DEFINER` with `search_path = public`):**
  * `rpc_assign_order`: Atomic single-driver assignment with `FOR UPDATE` row locking.
  * `rpc_mark_order_seen`: Atomic status transition updating `estado = 'visto'` and `visto = true`.
  * `rpc_update_order_location`: Relocate active GPS coordinates with trigger-compliant validation.
  * `rpc_get_my_assigned_orders`: Secure retrieval of assigned post contact details for the active driver.
  * `rpc_purge_old_records`: Automated garbage collection purging delivered/cancelled posts and stale telemetry.
  * `rpc_admin_list_users`: Administrative listing of neighbors and drivers linked to authentic Supabase Auth UUIDs.
  * `rpc_admin_delete_user`: Complete administrative purge of non-admin accounts and associated relational records.
  * `rpc_admin_renew_order`: Administrative post renewal resetting state to `pendiente`.
  * `delete_user_account`: Secure self-service account deletion cascading across all relational records.
