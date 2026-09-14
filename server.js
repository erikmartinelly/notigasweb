const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 200;
const requestCounters = new Map();
const INDEX_PATH = path.join(__dirname, 'index.html');
const APP_JS_PATH = path.join(__dirname, 'js', 'app.js');
const DRIVER_ORDER_RULES_PATH = path.join(__dirname, 'js', 'driver_order_rules.js');

const DRIVER_CREDIT_TERMS_HEADING = `          <strong style="color: #FCA5A5; display: block; margin-bottom: 6px; font-size: 13px;">
            💳 4. Ciclo de crédito, remesas y continuidad del servicio
          </strong>`;
const DRIVER_CREDIT_TERMS_COPY = `
          <p id="driverCreditProgressiveTerms" style="margin:0 0 9px 0;font-size:12px;color:#FEE2E2;line-height:1.55;">
            El primer ciclo cobrable permite <strong>100 pedidos = S/ 20</strong>. Tras la primera remesa confirmada tu crédito sube a <strong>S/ 50</strong>; la segunda mantiene S/ 50 y, tras la tercera remesa confirmada, sube al tope de <strong>S/ 100</strong>.
          </p>`;

// El HTML histórico conserva un carácter mojibake y dos scripts locales que
// bloqueaban el parser. Se corrigen al servir sin reescribir el monolito.
// El detalle de escalamiento del crédito pertenece a Términos para Repartidores,
// no al formulario de alta. La ficha de repartidor se normaliza a una única
// modalidad con prueba gratis mediante driver_free_trial_registration.js.
const INDEX_HTML = fs.readFileSync(INDEX_PATH, 'utf8')
  .replace('🌍 Todos', '🌍 Todos')
  .replace(
    '<script src="js/driver_icons.js?v=135"></script>',
    '<script defer src="js/driver_icons.js?v=135"></script>'
  )
  .replace(
    '<script src="js/device_security.js?v=135"></script>',
    '<script defer src="js/device_security.js?v=135"></script>'
  )
  .replace(
    DRIVER_CREDIT_TERMS_HEADING,
    `${DRIVER_CREDIT_TERMS_HEADING}${DRIVER_CREDIT_TERMS_COPY}`
  )
  .replace(
    '</body>',
    '  <script defer src="js/driver_free_trial_registration.js?v=135"></script>\n</body>'
  );

// Esta purga era disparada por todos los navegadores tres segundos después de
// cargar, pero producción revoca EXECUTE para anon/authenticated y pg_cron ya
// ejecuta rpc_purge_old_records() cada hora. Servirla al cliente solo generaba
// una petición fallida adicional contra Supabase.
const DEAD_CLIENT_PURGE = `// Purga automática preventiva en segundo plano al iniciar la app
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.supabaseClient && typeof window.supabaseClient.rpc === 'function') {
      window.supabaseClient.rpc('rpc_purge_old_records').then(({ data }) => {
        if (data && (data.pedidos_eliminados > 0 || data.avisos_eliminados > 0)) {
          console.info('Purga automática preventiva realizada:', data);
        }
      }).catch(() => {});
    }
  }, 3000);
});`;
const APP_JS = fs.readFileSync(APP_JS_PATH, 'utf8').replace(
  DEAD_CLIENT_PURGE,
  '// La purga de retención se ejecuta exclusivamente en servidor mediante pg_cron.'
);

const DRIVER_CREDIT_FORM_BLOCK = `          <div style="margin-top:9px;background:rgba(15,23,42,.72);border-left:3px solid #F59E0B;padding:8px 10px;border-radius:0 8px 8px 0;font-size:11px;color:#FDE68A;line-height:1.5;">
            El primer ciclo cobrable permite <strong>100 pedidos = S/ 20</strong>. Tras la primera remesa confirmada tu crédito sube a <strong>S/ 50</strong>; la segunda mantiene S/ 50 y, tras la tercera remesa confirmada, sube al tope de <strong>S/ 100</strong>.
          </div>\n`;
const DRIVER_ORDER_RULES_JS = fs.readFileSync(DRIVER_ORDER_RULES_PATH, 'utf8').replace(
  DRIVER_CREDIT_FORM_BLOCK,
  ''
);

app.disable('x-powered-by');
app.set('trust proxy', 1);

function limpiarContadoresExpirados(now) {
  if (requestCounters.size < 1000) return;
  for (const [key, value] of requestCounters.entries()) {
    if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) requestCounters.delete(key);
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
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self' https://accounts.google.com",
    "script-src 'self' https://accounts.google.com https://apis.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://partner.googleadservices.com https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://*.google.com https://*.gstatic.com https://*.googlesyndication.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://ipinfo.io https://ipapi.co https://freeipapi.com https://ipwho.is https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://router.project-osrm.org https://nominatim.openstreetmap.org https://photon.komoot.io https://*.google.com https://*.googlesyndication.com https://*.doubleclick.net https://*.googleadservices.com",
    "frame-src 'self' https://accounts.google.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.google.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.googleadservices.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ].join('; '));
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

const blacklistedPaths = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/pnpm-lock.yaml',
  '/readme.md',
  '/.env',
  '/.htaccess',
  '/.gitignore',
  '/supabase',
  '/scripts',
  '/node_modules',
  '/.git',
  '/.agents'
];

app.use((req, res, next) => {
  const reqPath = req.path.toLowerCase();
  for (const item of blacklistedPaths) {
    if (reqPath === item || reqPath.startsWith(`${item}/`)) {
      return res.status(403).json({ error: 'Acceso denegado a recursos del sistema.' });
    }
  }
  next();
});

function sendIndex(req, res) {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.type('html').send(INDEX_HTML);
}

app.get(['/', '/index.html'], sendIndex);
app.get('/js/app.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.type('application/javascript').send(APP_JS);
});
app.get('/js/driver_order_rules.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.type('application/javascript').send(DRIVER_ORDER_RULES_JS);
});

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
