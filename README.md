# NOTIGAS - Live Neighborhood Delivery & Geospatial Platform

NOTIGAS es una Progressive Web Application (PWA) dinámica de logística comunitaria y geolocalización en tiempo real, diseñada para conectar a vecinos compradores con repartidores y distribuidores locales a través de un mapa interactivo en vivo. El navegador recibe los archivos web directamente del alojamiento y toda la funcionalidad dinámica usa Supabase (Auth, PostgreSQL, PostGIS y Realtime).

Construida con **Vanilla JavaScript**, **Supabase PostgreSQL con PostGIS** y productos de Google. Aproximadamente el **80% de la aplicación fue desarrollado con Google Antigravity**.

---

## 🌟 Identidad del Proyecto y Tecnologías Google

* 🤖 **80% desarrollado con Google Antigravity:** La mayor parte de la construcción, revisión y refinamiento técnico de NOTIGAS se realizó con **Google Antigravity**, junto con decisiones funcionales específicas para su modelo logístico comunitario.
* 🔑 **Google Identity Services (Google Sign-In & OAuth 2.0):** Autenticación rápida, segura y sin fricción mediante cuentas Google para vecinos y repartidores, integrada con Supabase Auth y validación de tokens JWT.
* 🗺️ **Navegación externa con Google Maps:** Después de elegir y asignarse un pedido, el repartidor abre **Google Maps** para recibir indicaciones de ruta hacia el destino.
* 🎨 **Referencia visual Google Maps:** El mapa interno adopta una interfaz clara, controles blancos y una paleta cartográfica suave inspirada en la experiencia visual de Google Maps, sin presentarse como un mapa oficial de Google.
* 📱 **Compatibilidad con Google Chrome y PWA:** Service Worker, caché e instalación como aplicación web en Android y escritorio.

---

## 🚀 Key Features

* **Mapa Interactivo en Tiempo Real:** Visualización en vivo tanto para vecinos como para repartidores. Los compradores publican pedidos que generan marcadores geolocalizados y los conductores transmiten su telemetría GPS a medida que recorren el barrio.
* **Radar de Demanda Espacial:** Al alejar el mapa, las concentraciones de pedidos se muestran únicamente como ondas de radar. Al acercarse, el repartidor ve y elige pedidos individuales.
* **Sincronización Inmediata (Supabase Realtime):** Actualización instantánea de marcadores, pedidos y repartidores vía WebSockets sin necesidad de recargar la pantalla.
* **Roles de Usuario Duales:**
  * **Vecino (Comprador):** Solicita suministros esenciales (Gas GLP, Agua embotellada, abarrotes) y visualiza en tiempo real los camiones que se aproximan.
  * **Repartidor (Conductor):** Registra su ficha, transmite su ubicación GPS, elige un pedido individual y activa la navegación externa con Google Maps.
* **Muro Comunitario / Avisos de Barrio:** Tablón vecinal interactivo para alertas, comunicados y avisos con sistema de votación única y purga automática programada.
* **Panel de Administración Blindado:** Acceso administrativo vinculado a cuentas Google autorizadas, con control para renovar o eliminar pedidos y banear o eliminar compradores y repartidores.
* **Alta Automática de Repartidores:** La ficha se publica sin aprobación previa del administrador; las sanciones se aplican mediante baneo o eliminación.
* **Publicidad Separada:** Google AdSense se integra en el centro de los feeds de Repartidores y Avisos Gratis. La publicidad comercial local permanece en la franja inferior.

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
| **Navegación** | **Google Maps** abierto de forma externa para guiar al repartidor hacia el pedido asignado |
| **Plataforma Web** | Google Chrome, PWA, HTML5, CSS3 y JavaScript Vanilla |
| **Base de Datos & Backend** | **Supabase** (PostgreSQL 15+, PostGIS, Realtime WebSockets, Row Level Security) |
| **Alojamiento de Producción** | **Hostinger / Apache-LiteSpeed** como sitio estático, con reglas de seguridad y navegación PWA en `.htaccess` |

---

## 📂 Project Structure

