// Configuración pública inyectada en tiempo de ejecución por server.js.
// Esta plantilla no contiene credenciales: server.js construye
// window.NOTIGAS_RUNTIME_CONFIG a partir de las variables de entorno del
// hosting (SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY, ver .env.example).
// Si este archivo llega a cargarse tal cual (despliegue Apache estático sin
// server.js), la app falla de forma explícita en lugar de usar claves fijas.
window.NOTIGAS_RUNTIME_CONFIG = Object.freeze({
  configured: false,
  error: 'Falta la inyección de configuración del entorno. Ejecuta la app mediante server.js con SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY definidas en el hosting.'
});