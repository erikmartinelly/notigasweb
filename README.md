# NOTIGAS - Live Neighborhood Delivery & Geospatial Platform

NOTIGAS es una Progressive Web Application (PWA) de logística comunitaria y geolocalización en tiempo real, diseñada para conectar a vecinos compradores con repartidores y distribuidores locales a través de un mapa interactivo en vivo.

Construida con **Vanilla JavaScript** de alto rendimiento, **Supabase PostgreSQL con PostGIS**, y potenciada por el ecosistema de **Google (Google Antigravity, Google Identity Services, Google Maps Platform y Google PWA)**.

---

## 🌟 Identidad del Proyecto y Tecnologías Google

* 🤖 **Desarrollado con Google Antigravity:** La arquitectura avanzada, la lógica de clustering espacial DBSCAN, la seguridad estricta de base de datos (RLS) y las optimizaciones críticas de producción fueron desarrolladas y refinadas utilizando **Google Antigravity**, la plataforma de agentes de desarrollo asistido por IA de Google DeepMind.
* 🔑 **Google Identity Services (Google Sign-In & OAuth 2.0):** Autenticación rápida, segura y sin fricción mediante cuentas Google para vecinos y repartidores, integrada con Supabase Auth y validación de tokens JWT.
* 🗺️ **Integración y Navegación con Google Maps:**
  * **Navegación en Ruta:** Despacho y apertura automática de rutas giro a giro mediante **Google Maps** para que los repartidores naveguen de forma eficiente hacia los pedidos asignados.
  * **Estética y Paleta Visual Google Maps:** El motor de mapa interactivo está calibrado con la paleta de colores oficial de Google Maps (tonos cálidos en vías, áreas verdes suaves, cuerpos de agua celestes y tipografía Google Sans/Roboto).
  * **Geolocalización Adaptativa:** APIs de geolocalización de alta precisión siguiendo los estándares y directrices de Google Maps.
* 📱 **Estándares Google Chrome & PWA:** Arquitectura Progressive Web App (PWA) con Service Worker para caché inteligente, soporte offline y web app manifest para instalación nativa en Android, iOS y Desktop.

---

## 🚀 Key Features

* **Mapa Interactivo en Tiempo Real:** Visualización en vivo tanto para vecinos como para repartidores. Los compradores publican pedidos que generan marcadores geolocalizados y los conductores transmiten su telemetría GPS a medida que recorren el barrio.
* **Grupos de Demanda Espacial (AI & DBSCAN):** Algoritmo de agrupamiento geoespacial atómico que identifica concentraciones de pedidos pendientes para que los repartidores puedan tomar rutas completas en un solo paso.
* **Sincronización Inmediata (Supabase Realtime):** Actualización instantánea de marcadores, pedidos y repartidores vía WebSockets sin necesidad de recargar la pantalla.
* **Roles de Usuario Duales:**
  * **Vecino (Comprador):** Solicita suministros esenciales (Gas GLP, Agua embotellada, abarrotes) y visualiza en tiempo real los camiones que se aproximan.
  * **Repartidor (Conductor):** Registra su ficha de distribuidor, transmite su ubicación GPS y toma pedidos individuales o grupos de demanda.
* **Muro Comunitario / Avisos de Barrio:** Tablón vecinal interactivo para alertas, comunicados y avisos con sistema de votación única y purga automática programada.
* **Panel de Administración Blindado:** Acceso administrativo protegido mediante verificación de credenciales con hashing criptográfico y políticas RLS intransigibles.

---

## 🌍 Social Impact & Purpose (The "Why")

NOTIGAS nace con un profundo propósito social enfocado en los sectores más vulnerables de Bolivia.

En Bolivia, miles de familias dependen del gas licuado de petróleo en garrafas para cocinar y subsistir. Cuando se agota el gas, trasladarse a una planta distribuidora lejana implica costos de transporte elevados que muchas familias no pueden afrontar. Comprar directamente a los camiones repartidores del barrio es mucho más económico, pero tradicionalmente dependía del azar de escuchar la campana del camión al pasar.

NOTIGAS resuelve esta necesidad democratizando el acceso a la tecnología y la logística en tiempo real. Al conectar directamente a los vecinos con los distribuidores locales a través de mapas inteligentes y optimización de rutas, garantizamos que los camiones lleguen de manera rápida y predecible a quienes más lo necesitan, reduciendo el costo de vida y convirtiendo la tecnología en un catalizador de equidad social.

---

## 🛠️ Technology Stack

| Capa | Tecnología |
| :--- | :--- |
| **Ingeniería e IA** | **Google Antigravity (AGY)** (Desarrollo y refactorización asistida por agentes) |
| **Autenticación** | **Google Identity Services** (Google OAuth 2.0 & One-Tap) + Supabase Auth |
| **Navegación y Mapas** | **Google Maps Platform** (Navegación de conductores) + Motor Leaflet calibrado con paleta visual Google Maps |
| **Plataforma Web** | **Google PWA Standards**, HTML5, CSS3 Moderno, JavaScript Vanilla (sin frameworks pesados) |
| **Base de Datos & Backend** | **Supabase** (PostgreSQL 15+, PostGIS, Realtime WebSockets, Row Level Security) |
| **Servidor de Producción** | **Node.js / Express** (`server.js`) con cabeceras estrictas de seguridad (CSP, HSTS, Anti-Clickjacking) |

