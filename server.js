const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 200;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 30 * 1000;
const RATE_LIMIT_HARD_CAP = 20000;
const requestCounters = new Map();
let lastCountersCleanupAt = 0;
// Credenciales publicables inyectadas por el hosting en tiempo de ejecución.
// Son las ÚNICAS credenciales que el navegador necesita; nunca configurar ni
// exponer SUPABASE_SERVICE_ROLE_KEY en esta aplicación.
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
// Monitoreo opcional del navegador: sin SENTRY_DSN no se descarga ningún SDK externo.
const SENTRY_DSN = String(process.env.SENTRY_DSN || '').trim();
const APP_ENVIRONMENT = String(process.env.NODE_ENV || 'production').trim();

if (!SUPABASE_CONFIGURED) {
  console.warn('⚠️ Faltan SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY en el entorno del servidor. El navegador no podrá inicializar Supabase hasta definirlas (ver .env.example).');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

function limpiarContadoresExpirados(now) {
  // Ejecutar el barrido completo como máximo una vez por intervalo para evitar
  // el costo O(n) en cada solicitud cuando el mapa crece.
  if (requestCounters.size < 1000) return;
  if (now - lastCountersCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastCountersCleanupAt = now;
  for (const [key, value] of requestCounters.entries()) {
    if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) requestCounters.delete(key);
  }
  // Tope duro de memoria: si aun así el mapa crece sin control, desalojar
  // progresivamente las entradas más antiguas (el Map conserva el orden de inserción).
  while (requestCounters.size > RATE_LIMIT_HARD_CAP) {
    const oldestKey = requestCounters.keys().next().value;
    if (!oldestKey) break;
    requestCounters.delete(oldestKey);
  }
}

function limitarSolicitudes(req, res, next) {
  const now = Date.now();
  limpiarContadoresExpirados(now);
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const current = requestCounters.get(key);

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestCounters.set(key, { startedAt: now, hits: 1 });
    res.setHeader('RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    res.setHeader('RateLimit-Remaining', String(RATE_LIMIT_MAX_REQUESTS - 1));
    return next();
  }

  current.hits += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.hits);
  res.setHeader('RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  res.setHeader('RateLimit-Remaining', String(remaining));

  if (current.hits > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente en un momento.' });
  }

  return next();
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Origin-Agent-Cluster', '?1');
  // CSP unificada con .htaccess (producción Hostinger): incluye wasm-unsafe-eval
  // para voucher_ocr.js y los orígenes de tesseract/cdn.jsdelivr.net en connect-src.
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://apis.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://partner.googleadservices.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://browser.sentry-cdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://ipinfo.io https://ipapi.co https://freeipapi.com https://ipwho.is https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://router.project-osrm.org https://nominatim.openstreetmap.org https://photon.komoot.io https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://*.ingest.sentry.io; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.supabase.co https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.google.com https://*.googleusercontent.com https://*.doubleclick.net https://*.googlesyndication.com https://unpkg.com https://cdnjs.cloudflare.com; worker-src 'self' blob:; frame-src https://accounts.google.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.google.com https://pagead2.googlesyndication.com; form-action 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'");
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (req.originalUrl.length > 2048) {
    return res.status(414).json({ error: 'Solicitud demasiado larga.' });
  }
  return next();
});

app.use(limitarSolicitudes);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/ads.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'ads.txt'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Estas dos variables son credenciales publicables del navegador; la clave
// service_role no debe configurarse ni exponerse en esta aplicación.
app.get('/runtime-config.js', (req, res) => {
  const config = {
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
    sentryDsn: SENTRY_DSN,
    environment: APP_ENVIRONMENT,
    configured: SUPABASE_CONFIGURED
  };
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.type('application/javascript').send(
    `window.NOTIGAS_RUNTIME_CONFIG = Object.freeze(${JSON.stringify(config)});`
  );
});

// Allowlist de extensiones de archivos web que se sirven al navegador. Cualquier
// recurso con otra extensión (SQL, env, logs, backups, fuentes del servidor,
// scripts internos, etc.) se rechaza aunque exista físicamente en el repositorio.
const SAFE_WEB_FILE_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.otf',
  '.json', '.txt', '.xml', '.webmanifest', '.pdf', '.wasm'
]);

// Archivos del sistema que siempre se bloquean aunque tengan extensión segura.
const FORBIDDEN_STATIC_BASENAMES = new Set([
  'server.js',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'runtime-config.js'
]);

// Directorios internos que nunca deben servirse como estáticos públicos.
const FORBIDDEN_STATIC_DIRS = [
  '/.git',
  '/.agents',
  '/.github',
  '/scripts',
  '/supabase',
  '/node_modules',
  '/node-v20.11.1-win-x64'
];

app.use((req, res, next) => {
  let reqPath = req.path;
  try { reqPath = decodeURIComponent(reqPath); } catch (_) {}
  const lower = reqPath.toLowerCase();

  for (const dir of FORBIDDEN_STATIC_DIRS) {
    if (lower === dir || lower.startsWith(`${dir}/`)) {
      return res.status(403).json({ error: 'Acceso denegado a recursos del sistema.' });
    }
  }

  const base = path.basename(lower);
  if (base.startsWith('.')) {
    return res.status(403).json({ error: 'Acceso denegado a recursos del sistema.' });
  }
  if (FORBIDDEN_STATIC_BASENAMES.has(base)) {
    return res.status(403).json({ error: 'Acceso denegado a recursos del sistema.' });
  }

  const ext = path.extname(lower);
  if (ext && !SAFE_WEB_FILE_EXTENSIONS.has(ext)) {
    return res.status(403).json({ error: 'Acceso denegado a recursos del sistema.' });
  }

  // Sin extensión: no se sirve ningún archivo; se delega al shell de la PWA.
  next();
});

function sendIndex(req, res) {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
}

app.get(['/', '/index.html'], sendIndex);

const STATIC_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
app.use(express.static(__dirname, {
  index: false,
  maxAge: STATIC_CACHE_MAX_AGE_MS,
  setHeaders(res, filePath) {
    if (/\.(?:js|css|svg|png|jpe?g|webp|ico|woff2?|ttf)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  }
}));

app.get('*', sendIndex);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ NOTIGAS iniciado exitosamente en puerto ${PORT}`);
});
