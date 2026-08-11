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
*   **Secret Admin Dashboard:** A hidden administration panel (`panel270977.html`) protected by a strict dual-authentication system with SHA-256 local hashing and Supabase storage, preventing unauthorized access to business metrics and user moderation.

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
├── index.html              # Main application entry point (Buyer/Vendor views)
├── panel270977.html        # Secret Administration Dashboard
├── server.js               # Express server for production (Security headers & PWA routing)
├── package.json            # Node.js dependencies for the server
├── app.js                  # Core business logic and state management
├── map.js                  # Leaflet map initialization, GPS tracking, and marker logic
├── auth.js                 # User roles, Google OAuth, and session management
├── admin.js                # Admin dashboard logic and authentication system
├── vendors.js              # Vendor business profile management
├── forum.js                # Neighborhood forum posting and logic
├── supabase-config.js      # Supabase initialization and realtime subscriptions
├── sw.js                   # Service Worker for PWA caching
├── supabase_schema.sql     # Database tables, RLS policies, and triggers
└── styles/                 # CSS stylesheets
```

## ⚙️ Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/erikmartinelly/notigasweb.git
    cd notigasweb
    ```

2.  **Configure Supabase:**
    *   Create a new project in Supabase.
    *   Run the provided `supabase_schema.sql` (and the `admin_credentials` SQL) in the Supabase SQL Editor to create the required tables and RLS policies.
    *   Open `supabase-config.js` and replace the placeholder `supabaseUrl` and `supabaseAnonKey` with your project's actual credentials.

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
*   **Admin Panel:** The admin panel uses Security by Obscurity (a hidden HTML file) combined with a mandatory encrypted login. The first time the panel is opened, it will ask to set up the master admin credentials.