---

## 📂 Project Structure

```text
├── index.html              # Punto de entrada principal (Vistas Comprador, Repartidor y Admin)
├── server.js               # Servidor Express de producción (Cabeceras de seguridad CSP y enrutamiento PWA)
├── package.json            # Dependencias del servidor Node.js
├── sw.js                   # Service Worker (Caché progresivo y soporte offline PWA)
├── manifest.json           # Manifiesto Web PWA
├── js/                     # Módulos JavaScript de la aplicación
│   ├── state.js            # Estado reactivo centralizado (Pub/Sub)
│   ├── ui.js               # Helpers visuales, overlays, modales y notificaciones toast
│   ├── supabase-config.js  # Inicialización de Supabase, canales y suscripciones Realtime
│   ├── auth.js             # Autenticación con cuenta Google, sesiones y roles de usuario
│   ├── vendors.js          # Perfiles de negocio de repartidores y filtros por categoría
│   ├── map.js              # Inicialización de mapa, marcadores en vivo y clustering
│   ├── map_search.js       # Búsqueda y geocodificación de calles/municipios con fallback multi-motor
│   ├── map_gps.js          # Seguimiento GPS adaptativo y telemetría en vivo
│   ├── forum.js            # Foro vecinal, publicaciones comunitarias y comentarios
│   ├── ads.js              # Anuncios locales y banners dinámicos
│   ├── orders.js           # Creación de pedidos, asignación individual y grupos de demanda
│   ├── admin.js            # Panel de control de administración y métricas operativas
│   ├── admin_users.js      # Moderación de usuarios y habilitación de repartidores
│   └── events.js           # Event listeners e interacciones globales de la UI
├── styles/
│   └── main.css            # Hoja de estilos de la aplicación (Tokens de diseño y paleta Google Maps)
└── supabase/
    ├── full_production_schema.sql # ESQUEMA COMPLETO Y CONSOLIDADO PARA PRODUCCIÓN (1-Click Deploy)
    └── migrations/         # Migraciones incrementales históricas (001 a 042)
```

---

## ⚙️ Setup & Installation

### 1. Clonar el Repositorio
```bash
git clone https://github.com/erikmartinelly/notigasweb.git
cd notigasweb
```

### 2. Configurar la Base de Datos (Supabase)
* Crea un nuevo proyecto en [Supabase](https://supabase.com/).
* **Opción A (Recomendada - Despliegue en 1 Clic):** Ejecuta el archivo consolidado [`supabase/full_production_schema.sql`](supabase/full_production_schema.sql) en el SQL Editor de Supabase. Este script único crea todas las tablas, extensiones (PostGIS), vistas públicas autorizadas, índices de alto rendimiento, triggers automáticos, procedimientos RPC atómicos y políticas de seguridad RLS.
* **Opción B (Migraciones Incrementales):** Ejecuta los scripts en `supabase/migrations/` en orden numérico estricto (`001` a `042`).
* Abre `js/supabase-config.js` y coloca tu `supabaseUrl` y tu `supabaseAnonKey`.

### 3. Configurar Google Identity Services & Auth
* En tu consola de Google Cloud, habilita **OAuth 2.0 Client ID** para aplicaciones web.
* En Supabase Dashboard -> **Authentication** -> **Providers** -> activa **Google** y añade tus credenciales (`Client ID` y `Client Secret`).

### 4. Ejecución en Desarrollo
```bash
npx serve .
```

### 5. Ejecución en Producción
```bash
npm install
npm start
```
Abre `http://localhost:3000` en tu navegador.

---

## 🏗️ Arquitectura de Producción y Seguridad

### Base de Datos & RLS
* **Row Level Security (RLS):** RLS activo y riguroso en todas las tablas del esquema `public`. Los compradores solo pueden gestionar sus propios pedidos, y los choferes solo pueden interactuar con pedidos disponibles o asignados a su cuenta.
* **Máquina de 5 Estados Oficiales:** `pendiente` → `visto` → `asignado` → `entregado` / `cancelado`, protegida mediante triggers a nivel de base de datos (`trg_check_pedido_transition`).
* **Telemetría GPS en Vivo (`rutas_repartidores`):** Registro atómico por repartidor (`user_id`, `last_active`) con purga automática de posiciones inactivas por más de 12 horas.
* **Procedimientos RPC Atómicos (`SECURITY DEFINER` con `search_path = public`):**
  * `rpc_assign_order`: Asignación individual con bloqueo de fila `FOR UPDATE`.
  * `rpc_get_demand_clusters_v2`: Agrupación espacial con algoritmo DBSCAN determinista.
  * `rpc_accept_demand_cluster_v2`: Aceptación atómica por lotes de grupos de demanda.
  * `rpc_get_my_assigned_orders`: Acceso seguro a los datos de contacto únicamente de pedidos asignados al conductor.
  * `delete_user_account`: Eliminación en cascada de la cuenta y registros asociados.
