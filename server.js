const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// =============================================================================
// CABECERAS DE SEGURIDAD COMPLETAS (FIX: CSP + HSTS + Anti-Clickjacking)
// =============================================================================
app.use((req, res, next) => {
  // Previene ataques de tipo MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Previene que la app sea embebida en iframes ajenos (clickjacking)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Protección XSS legacy para browsers antiguos
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Controla qué información de origen se envía en cabeceras Referer
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permisos de APIs de hardware (solo geolocalización permitida)
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');

  // FIX: Fuerza HTTPS en el navegador durante 1 año (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // FIX: Bloquea acceso de dominios externos a recursos Flash/PDF cruzados
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // FIX: Content-Security-Policy — Lista blanca explícita de todos los recursos permitidos
  // Dominios autorizados: Supabase, Google (Auth + Fonts + AdSense), OSM, Font Awesome, jsDelivr/unpkg (CDNs)
  const csp = [
    // Solo scripts del mismo origen + CDNs explícitamente listados
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://pagead2.googlesyndication.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
    // Estilos del mismo origen + Google Fonts + Font Awesome
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
    // Fuentes tipográficas
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    // Conexiones de datos (Supabase, Google, OSM, GeoIP, OSRM)
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://ipinfo.io https://ipapi.co https://freeipapi.com https://ipwho.is https://*.tile.openstreetmap.org https://router.project-osrm.org",
    // Imágenes (OSM tiles + Supabase Storage + data URIs para favicons dinámicos)
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.supabase.co https://pagead2.googlesyndication.com",
    // Workers (Service Worker)
    "worker-src 'self'",
    // Frames: solo Google para One-Tap
    "frame-src https://accounts.google.com",
    // Formularios solo al mismo origen
    "form-action 'self'",
    // Manifiesto PWA
    "manifest-src 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);

  next();
});

// Servir archivos estáticos del directorio actual
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    // Asegurar tipo MIME correcto para manifest y SW
    if (filePath.endsWith('.webmanifest') || filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Para cualquier ruta que no sea un archivo, devolver index.html (SPA/PWA routing fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`NOTIGAS PWA Server running on port ${PORT}`);
});
