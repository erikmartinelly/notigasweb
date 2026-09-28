# NOTIGAS - Live Neighborhood Recycling & Geospatial Platform

NOTIGAS is a Progressive Web Application (PWA) for community-driven recycling in **Bolivia**. It connects neighbors who have recyclable material at home with local recolectors who collect it, through a live interactive map. The browser receives web assets directly from hosting, while all dynamic real-time operations are powered by Supabase (Auth, PostgreSQL, PostGIS, and Realtime WebSockets).

**NOTIGAS is a recycling-only service.** It does not sell, deliver, or broker consumer products. The only thing offered next to collection is an **optional, independent subscription list for cleaning-product refills** (`SUSCRIBIRME A RECARGAS`), which is deliberately kept out of the order flow and off the map.

Engineered with **Vanilla JavaScript**, **Supabase PostgreSQL with PostGIS**, and Google developer technologies.

---

## 🌟 Project Identity & Google Technologies

* 🤖 **AI-Assisted Engineering:** The core architecture, full-stack database triggers, real-time spatial algorithms, iterative refactoring, and technical hardening of NOTIGAS were built with AI coding models, tailored to a neighborhood-scale real-time logistics model.
* 🔑 **Google Identity Services (Google Sign-In & OAuth 2.0):** Rapid, secure, frictionless authentication using Google accounts for neighbors and recolectors, seamlessly integrated with Supabase Auth and JWT verification.
* 🗺️ **Turn-by-Turn Navigation with Google Maps:** Once a recolector selects and is assigned a request, the system launches **Google Maps** with pre-configured coordinates for direct turn-by-turn routing to the destination.
* 🎨 **Google Maps Visual Aesthetics:** The in-app map interface features a clean, high-contrast visual layout, crisp white floating controls, and a subtle cartographic palette inspired by the Google Maps user experience.
* 📱 **PWA & Google Chrome Optimization:** Complete Progressive Web App compliance featuring offline caching, instant load times, and installability on Android and desktop Chrome.

---

## 🚀 Key Features

* **Recycling-Only Operation:** The catalog contains exactly **five categories**, all of type `recogida`. A recolector comes to you. There is no `compra` flow anywhere in the product.
* **Two Map Actions, Two Different Things:**
  * `PEDIR RECOJO` opens the order form with the type already fixed to `recogida`, and the category list only ever offers the five recycling categories.
  * `SUSCRIBIRME A RECARGAS` opens a separate modal for a cleaning-refill subscription. It creates **no map marker, no order, and no payment**.
* **Anchored Action Bar:** Both actions are pinned to the **bottom edge at full width**, so the map surface, the zoom controls, and the city labels of the tiles all stay readable. The bar is hidden entirely in recolector mode.
* **Map Signage:** A collapsible panel opens with "¿Qué puedes hacer aquí?" and lists the five colored recycling markers.
* **Real-Time Interactive Map:** Live synchronized visualization for neighbors and recolectors. Material posts generate geolocated map markers, while collection trucks transmit live GPS telemetry as they navigate neighborhood streets.
* **Spatial Demand Radar:** When zoomed out on the map (`zoom <= 14`), requests and density clusters emit radiating sonar radar waves. When zoomed in, registered users see free requests only as 50 m uncertainty areas; exact coordinates are revealed only to the assigned recolector.
* **Instant WebSocket Sync (Supabase Realtime):** Sub-second updates for request statuses, markers, and active trucks without requiring page refreshes.
* **Dual User Roles:**
  * **Neighbor (Vecino / Comprador):** Publish recyclable material you have at home, and track the approaching truck in real time.
  * **Recolector (Recolector):** Register a business profile, stream GPS location telemetry, choose individual requests, and trigger external turn-by-turn routing with Google Maps.
* **Recarga Subscriptions:** A per-user list of cleaning products they want refilled, with a frequency, zone, phone, and notes. One active subscription per `(user_id, producto)` pair, so signing up twice updates the existing row.
* **Community Board / Neighborhood News:** Interactive bulletin board for community alerts, official notifications, and local announcements with single-vote reputation scoring and automatic scheduled purging.
* **Hardened Admin Panel:** Secure administrative controls restricted to verified Google Admin accounts, featuring request renewals/cancellations, user moderation, and recolector onboarding controls.
* **Separated Advertising Hierarchy:** Google AdSense is integrated centrally within the Recolectors and Community News feeds. Local sponsor ads remain fixed in the bottom banner.

