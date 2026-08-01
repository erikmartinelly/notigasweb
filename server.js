const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-Memory Admin & Ads State
let configPublicidad = {
  googleAdsensePubId: process.env.GOOGLE_ADSENSE_PUB_ID || 'ca-pub-XXXXXXXXXXXXXX',
  textoAnuncioNativo: 'Servicios técnicos & Comercio local verificado en la OTB',
  urlAnuncioContacto: 'https://wa.me/59170712345?text=Hola!%20Deseo%20publicar%20anuncio%20en%20NOTIGAS',
  mostrarAnunciosGoogle: true,
};

let usuariosBaneados = [];

// ──────────────────────────────────────────────
// ENDPOINTS API ADMINISTRACIÓN & PUBLICIDAD GOOGLE
// ──────────────────────────────────────────────

// Obtener Configuración de Anuncios Google y Banners
app.get('/api/admin/ads', (req, res) => {
  res.json({
    status: 'success',
    data: configPublicidad,
  });
});

// Actualizar Configuración de Anuncios desde Panel Admin
app.post('/api/admin/ads', (req, res) => {
  const { textoAnuncioNativo, urlAnuncioContacto, mostrarAnunciosGoogle } = req.body;
  if (textoAnuncioNativo) configPublicidad.textoAnuncioNativo = textoAnuncioNativo;
  if (urlAnuncioContacto !== undefined) configPublicidad.urlAnuncioContacto = urlAnuncioContacto;
  if (mostrarAnunciosGoogle !== undefined) configPublicidad.mostrarAnunciosGoogle = mostrarAnunciosGoogle;

  res.json({
    status: 'success',
    message: 'Configuración de publicidad actualizada correctamente en Hostinger.',
    data: configPublicidad,
  });
});

// Verificación de Credenciales de Administrador
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  const adminPass = process.env.ADMIN_PASS || 'NOTIGAS_ADMIN_2026';

  if (password === adminPass) {
    res.json({
      status: 'success',
      authenticated: true,
      role: 'administrador',
      message: 'Acceso de Administrador Autorizado.',
    });
  } else {
    res.status(401).json({
      status: 'error',
      authenticated: false,
      message: 'Contraseña de Administrador incorrecta.',
    });
  }
});

// Baneo de Usuarios
app.post('/api/admin/ban', (req, res) => {
  const { userEmail } = req.body;
  if (userEmail && !usuariosBaneados.includes(userEmail)) {
    usuariosBaneados.push(userEmail);
  }
  res.json({
    status: 'success',
    message: `Usuario ${userEmail} añadido a la lista de baneos.`,
    usuariosBaneados,
  });
});

// ──────────────────────────────────────────────
// SERVIDORES DE ARCHIVOS ESTÁTICOS FLUTTER WEB
// ──────────────────────────────────────────────
const webDistPath = path.join(__dirname, 'web_dist');
const buildWebPath = path.join(__dirname, 'build', 'web');

const staticPath = require('fs').existsSync(webDistPath) ? webDistPath : buildWebPath;

app.use(express.static(staticPath));

// Fallback SPA Routing para Flutter Web
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor NOTIGAS Node.js ejecutándose en Hostinger (Puerto ${PORT})`);
  console.log(`📁 Sirviendo aplicación Web desde: ${staticPath}`);
});
