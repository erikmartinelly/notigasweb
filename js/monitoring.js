// NOTIGAS - monitoreo de errores de producción con Sentry.
// El DSN llega exclusivamente desde /runtime-config.js; nunca se guarda en Git.
(function initNotigasMonitoring() {
  'use strict';

  const config = window.NOTIGAS_RUNTIME_CONFIG || {};
  const dsn = String(config.sentryDsn || '').trim();
  const environment = String(config.environment || 'production').trim();

  if (!dsn) {
    console.info('[NOTIGAS] Sentry no configurado; monitoreo remoto desactivado.');
    return;
  }

  // Versión fija del bundle de errores (con SRI) para que el navegador verifique
  // el CDN de Sentry. Sin DSN no se descarga ningún script externo.
  const SENTRY_SDK_URL = 'https://browser.sentry-cdn.com/10.75.0/bundle.min.js';
  const SENTRY_SDK_SRI = 'sha384-Yht61aP1Ubz8hWtSUlosvg1lra1xK9MDSRBygQambdRN1t3T2DMVvIHYAhm1kzt7';

  function captureEarlyError(error) {
    if (window.Sentry?.captureException) {
      window.Sentry.captureException(error);
    }
  }

  const previousOnError = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    captureEarlyError(error || new Error(String(message || 'Error JavaScript')));
    if (typeof previousOnError === 'function') return previousOnError.apply(this, arguments);
    return false;
  };

  const previousOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = function(event) {
    const reason = event?.reason instanceof Error ? event.reason : new Error(String(event?.reason || 'Unhandled promise rejection'));
    captureEarlyError(reason);
    if (typeof previousOnUnhandledRejection === 'function') return previousOnUnhandledRejection.apply(this, arguments);
    return false;
  };

  const script = document.createElement('script');
  script.src = SENTRY_SDK_URL;
  script.integrity = SENTRY_SDK_SRI;
  script.crossOrigin = 'anonymous';
  script.onload = function() {
    try {
      if (!window.Sentry?.init) throw new Error('SDK de Sentry cargado pero no expone Sentry.init');
      window.Sentry.init({
        dsn,
        environment,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend(event) {
          // No enviar credenciales, tokens ni datos de formularios al sistema de monitoreo.
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
          }
          return event;
        }
      });
      window.Sentry.setTag('app', 'notigas-web');
      window.Sentry.setTag('monitoring', 'sentry');
      console.info('[NOTIGAS] Sentry inicializado.');
    } catch (error) {
      console.error('[NOTIGAS] No se pudo inicializar Sentry:', error);
    }
  };
  script.onerror = function() {
    console.error('[NOTIGAS] No se pudo cargar el SDK de Sentry.');
  };
  document.head.appendChild(script);
})();
