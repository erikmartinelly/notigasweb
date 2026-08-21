# NOTIGAS - Live Neighborhood Delivery & Geospatial Platform

NOTIGAS is a dynamic, high-performance Progressive Web Application (PWA) for community-driven logistics and real-time geolocation. It is designed to connect neighborhood buyers with local delivery drivers and distributors via a live interactive map. The browser receives web assets directly from hosting, while all dynamic real-time operations are powered by Supabase (Auth, PostgreSQL, PostGIS, and Realtime WebSockets).

Engineered with **Vanilla JavaScript**, **Supabase PostgreSQL with PostGIS**, and Google developer technologies. Over **80% of the application was built, architected, and continuously refined using the Gemini 3.7 Flash AI model** (powered via Google Antigravity).

---

## 🌟 Project Identity & Google Technologies

* 🤖 **80% Built with Gemini 3.7 Flash & Google Antigravity:** The core architecture, full-stack database triggers, real-time spatial algorithms, iterative refactoring, and technical hardening of NOTIGAS were built with the **Gemini 3.7 Flash** model through **Google Antigravity**, tailored to a neighborhood-scale real-time logistics model.
* 🔑 **Google Identity Services (Google Sign-In & OAuth 2.0):** Rapid, secure, frictionless authentication using Google accounts for buyers and drivers, seamlessly integrated with Supabase Auth and JWT verification.
* 🗺️ **Turn-by-Turn Navigation with Google Maps:** Once a driver selects and is assigned an order, the system launches **Google Maps** with pre-configured coordinates for direct turn-by-turn routing to the destination.
* 🎨 **Google Maps Visual Aesthetics:** The in-app map interface features a clean, high-contrast visual layout, crisp white floating controls, and a subtle cartographic palette inspired by the Google Maps user experience.
* 📱 **PWA & Google Chrome Optimization:** Complete Progressive Web App compliance featuring offline caching, instant load times, and installability on Android and desktop Chrome.

---

## 🚀 Key Features

* **Real-Time Interactive Map:** Live synchronized visualization for buyers and drivers. Buyers publish supply requests that generate geolocated map markers, while delivery trucks transmit live GPS telemetry as they navigate neighborhood streets.
* **Spatial Demand Radar:** When zoomed out on the map (`zoom <= 14`), orders and density clusters emit radiating sonar radar waves. When zoomed in, drivers can inspect individual orders with precise pins.
* **Instant WebSocket Sync (Supabase Realtime):** Sub-second updates for order statuses, markers, and active delivery trucks without requiring page refreshes.
* **Dual User Roles:**
  * **Neighbor (Buyer):** Request essential supplies (LPG gas cylinders, bottled water, groceries) and track approaching delivery trucks in real time.
  * **Driver (Delivery Partner):** Register a business profile, stream GPS location telemetry, choose individual orders, and trigger external turn-by-turn routing with Google Maps.
* **Community Board / Neighborhood News:** Interactive bulletin board for community alerts, official notifications, and local announcements with single-vote reputation scoring and automatic scheduled purging.
* **Hardened Admin Panel:** Secure administrative controls restricted to verified Google Admin accounts, featuring order renewals/cancellations, user moderation, and driver onboarding controls.
* **Automated Driver Onboarding:** Driver profiles publish automatically without manual pre-approval, with administrative moderation handled through instant ban and deletion controls.
* **Separated Advertising Hierarchy:** Google AdSense is integrated centrally within the Drivers and Community News feeds. Local sponsor ads remain fixed in the bottom banner.

---

## 🌍 Social Impact & Purpose (The "Why")

NOTIGAS was created with a clear social mission focused on vulnerable communities across Bolivia.

In Bolivia, thousands of families depend on liquefied petroleum gas (LPG) cylinders for daily cooking and survival. When gas runs out, traveling to distant distribution depots incurs substantial transportation expenses that many households cannot easily afford. Purchasing directly from neighborhood delivery trucks is significantly more affordable, but historically required waiting and hoping to hear the truck's bell as it drove past.