---

## 🌍 Current Operating Model: Bolivia

NOTIGAS operates in **Bolivia**, starting in **Cochabamba**, as a neighborhood recycling platform. The platform's single source of truth for the catalog is `window.NOTIGAS_BO.CATEGORIAS` in `js/notigas_bo.js`.

There are exactly **5 active categories**, and every one of them has the same fixed operation type:

| # | Code | Label | Type | Meaning |
| :-- | :--- | :--- | :--- | :--- |
| 1 | `plastico` | Plástico | `recogida` | A recolector comes to pick it up |
| 2 | `papel` | Papel y cartón | `recogida` | A recolector comes to pick it up |
| 3 | `chatarra` | Chatarra y metal | `recogida` | A recolector comes to pick it up |
| 4 | `botellas` | Botellas y vidrio | `recogida` | A recolector comes to pick it up |
| 5 | `organico` | Orgánico | `recogida` | A recolector comes to pick it up |

### Retired categories

Six categories were removed from the active catalog: `frutas`, `detergentes`, `sal`, `afilado`, `agua`, and `otros`. They are **not deleted from the database**. `notigas_catalogo_categorias_historico()` keeps all **11** historical codes so that old orders can still resolve their category, be displayed, and be audited.

* New orders can only use the 5 active categories.
* Retired categories can only be **cancelled** by an administrator, never revived and never used to create a request.

### Money

**NOTIGAS does not charge for recycling.** There is no commission, no credit cycle, and no price displayed anywhere in the interface. The economic agreement is made **directly between the two people**, settled locally by QR (Simple or Banesco). Recolectors compete on availability, coverage, and service, never on a platform price.

The `SUSCRIBIRME A RECARGAS` subscription is **not** a platform sale. NOTIGAS only stores the neighborhood's list of interest; the supplier, the price, and the payment are arranged directly between the two people. No payment data belongs in this repository.

### Server authority

The server is authoritative: `tipo_solicitud` is **derived from the category**, never trusted from the client, `pedidos.tipo_solicitud` defaults to `'recogida'`, and `pedidos.categoria` is constrained by a database `CHECK` against the canonical catalog. That keeps the front end, the database, and the map from drifting apart.

`rpc_public_schema_contract()` reports the live counts of active and historical categories, so a deployment can be checked without guessing.

---

## 🎨 Brand

The NOTIGAS identity is a green recycling truck on a **white background** (`icons/camion_reciclaje.svg`, also the favicon and the PWA manifest icon). The truck's cargo box and cab carry an explicit green outline so the silhouette survives on both light and dark surfaces.

Recolector truck colors come from a 36-entry palette in `js/recolector_icons.js`. The theme is chosen by a hash of the recolector's name, or stored explicitly in `perfiles.color_camion`. **No theme renders lilac:** the four former purple entries (`morado`, `violeta`, `lavanda`, `purpura`) were re-keyed to white brand tones (`#15803D` / `#FFFFFF`) while keeping their original `key` values, so any recolector already assigned one of them keeps working and simply sees a white truck instead of a lilac one.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Engineering** | AI-assisted software engineering, architecture, and code generation |
| **Authentication** | **Google Identity Services** (Google OAuth 2.0 & One-Tap) + Supabase Auth |
| **Navigation** | **Google Maps** (External route guidance for assigned recolectors) |
| **Web Platform** | Google Chrome, PWA, HTML5, CSS3, and Vanilla JavaScript |
| **Database & Realtime** | **Supabase** (PostgreSQL 15+, PostGIS, Realtime WebSockets, Row Level Security) |
| **Production Hosting** | **Hostinger Web App** with a lightweight Express static asset adapter; Supabase powers the dynamic backend |

---

## 📂 Project Structure

