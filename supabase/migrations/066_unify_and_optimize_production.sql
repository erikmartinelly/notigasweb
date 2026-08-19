-- 066_unify_and_optimize_production.sql
-- NOTIGAS - Migración Oficial de Sincronización y Optimización de Producción

-- 1. Recrear vista pedidos_publicos como vista segura con enmascaramiento SQL
DROP VIEW IF EXISTS public.pedidos_publicos CASCADE;
CREATE OR REPLACE VIEW public.pedidos_publicos AS
SELECT
    id,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) THEN user_id
        ELSE NULL::text
    END AS user_id,
    categoria,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(ciudad, NULL::text) THEN titulo
        ELSE 'Pedido Vecinal'::text
    END AS titulo,
    cantidad,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(ciudad, NULL::text) THEN direccion
        ELSE NULL::text
    END AS direccion,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(ciudad, NULL::text) THEN telefono
        ELSE NULL::text
    END AS telefono,
    estado,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR driver_id = (SELECT auth.uid()::text) THEN driver_id
        ELSE NULL::text
    END AS driver_id,
    ciudad,
    COALESCE(barrio_otb, 'Zona indicada en el mapa'::text) AS barrio_otb,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(ciudad, NULL::text) THEN latitude
        ELSE round(latitude::numeric, 3)::double precision
    END AS latitude,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(ciudad, NULL::text) THEN longitude
        ELSE round(longitude::numeric, 3)::double precision
    END AS longitude,
    CASE
        WHEN user_id = (SELECT auth.uid()::text) OR is_current_enabled_driver(ciudad, NULL::text) THEN descripcion
        ELSE NULL::text
    END AS descripcion,
    COALESCE(visto, false) AS visto,
    created_at
FROM public.pedidos
WHERE estado IN ('pendiente', 'visto');

GRANT SELECT ON public.pedidos_publicos TO anon, authenticated;
GRANT SELECT ON public.choferes_publicos TO anon, authenticated;
GRANT SELECT ON public.rutas_repartidores_publicas TO anon, authenticated;

ALTER VIEW public.pedidos_publicos SET (security_invoker = true);
ALTER VIEW public.choferes_publicos SET (security_invoker = true);
ALTER VIEW public.rutas_repartidores_publicas SET (security_invoker = true);

-- 2. Eliminar funciones obsoletas de clusters y chat
DROP FUNCTION IF EXISTS public.rpc_get_demand_clusters_v2(text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_get_demand_clusters(text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_get_orders_for_cluster(text, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.rpc_accept_demand_cluster(text, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.purge_old_records();
DROP FUNCTION IF EXISTS public.sanitize_html_chat() CASCADE;

-- 3. Crear RPC de Bootstrap consolidado de usuario (1 sola consulta en Login)
CREATE OR REPLACE FUNCTION public.rpc_get_user_bootstrap_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_id_text text;
  v_is_admin boolean := false;
  v_profile jsonb := null;
  v_driver jsonb := null;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'is_admin', false,
      'profile', null,
      'driver', null
    );
  END IF;

  v_user_id_text := v_user_id::text;
  v_is_admin := public.is_admin_email();

  -- Obtener perfil
  SELECT to_jsonb(p) INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id;

  -- Obtener datos de chofer si existen y no está baneado
  SELECT to_jsonb(ch) INTO v_driver
  FROM public.choferes_habilitados ch
  WHERE ch.user_id = v_user_id_text
    AND NOT EXISTS (
      SELECT 1 FROM public.usuarios_baneados ub
      WHERE ub.user_id = v_user_id_text
    );

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', v_user_id_text,
    'is_admin', v_is_admin,
    'profile', v_profile,
    'driver', v_driver
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_get_user_bootstrap_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_user_bootstrap_data() TO authenticated;

-- 4. Revocar ejecución pública de funciones internas de seguridad y triggers
REVOKE EXECUTE ON FUNCTION public.is_admin_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_banned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_action_rate_limit(text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.guard_limited_content_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_optional_order_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_field_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_pedido_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_driver_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_html() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_check_pedido_transition() FROM PUBLIC, anon, authenticated;

-- 5. Limpieza y optimización de índices
DROP INDEX IF EXISTS public.idx_pedidos_ciudad_categoria_estado_visto;
DROP INDEX IF EXISTS public.idx_pedidos_user_estado;

CREATE INDEX IF NOT EXISTS idx_pedidos_ciudad_estado_created
  ON public.pedidos (ciudad, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pedidos_driver_estado
  ON public.pedidos (driver_id, estado)
  WHERE driver_id IS NOT NULL;