NOTIGAS bridges this gap by democratizing access to modern geospatial logistics in real time. By connecting neighbors directly with local distributors through intelligent mapping and demand visualization, delivery trucks reach households quickly and reliably, lowering living costs and transforming everyday technology into a catalyst for social equity.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Engineering & AI Model** | **Gemini 3.7 Flash** (via Google Antigravity - Autonomous software engineering, architecture, and code generation for 80%+ of the project) |
| **Authentication** | **Google Identity Services** (Google OAuth 2.0 & One-Tap) + Supabase Auth |
| **Navigation** | **Google Maps** (External route guidance for assigned delivery drivers) |
| **Web Platform** | Google Chrome, PWA, HTML5, CSS3, and Vanilla JavaScript |
| **Database & Realtime** | **Supabase** (PostgreSQL 15+, PostGIS, Realtime WebSockets, Row Level Security) |
| **Production Hosting** | **Hostinger Web App** with a lightweight Express static asset adapter; Supabase powers the dynamic backend |

---

## 📂 Project Structure

```text
├── index.html              # Main single-page application entry point (Buyer, Driver, and Admin views)
├── package.json            # Deployment configuration and build scripts for Hostinger Web App runtime
├── server.js               # Static asset server adapter; business logic remains in Supabase
├── .htaccess               # HTTPS enforcement, security headers, cache policies, and SPA routing
├── ads.txt                 # Authorized Google AdSense digital seller declaration
├── sw.js                   # Service Worker (Progressive caching, asset versioning, and offline PWA support)
├── manifest.json           # PWA Web Application Manifest
├── js/                     # Modular frontend JavaScript architecture
│   ├── state.js            # Centralized reactive state management (Pub/Sub)
│   ├── ui.js               # Visual helpers, loading overlays, modals, and toast alerts
│   ├── supabase-config.js  # Supabase client initialization, Realtime channels, and subscriptions
│   ├── auth.js             # Google OAuth integration, session persistence, and role management
│   ├── vendors.js          # Driver business profiles and category filtering
│   ├── map.js              # Leaflet map engine, live marker rendering, and demand sonar radar
│   ├── map_search.js       # Address geocoding and street search with multi-engine fallback
│   ├── map_gps.js          # Adaptive GPS geolocation tracking and live telemetry broadcasting
│   ├── forum.js            # Community bulletin board, neighborhood posts, and comments
│   ├── ads.js              # Google AdSense in-feed units and bottom local sponsor banner
│   ├── orders.js           # Order creation, individual selection, assignment, and delivery lifecycle
│   ├── admin.js            # Administrative dashboard and operational metrics
│   ├── admin_users.js      # User management, driver/buyer moderation, ban and deletion controls
│   └── events.js           # Delegated DOM event handlers and global UI interactions
├── styles/
│   └── main.css            # Application design tokens, responsive layouts, and Google Maps-inspired UI
├── supabase/
│   ├── full_production_schema.sql # CONSOLIDATED PRODUCTION SCHEMA (1-Click Database Deployment - v083)
│   └── migrations/         # Historical incremental migrations (001 through 083)
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
* **Option A (Recommended - 1-Click Deployment):** Execute [`supabase/full_production_schema.sql`](supabase/full_production_schema.sql) in the Supabase SQL Editor. This single script provisions all tables, PostGIS extensions, public views, spatial clustering, automated triggers, strict category/city isolation, atomic RPC functions, and Row Level Security (RLS) policies through version `083`.
* **Option B (Incremental Migrations):** Run the migration files inside `supabase/migrations/` in sequential order through `083`.
* Open `js/supabase-config.js` and input your `supabaseUrl` and `supabaseAnonKey`.

### 3. Configure Google Identity Services & Auth
* In the Google Cloud Console, configure an **OAuth 2.0 Client ID** for Web Applications.
* In Supabase Dashboard -> **Authentication** -> **Providers** -> enable **Google** and add your credentials (`Client ID` and `Client Secret`).
* Add your authorized domains and redirect URIs in both Google Cloud Console and Supabase Auth settings.

### 4. Local Development
The PWA runs natively in modern browsers with zero build step required. The `package.json` and `server.js` files are provided to support standard Node.js hosting environments (such as Hostinger Web Apps). For full local testing with Google Sign-In and Geolocation APIs, serve over HTTPS or `localhost`.

```bash
# Optional local test server
node server.js
```

### 5. Production Deployment (Hostinger)
1. Enable SSL/HTTPS on your custom domain in Hostinger.
2. In Hostinger Web App deployment settings, specify `npm start` as the startup command.
3. Verify that hidden directories (`.git`, `.agents`, `scripts`, `supabase`) are restricted from public directory browsing.
4. Validate that `https://www.notigas.com/manifest.json`, `https://www.notigas.com/ads.txt`, and `https://www.notigas.com/sw.js` serve with appropriate MIME types.
5. In Supabase Auth, register `https://www.notigas.com` as the primary Site URL and as an authorized redirect URI.

