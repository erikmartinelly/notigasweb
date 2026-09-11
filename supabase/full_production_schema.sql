-- ==============================================================================
-- NOTIGAS - ARCHIVO DE SNAPSHOT OBSOLETO
-- ==============================================================================
--
-- NO EJECUTAR ESTE ARCHIVO PARA CREAR O ACTUALIZAR PRODUCCIÓN.
--
-- El esquema de NOTIGAS continúa evolucionando mediante migraciones incrementales
-- versionadas en supabase/migrations/. Este antiguo snapshot consolidado quedó
-- obsoleto después de la v094 y ya no representa las reglas actuales de:
--
--   * privacidad de pedidos con radar de 50 m;
--   * 50 pedidos iniciales sin comisión;
--   * comisión S/ 0,20 por pedido confirmado;
--   * crédito progresivo S/20 -> S/50 -> S/100;
--   * suspensiones financieras reversibles;
--   * validación y revisión de remesas Yape;
--   * vistas SECURITY INVOKER y RLS actuales;
--   * eliminación de RPC/funciones legacy de pedidos y blur.
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
