# 📦 NOTIGAS - Versión 1.0 (Bolivia & Paraguay)

**NOTIGAS v1.0** es una plataforma móvil P2P y comunitaria para la señalización en tiempo real de garrafas de gas GLP, productos barriales (agua 20L, frutas/verduras, chatarra, detergentes) y foros de la OTB estilo Reddit, operando a **$0 costo de infraestructura de datos**.

---

## 🌟 Funcionalidades Principales (v1.0)
1. **🗺️ Mapa HD Multi-Vehículo ($0 API):** Rastreo GPS dinámico con camión grande GLP (`🚚 GASERO CERCA` / `🅿️ GASERO DETENIDO`) y camionetas pequeñas diferenciadas (`water_drop`, `shopping_basket`, `recycling`, `cleaning_services`).
2. **🛑 Botón de Pánico Universal (`🛑 ¡ESPERA! TE SIGO`):** 1 Bip corto (0.5s) + destello LED rojo en la pantalla del chofer para todas las categorías.
3. **✅ Desactivación Manual:** Botón **`✅ YA COMPRÉ MI GARRAFA`** para retirar señales del mapa al instante.
4. **⏳ Expiración Diferenciada:** 72 horas para avisos/pedidos (evitando falsas expectativas a choferes) y 7 días para el Foro Barrial.
5. **🗣️ Chat & Foro Barrial Estilo Reddit:** Muro continuo unificado de pantalla única con votos (`▲ / ▼`), flairs y moderación.
6. **🔑 Panel Administrador por Gmail (`erikmartinelly@gmail.com`):** Control total de comunicados oficiales, baneos, administradores secundarios y banners de publicidad mimetizada.
7. **💬 Redirección Directa a WhatsApp (`wa.me`):** Intercambio de fotos y ubicaciones sin saturar la base de datos.

---

## 🗄️ Base de Datos & Backend
- **Proveedor:** Supabase Cloud
- **Región:** `South America (São Paulo)` (`sa-east-1`)
- **Project Base URL:** `https://yxzzfqyehllogzzhdtmc.supabase.co`
- **Publishable Key (`anon`):** `sb_publishable_wWVQ59Rejod5Oc1X4s_eeQ_ONbXzyi2`
- **Script SQL:** Incluido en `supabase_schema.sql`.

---

## 📱 Compilación Android APK
- **Archivo Instalable:** `build/app/outputs/flutter-apk/app-release.apk`
- **Modo:** `--release`
