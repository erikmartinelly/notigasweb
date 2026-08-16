# NOTIGAS - Live Neighborhood Delivery & Map Application

NOTIGAS is a real-time Progressive Web Application (PWA) designed to connect neighborhood residents ("Vecinos"/Buyers) with local distributors and delivery drivers ("Repartidores"/Vendors) via an interactive live map. 

Built entirely with **Vanilla JavaScript** and powered by **Supabase**, NOTIGAS requires no complex frontend framework, making it extremely fast, lightweight, and easy to deploy.

## 🚀 Key Features

*   **Live Interactive Map (Leaflet):** Both buyers and vendors can see each other in real-time. Buyers place orders that drop pins on the map, and vendors broadcast their live GPS location as they drive through the neighborhood.
*   **Real-Time Synchronization:** Powered by Supabase Realtime (WebSockets). Map markers, orders, and driver locations are updated instantly across all connected clients without needing to refresh the page.
*   **Dual User Roles:**
    *   **Vecino (Buyer):** Can request delivery services (e.g., Gas GLP, groceries, water) and track approaching trucks on the map.
    *   **Repartidor (Vendor):** Creates a "Business Profile", broadcasts their real-time route, and accepts nearby orders.
*   **Neighborhood Forum:** A community bulletin board for alerts, sales, and announcements. Posts automatically expire and are purged from the database after 72 hours (via Supabase `pg_cron`) to maintain app performance.
*   **Offline-Ready (PWA):** Includes a Service Worker (`sw.js`) with progressive caching, allowing the app to load quickly and gracefully handle poor network conditions.
*   **Secret Admin Dashboard:** A hidden administration modal protected by strict validation against the Supabase database and RLS policies, preventing unauthorized access to business metrics and user moderation.

## 🌍 Social Impact & Purpose (The "Why")

NOTIGAS is not just a technological tool; it is a project driven by a deep social purpose aimed at the most vulnerable sectors in Bolivia. 

In Bolivia, it is predominantly the poorest families who rely on propane gas cylinders (*garrafas*) for their daily survival (cooking and heating). When a family runs out of gas, the traditional alternative is to take a taxi to a distant distribution plant, which costs money they simply cannot afford to spend. Buying directly from the neighborhood delivery trucks is significantly cheaper, but finding a passing truck is currently a matter of luck, leading to anxiety, wasted time, and sometimes being unable to cook.

NOTIGAS bridges this gap by democratizing access to Artificial Intelligence and real-time logistics. By providing grassroots vendors with AI-driven Predictive Heatmaps and algorithmic route optimization, we ensure that delivery trucks reach the neighborhoods that need them most, faster and more efficiently. Our mission goes beyond making money; we are using advanced tech to lower the cost of living for those at the bottom of the economic pyramid, proving that AI can be a powerful catalyst for social equity.

## 🛠️ Technology Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (No React/Vue/Angular).
*   **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL).
*   **Mapping Provider:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles.
*   **Authentication:** Google OAuth & Custom Auth for Admins.
*   **Hosting:** Deployable on standard Node.js environments (like Hostinger, Heroku, or Render) using the provided Express server (`server.js`) which enforces strict security headers (CSP, HSTS).

## 📂 Project Structure

```text
├── index.html              # Main application entry point (Buyer/Vendor/Admin views)
├── server.js               # Express server for production (Security headers & PWA routing)
├── package.json            # Node.js dependencies for the server
├── sw.js                   # Service Worker for PWA caching & offline support
├── manifest.json           # PWA web manifest
├── js/                     # Application JavaScript modules
│   ├── state.js            # Centralized reactive application state management (Pub/Sub)
│   ├── ui.js               # Common UI helpers, loading overlays, modals and toasts
│   ├── supabase-config.js  # Supabase initialization, connection and Realtime subscriptions
│   ├── auth.js             # User roles, Google OAuth (One-Tap), email auth, and session management
│   ├── vendors.js          # Vendor business profiles & category filtering
│   ├── map.js              # Leaflet map initialization, live markers, and clustering
│   ├── map_search.js       # Street & city geocoding with multi-engine fallback (Nominatim/Photon)
│   ├── map_gps.js          # Adaptive GPS tracking and fallback geolocation
│   ├── forum.js            # Neighborhood community forum & live comment threads
│   ├── ads.js              # Live local ads & dynamic banners
│   ├── orders.js           # Order creation, individual & cluster assignment, delivery flows
│   ├── admin.js            # Admin dashboard logic, metrics, and security authentication
│   ├── admin_users.js      # User & driver moderation, banning, and approval workflows
│   └── events.js           # Event listeners and UI interactions
├── styles/
│   └── main.css            # Application CSS stylesheet
└── supabase/
    └── migrations/         # Database tables, RLS policies, RPC functions, and triggers (001 - 039)
```

