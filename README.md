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

## 🛠️ Technology Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (No React/Vue/Angular).
*   **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL).
*   **Mapping Provider:** [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles.
*   **Authentication:** Google OAuth & Custom Auth for Admins.
*   **Hosting:** Fully static, can be deployed on GitHub Pages, Vercel, Netlify, or any static file server.

## 📂 Project Structure

```text
├── index.html              # Main application entry point (Buyer/Vendor views)
├── panel270977.html        # Secret Administration Dashboard
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

3.  **Run Locally:**
    Since it's a static Vanilla JS app, you can use any local web server:
    ```bash
    # Using Node.js (npx)
    npx serve .
    
    # OR using Python
    python -m http.server 8000
    ```
    Navigate to `http://localhost:8000` in your browser.

## 🛡️ Security Notes
*   **Row Level Security (RLS):** Ensure RLS is enabled on all Supabase tables so users can only insert/delete their own orders, while still being able to read the public map data.
*   **Admin Panel:** The admin panel uses Security by Obscurity (a hidden HTML file) combined with a mandatory encrypted login. The first time the panel is opened, it will ask to set up the master admin credentials.
