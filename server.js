const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

// Encabezados de seguridad
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Endpoint de salud
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Servir ads.txt con Content-Type texto plano
app.get('/ads.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'ads.txt'));
});

// Servir sw.js con encabezados de Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Servir archivos estáticos del proyecto
app.use(express.static(__dirname));

// Fallback SPA para PWA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ NOTIGAS iniciado exitosamente en puerto ${PORT}`);
});
