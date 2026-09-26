-- ==============================================================================
-- NOTIGAS - ARCHIVO DE SNAPSHOT OBSOLETO
-- ==============================================================================
--
-- NO EJECUTAR ESTE ARCHIVO PARA CREAR O ACTUALIZAR PRODUCCIÓN.
--
-- El esquema de NOTIGAS continúa evolucionando mediante migraciones incrementales
-- versionadas en supabase/migrations/. Este antiguo snapshot consolidado quedó
-- obsoleto después de la v094 y ya no representa las reglas actuales.
--
-- El modelo vigente es el de reciclaje en Bolivia (Cochabamba) con 11 categorías
-- y dos tipos de operación, consulta:
--
--   * catalogo_canónico en js/notigas_bo.js y su CHECK en pedidos.categoria;
--   * tipo_solicitud 'recogida' (plastico, papel, chatarra, botellas, organico,
--     frutas) frente a 'compra' (detergentes, sal, afilado, agua, otros);
--   * el servidor deriva tipo_solicitud desde la categoría, sin confiar en el
--     cliente;
--   * privacidad de pedidos con radar de 50 m;
--   * cero comisión por pedido y por reparto;
--   * vistas SECURITY INVOKER y RLS actuales.
--
-- Última migración de esquema: supabase/migrations/20260926090000_bolivia_catalogo_reciclaje.sql
--
-- FUENTE CANÓNICA: supabase/migrations/ ejecutadas en orden ascendente.
--
-- Se conserva este archivo únicamente para evitar enlaces históricos rotos y para
-- impedir que un despliegue accidental reconstruya una base con reglas antiguas.
-- ==============================================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'full_production_schema.sql está obsoleto. Despliegue NOTIGAS exclusivamente mediante supabase/migrations/ en orden ascendente.';
END
$$;