---

## 🏗️ Production Architecture & Core Logistics Model

### 📡 Collective Demand Aggregation Philosophy
* **Demand Aggregation & Delivery Beacons:** NOTIGAS is fundamentally designed around **collective neighborhood demand aggregation**. Individual customer orders act as live **geospatial demand beacons and delivery waypoints**.
* **Spatial Density Sonar for Drivers:** When zoomed out (`zoom <= 14`), NOTIGAS clusters active neighborhood orders into weighted concentration zones with real-time sonar pulses (`🔥 18 un`, `⚡ 5 un`, etc.). Authorized delivery drivers examine the collective demand map in real time to locate profitable delivery routes and fulfill clustered neighborhood demand efficiently.
* **Turn-by-Turn Navigation via Reference Orders:** Drivers select an active order as a reference waypoint to trigger external turn-by-turn routing with Google Maps, serving that primary beacon and all neighboring buyers clustered along that street.
* **Strict Category & City Isolation:** Drivers exclusively access orders and telemetry matching their registered category (`Gas GLP` $\leftrightarrow$ `Gas GLP`, `Agua Potable` $\leftrightarrow$ `Agua Potable`) and their registered operational city, preventing cross-category interference.

### Database & Row Level Security (RLS)
* **Strict Row Level Security:** RLS is enforced across all tables in the `public` schema. Buyers can only modify their own orders, and verified drivers only access active demand points within their category and city.
* **6-State Finite State Machine:** Enforces canonical order lifecycle transitions (`pendiente` → `visto` → `asignado` → `entregado` / `recibido` / `cancelado`) strictly validated by database triggers (`trg_check_pedido_transition` & `guard_pedido_mutation`).
* **Automated Terminal Record Purge:** Cancelled and delivered orders are automatically swept by `rpc_purge_old_records()`, keeping PostgreSQL clean, optimized, and free of obsolete clutter.
* **Live GPS Telemetry (`rutas_repartidores`):** Atomic upserts per driver (`user_id`, `last_active`) with automated pruning of inactive telemetry.
* **Atomic RPC Functions (`SECURITY DEFINER` with `search_path = public`):**
  * `rpc_assign_order`: Atomic single-driver order assignment with `FOR UPDATE` row locking.
  * `rpc_mark_order_seen`: Atomic status transition updating `estado = 'visto'` and `visto = true`.
  * `rpc_update_order_location`: Relocate active order GPS coordinates with trigger-compliant validation.
  * `rpc_get_my_assigned_orders`: Secure retrieval of assigned order contact details for the active driver.
  * `rpc_purge_old_records`: Automated garbage collection purging delivered/cancelled orders and stale telemetry.
  * `rpc_admin_list_users`: Administrative listing of buyers and drivers linked to authentic Supabase Auth UUIDs.
  * `rpc_admin_delete_user`: Complete administrative purge of non-admin accounts and associated relational records.
  * `rpc_admin_renew_order`: Administrative order renewal resetting state to `pendiente`.
  * `delete_user_account`: Secure self-service account deletion cascading across all relational records.