```text
├── index.html              # Main single-page application entry point (Neighbor, Recolector, and Admin views)
├── package.json            # Deployment configuration and build scripts for Hostinger Web App runtime
├── server.js               # Static asset server adapter; business logic remains in Supabase
├── .htaccess               # HTTPS enforcement, security headers, cache policies, and SPA routing
├── ads.txt                 # Authorized Google AdSense digital seller declaration
├── sw.js                   # Service Worker (Progressive caching, asset versioning, and offline PWA support)
├── runtime-config.js       # Placeholder for the publishable key; server.js injects the real values per request
├── manifest.json           # PWA Web Application Manifest
├── icons/                  # PWA icons and the NOTIGAS identity assets
├── js/                     # Modular frontend JavaScript architecture
│   ├── state.js            # Centralized reactive state management (Pub/Sub)
│   ├── notigas_bo.js       # Canonical Bolivia catalog (5 active), historical lookup, colors, icons, signage
│   ├── ui.js               # Visual helpers, loading overlays, modals, and toast alerts
│   ├── supabase-config.js  # Supabase client initialization, Realtime channels, and subscriptions
│   ├── auth.js             # Google OAuth integration, session persistence, and role management
│   ├── vendors.js          # Recolector business profiles and category filtering
│   ├── map.js              # Leaflet map engine, live marker rendering, and demand sonar radar
│   ├── map_search.js       # Address geocoding and street search with multi-engine fallback
│   ├── map_gps.js          # Adaptive GPS geolocation tracking and live telemetry broadcasting
│   ├── forum.js            # Community bulletin board, neighborhood posts, and comments
│   ├── promo.js             # Google AdSense in-feed units and bottom local sponsor banner
│   ├── orders.js           # Recycling request creation, selection, assignment, and delivery lifecycle
│   ├── recargas.js         # Cleaning-refill subscriptions (isolated from the order flow, off-map)
│   ├── recolector_icons.js # 36 recolector truck color themes, the NOTIGAS truck SVG, and favicon swapping
│   ├── recolector_order_rules.js # Recolector-side eligibility rules per request
│   ├── recolector_payments.js # Recolector payout panels: local QR settlement, no platform commission
│   ├── order_privacy_layer.js # Coordinate blurring until a recolector is assigned
│   ├── app.js              # Bootstrap, app-mode switching, and the main view router
│   ├── monitoring.js       # Connectivity and telemetry reporting
│   ├── device_security.js  # Device fingerprinting and anti-fraud signals
│   ├── voucher_ocr.js      # Voucher image OCR and validation
│   ├── admin.js            # Administrative dashboard and operational metrics
│   ├── admin_users.js      # User management, recolector/buyer moderation, ban and deletion controls
│   ├── admin_payments.js   # Recolector settlement review and payout operations
│   ├── admin_payment_config.js # Payout configuration panel
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
* **Canonical deployment:** apply every file in `supabase/migrations/` in ascending order using the project migration workflow. The remote migration history must match Git. A migration file must never be deleted or moved once applied, because the CLI tracks state by version number; revert a schema change with a new migration instead. The recycling catalog and the recarga subscriptions live in `supabase/migrations/20260928163919_bolivia_solo_reciclaje_y_suscripciones_recarga.sql`, followed by `20260928163945_fix_contract_catalog_function_name.sql` and `20260928164022_grant_suscripciones_recarga_to_authenticated.sql`.
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
python scripts/check_migration_history.py             # migration ordering and integrity
python scripts/parse_js.py                            # parse all js/ modules for syntax errors
```

`npm test` chains every guard. The final step, `scripts/test_db_integration.js`, needs real
browser credentials in `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`; without them it aborts by
design, and CI skips it when the secrets are absent.

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
* **Spatial Density Sonar for Recolectors:** When zoomed out (`zoom <= 14`), NOTIGAS clusters active neighborhood posts into weighted concentration zones with real-time sonar pulses (`🔥 18 un`, `⚡ 5 un`, etc.). Registered recolectors examine the collective demand map in real time to plan efficient collection routes.
* **Turn-by-Turn Navigation via Reference Posts:** Recolectors select an active post as a reference waypoint to trigger external turn-by-turn routing with Google Maps, serving that primary beacon and all neighboring posts clustered along that street.
* **Strict Category & City Isolation:** Recolectors exclusively access posts and telemetry matching their registered category and their registered operational city, preventing cross-category interference.