```text
├── index.html              # Punto de entrada principal (Vistas Comprador, Repartidor y Admin)
├── .htaccess               # HTTPS, cabeceras de seguridad, caché y enrutamiento PWA en Hostinger
├── ads.txt                 # Vendedor autorizado de Google AdSense
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
│   ├── ads.js              # Google AdSense dentro de feeds y anuncio local inferior
│   ├── orders.js           # Creación, selección individual, asignación y entrega de pedidos
│   ├── admin.js            # Panel de control de administración y métricas operativas
│   ├── admin_users.js      # Moderación, baneo y eliminación de usuarios
│   └── events.js           # Event listeners e interacciones globales de la UI
├── styles/
│   └── main.css            # Hoja de estilos de la aplicación (Tokens de diseño y paleta Google Maps)
└── supabase/
    ├── full_production_schema.sql # ESQUEMA COMPLETO Y CONSOLIDADO PARA PRODUCCIÓN (1-Click Deploy)
    └── migrations/         # Migraciones incrementales históricas (001 a 044)
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
* **Opción B (Migraciones Incrementales):** Ejecuta los scripts disponibles en `supabase/migrations/` en orden numérico hasta `044`. En la base actualmente publicada deben aplicarse, en este orden, `043_production_privacy_and_integrity.sql` y `044_admin_control_auto_drivers_and_ads.sql`.
* Abre `js/supabase-config.js` y coloca tu `supabaseUrl` y tu `supabaseAnonKey`.

### 3. Configurar Google Identity Services & Auth
* En tu consola de Google Cloud, habilita **OAuth 2.0 Client ID** para aplicaciones web.
* En Supabase Dashboard -> **Authentication** -> **Providers** -> activa **Google** y añade tus credenciales (`Client ID` y `Client Secret`).

### 4. Ejecución en Desarrollo
No existe un gestor de paquetes ni un paso de compilación. Para una prueba completa, usa un subdominio HTTPS de pruebas en Hostinger o cualquier servidor web HTTPS y registra su URL de redirección en Supabase Auth. Abrir `index.html` con doble clic no permite validar correctamente OAuth, Service Worker ni algunas políticas del navegador.

### 5. Publicación en producción (Hostinger)
1. Activa el certificado SSL del dominio en Hostinger.
2. Sube el contenido de esta carpeta a `public_html`, incluyendo el archivo oculto `.htaccess`.
3. No subas las carpetas internas `.git`, `.agents`, `scripts` ni `supabase`.
4. Comprueba que `https://www.notigas.com/manifest.json` y `https://www.notigas.com/sw.js` respondan correctamente.
5. En Supabase Auth, registra `https://www.notigas.com` como URL del sitio y como URL de redirección permitida.

La aplicación no requiere compilación ni un proceso propio de servidor. Su capa de entrega son archivos HTML, CSS y JavaScript; la aplicación sigue siendo dinámica porque autenticación, pedidos, usuarios, GPS, anuncios y actualizaciones en vivo dependen de Supabase.

---

## 🏗️ Arquitectura de Producción y Seguridad

### Base de Datos & RLS
* **Row Level Security (RLS):** RLS activo y riguroso en todas las tablas del esquema `public`. Los compradores solo pueden gestionar sus propios pedidos, y los choferes solo pueden interactuar con pedidos disponibles o asignados a su cuenta.
* **Máquina de 5 Estados Oficiales:** `pendiente` → `visto` → `asignado` → `entregado` / `cancelado`, protegida mediante triggers a nivel de base de datos (`trg_check_pedido_transition`).
* **Telemetría GPS en Vivo (`rutas_repartidores`):** Registro atómico por repartidor (`user_id`, `last_active`) con purga automática de posiciones inactivas por más de 12 horas.
* **Privacidad por Rol:** El mapa público recibe ubicaciones aproximadas y nunca expone teléfonos o direcciones de terceros; el repartidor activo recibe el contacto completo solo después de asignarse el pedido.
* **Procedimientos RPC Atómicos (`SECURITY DEFINER` con `search_path = public`):**
  * `rpc_assign_order`: Asignación individual con bloqueo de fila `FOR UPDATE`.
  * `rpc_get_demand_clusters_v2`: Agrupación espacial con algoritmo DBSCAN determinista.
  * `rpc_get_my_assigned_orders`: Acceso seguro a los datos de contacto únicamente de pedidos asignados al conductor.
  * `rpc_admin_list_users`: Lista administrativa de compradores y repartidores con el ID real de Supabase Auth.
  * `rpc_admin_delete_user`: Eliminación completa de una cuenta no administradora y sus datos relacionados.
  * `rpc_admin_renew_order`: Renovación administrativa de un pedido y reapertura en estado `pendiente`.
  * `delete_user_account`: Eliminación en cascada de la cuenta y registros asociados.
