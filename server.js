const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// State de Publicidad & Administración
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

app.get('/api/admin/ads', (req, res) => {
  res.json({ status: 'success', data: configPublicidad });
});

app.post('/api/admin/ads', (req, res) => {
  const { textoAnuncioNativo, urlAnuncioContacto, mostrarAnunciosGoogle } = req.body;
  if (textoAnuncioNativo) configPublicidad.textoAnuncioNativo = textoAnuncioNativo;
  if (urlAnuncioContacto !== undefined) configPublicidad.urlAnuncioContacto = urlAnuncioContacto;
  if (mostrarAnunciosGoogle !== undefined) configPublicidad.mostrarAnunciosGoogle = mostrarAnunciosGoogle;

  res.json({ status: 'success', message: 'Configuración actualizada.', data: configPublicidad });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASS || 'NOTIGAS_ADMIN_2026';

  if (password === adminPass) {
    res.json({ status: 'success', authenticated: true, role: 'administrador' });
  } else {
    res.status(401).json({ status: 'error', authenticated: false, message: 'Contraseña incorrecta.' });
  }
});

app.post('/api/admin/ban', (req, res) => {
  const { userEmail } = req.body;
  if (userEmail && !usuariosBaneados.includes(userEmail)) {
    usuariosBaneados.push(userEmail);
  }
  res.json({ status: 'success', message: `Usuario ${userEmail} baneado.`, usuariosBaneados });
});

// ──────────────────────────────────────────────
// SERVIDORES DE ARCHIVOS ESTÁTICOS FLUTTER WEB
// ──────────────────────────────────────────────
const publicPath = path.join(__dirname, 'public');
const webDistPath = path.join(__dirname, 'web_dist');

const staticPath = require('fs').existsSync(publicPath) ? publicPath : webDistPath;

app.use(express.static(staticPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor NOTIGAS Node.js ejecutándose en Hostinger (Puerto ${PORT})`);
  console.log(`📁 Sirviendo aplicación Web desde: ${staticPath}`);
});