### Catalog Integrity
* **One source of truth:** `window.NOTIGAS_BO.CATEGORIAS` in `js/notigas_bo.js` defines code, label, type, color, and icon for the 5 active categories. The UI, the map badges, the map signage, and the PWA favicon are all generated from it.
* **Historical catalog is append-only:** `notigas_catalogo_categorias_historico()` still resolves the 6 retired codes so old orders keep their label and icon. The active catalog is `notigas_catalogo_categorias()`.
* **Server-derived type:** `tipo_solicitud` is computed by the database from `categoria`; a client cannot forge it.
* **Database constraint:** `pedidos.categoria` has a `CHECK` against the canonical catalog, so an out-of-catalog value is rejected at the storage layer rather than silently persisting.
* **No prices in the interface:** the recolector avatar, the recolector card, the live vendor list, and the map truck popup deliberately render no price. Guards fail the build if a price badge reappears.

### Database & Row Level Security (RLS)
* **Recarga subscriptions are private to their owner:** `public.suscripciones_recarga` has RLS enabled with four `auth.uid()`-scoped policies. `anon` holds **no** grants at all, and `authenticated` receives only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on its own rows. There is deliberately **no** client-readable view for administrators: any moderation surface must be a vetted `SECURITY DEFINER` RPC, never a relaxed policy.
* **Publicidad separada de Muro de Comentarios:** `public.anuncios_globales` contiene anuncios publicitarios persistentes administrados; `public.avisos` contiene publicaciones comunitarias con ciclo de vida de 48 horas. El espacio publicitario del tercer feed usa `posicion = 'muro_avisos'`, nunca una fila de `avisos`.
* **Strict Row Level Security:** RLS is enforced across all tables in the `public` schema. Neighbors can only modify their own posts, and registered recolectors access only sanitized free-post radar areas for their category/city; exact post data is available only after atomic assignment.
* **6-State Finite State Machine:** Enforces canonical lifecycle transitions (`pendiente` → `visto` → `asignado` → `entregado` / `recibido` / `cancelado`) strictly validated by database triggers (`trg_check_pedido_transition` & `guard_pedido_mutation`).
* **Automated Terminal Record Purge:** Cancelled and delivered posts are automatically swept by `rpc_purge_old_records()`, keeping PostgreSQL clean, optimized, and free of obsolete clutter.
* **Live GPS Telemetry (`rutas_repartidores`):** Atomic upserts per recolector (`user_id`, `last_active`) with automated pruning of inactive telemetry.
* **Atomic RPC Functions (`SECURITY DEFINER` with `search_path = public`):**
  * `rpc_assign_order`: Atomic single-recolector assignment with `FOR UPDATE` row locking.
  * `rpc_mark_order_seen`: Atomic status transition updating `estado = 'visto'` and `visto = true`.
  * `rpc_update_order_location`: Relocate active GPS coordinates with trigger-compliant validation.
  * `rpc_get_my_assigned_orders`: Secure retrieval of assigned post contact details for the active recolector.
  * `rpc_purge_old_records`: Automated garbage collection purging delivered/cancelled posts and stale telemetry.
  * `rpc_admin_list_users`: Administrative listing of neighbors and recolectors linked to authentic Supabase Auth UUIDs.
  * `rpc_admin_delete_user`: Complete administrative purge of non-admin accounts and associated relational records.
  * `rpc_admin_renew_order`: Administrative post renewal resetting state to `pendiente`.
  * `rpc_public_schema_contract`: Reports the live active/historical catalog counts and key invariants for deployment checks.
  * `delete_user_account`: Secure self-service account deletion cascading across all relational records.

---

## 🤝 Maintenance Rules

* **Encoding:** these files are UTF-8 without BOM. Never round-trip them through a
  PowerShell `Get-Content` / `Set-Content` pipeline, which corrupts the accented
  Spanish text. Use a proper editor.
* **Migrations:** never edit or move a migration that has already been applied.
  Add a new one; the CLI tracks state by version number.
* **Category changes:** the active catalog, the historical catalog, the
  `pedidos.categoria` constraint, and `scripts/check_bolivia_reciclaje_catalogo.py`
  must move together, or the guards will fail the build.
* **Cash never touches this repository.**
