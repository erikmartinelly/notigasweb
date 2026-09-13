-- ==============================================================================
-- Migración: Plataforma 100% Gratuita y Monetización con Google AdSense
-- Timestamp: 20260908004000
-- ==============================================================================

-- 1. Configuración de monetización global con Google AdSense
UPDATE public.configuracion_publicidad
SET 
  modo = 'adsense',
  publisher_id = 'ca-pub-2502415561017945',
  updated_at = timezone('utc'::text, now())
WHERE id = 1;

-- 2. Unificar todos los choferes en modelo libre y gratuito
UPDATE public.choferes_habilitados
SET 
  tipo_plan = 'gratuito',
  es_premium = false,
  estado_pago_premium = 'gratuito_libre';

-- 3. Unificar rutas activas en modelo libre
UPDATE public.rutas_repartidores
SET es_premium = false;
