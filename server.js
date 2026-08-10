const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Headers de seguridad para producción
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
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