## ⚙️ Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/erikmartinelly/notigasweb.git
    cd notigasweb
    ```

2.  **Configure Supabase:**
    *   Create a new project in Supabase.
    *   Run the SQL scripts located in the `supabase/migrations/` folder in numerical order (from `001_initial_setup.sql` to `039_unify_cluster_id_algorithm.sql`) in the Supabase SQL Editor to create the required tables, RLS policies, storage buckets, and secure RPC functions.
        * **014_fix_auth_triggers.sql:** Deletes conflicting triggers on `auth.users` and is **mandatory** for all deployments to prevent registration failures.
        * **027_profiles_location_seen_and_account_cleanup.sql:** User profiles, location caching, and cascading `delete_user_account()` RPC.
        * **033_official_notices_and_purge_rpc.sql:** Official admin broadcast notices and automated database cleanup RPCs.
        * **035_refine_rpc_assign_order_and_index.sql:** Atomic order assignment with row locking `FOR UPDATE` and category normalization.
        * **036_robust_admin_credentials_and_is_admin.sql:** Multi-tenant admin credentials validation and `is_admin_email()` security checks.
        * **037_harden_rls_policies.sql:** Comprehensive Row-Level Security (RLS) policies for orders, drivers, and moderation.
        * **038_add_updated_at_to_pedidos.sql:** Adds `updated_at` column to `pedidos` with automatic update trigger and index.
        * **039_unify_cluster_id_algorithm.sql:** Unifies deterministic `cluster_id` generation across `rpc_get_demand_clusters_v2`, `rpc_get_orders_for_cluster_v2`, and `rpc_accept_demand_cluster_v2`.
    *   Open `js/supabase-config.js` and replace the placeholder `supabaseUrl` and `supabaseAnonKey` with your project's actual credentials.
    *   **⚠️ IMPORTANT - Email Confirmation:** Supabase requires email confirmation by default for new registrations. If you wish to disable this during testing or development, go to your Supabase Dashboard -> **Authentication** -> **Providers** -> **Email** and toggle off **Confirm email**. Ensure your `Site URL` and `Redirect URLs` in Supabase Auth configuration point to your production domain.

3.  **Run Locally (Development):**
    For quick development, you can use any static server:
    ```bash
    npx serve .
    ```

4.  **Run in Production:**
    The application includes a Node.js Express server (`server.js`) designed to serve the static frontend while injecting critical security headers (CSP, HSTS, Anti-Clickjacking).
    ```bash
    npm install
    npm start
    ```
    Navigate to `http://localhost:3000` in your browser.

## 🛡️ Security Notes
*   **Row Level Security (RLS):** Ensure RLS is enabled on all Supabase tables so users can only insert/delete their own orders, while still being able to read the public map data.
*   **Admin Panel:** The admin panel is integrated into the main application via a hidden modal, but real protection of sensitive operations depends exclusively on Supabase RLS and `is_admin_email()` policies validating the JWT.

## 🏗️ ARQUITECTURA DE PRODUCCIÓN

### Base de Datos
*   **Supabase Auth**: Maneja la identidad.
*   **profiles**: Perfil persistente del usuario y ubicación habitual del comprador.
*   **choferes_habilitados**: Ficha del repartidor, ciudad operativa y categoría.
*   **pedidos**: Fuente única de verdad de los pedidos.
*   **rutas_repartidores**: Posición temporal de los repartidores.
*   **AppState**: Solamente estado de interfaz (no debe escribir persistentemente en Auth).

### Ubicación y GPS
*   **Comprador**: Usa GPS (getCurrentPosition) una sola vez durante el registro para guardar su ubicación habitual en `profiles`. Se informa al usuario que puede apagar el GPS. NUNCA usa `watchPosition`.
*   **PC**: Intenta `navigator.geolocation` primero. Si falla, usa IP solamente como fallback aproximado. La IP nunca se considera domicilio exacto.
*   **Repartidor**: Usa GPS continuo (`watchPosition`) con precisión adaptativa. Transmite ubicación a Supabase cuando hay movimiento significativo (~15 metros) y usa un heartbeat para indicar que está detenido. *Nota Técnica: Al ser una PWA que corre en el navegador, el tracking en background (pantalla apagada o app minimizada) depende estrictamente de las políticas de ahorro de batería de iOS/Android y podría ser pausado por el sistema operativo.*

### Pedidos
*   Los pedidos son grupales y un repartidor puede ver los pedidos de su zona/categoría.
*   **Rojo**: Pedido nuevo o no visto.
*   **Amarillo**: Pedido "visto" por algún repartidor. 
*   **Importante**: Que un pedido esté amarillo (`visto = true`) NO significa que esté asignado/tomado. Su estado continúa siendo `pendiente` y sigue formando parte de los grupos en el mapa.

### Realtime y Enrutamiento
*   **Realtime**: Es el mecanismo principal.
*   **Polling**: Se utiliza como fallback solamente cuando Realtime está desconectado.
*   **Rutas OSRM**: No se recalculan por tiempo fijo, sino cuando el repartidor se ha desplazado aproximadamente 30 metros.

### Eliminación de Cuentas
*   La función RPC `delete_user_account()` es la autoridad única en la base de datos para eliminar la cuenta y todos los datos asociados de forma segura, garantizando la limpieza en cascada.
