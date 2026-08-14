-- 020_strict_backend_rules.sql
-- Aplica reglas de backend estrictas para la aceptación de clústeres, 
-- verificando que el usuario no esté baneado.

CREATE OR REPLACE FUNCTION rpc_accept_demand_cluster_v2(
    p_cluster_id text,
    p_ciudad text,
    p_categoria text,
    p_distancia_metros double precision DEFAULT 300,
    p_min_pedidos integer DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_driver_id text;
    v_driver_record RECORD;
    v_updated_count integer;
BEGIN
    v_driver_id := auth.uid()::text;
    
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    -- 1. Validar conductor en el backend y exigir que NO esté baneado
    SELECT * INTO v_driver_record
    FROM public.choferes_habilitados
    WHERE user_id = v_driver_id 
      AND NOT EXISTS (SELECT 1 FROM public.usuarios_baneados WHERE user_id = v_driver_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conductor no registrado o se encuentra baneado';
    END IF;

    IF LOWER(TRIM(v_driver_record.ciudad)) != LOWER(TRIM(p_ciudad)) THEN
        RAISE EXCEPTION 'El conductor no opera en esta ciudad';
    END IF;

    IF LOWER(TRIM(v_driver_record.categoria)) != LOWER(TRIM(p_categoria)) THEN
        RAISE EXCEPTION 'La categoría del conductor no coincide con la demanda';
    END IF;

    -- 2. Recalcular el cluster y actualizar si cumple el mínimo
    WITH clustered_orders AS (
        SELECT 
            p.id,
            ST_ClusterDBSCAN(
                ST_Transform(ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326), 3857),
                eps := p_distancia_metros,
                minpoints := p_min_pedidos
            ) OVER (PARTITION BY p.ciudad, p.categoria) AS cluster_id_raw
        FROM 
            public.pedidos p
        WHERE 
            p.estado = 'pendiente'
            AND p.ciudad = p_ciudad
            AND p.categoria = p_categoria
            AND p.latitude IS NOT NULL
            AND p.longitude IS NOT NULL
    ),
    valid_clusters AS (
        SELECT 
            cluster_id_raw,
            md5(string_agg(id::text, ',' ORDER BY id)) AS gen_cluster_id,
            COUNT(id) AS cluster_count
        FROM clustered_orders
        WHERE cluster_id_raw IS NOT NULL
        GROUP BY cluster_id_raw
    )
    UPDATE public.pedidos up
    SET 
        estado = 'asignado',
        driver_id = v_driver_id
    FROM clustered_orders co
    JOIN valid_clusters vc ON co.cluster_id_raw = vc.cluster_id_raw
    WHERE up.id = co.id
      AND vc.gen_cluster_id = p_cluster_id
      AND vc.cluster_count >= p_min_pedidos;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count < p_min_pedidos THEN
        RAISE EXCEPTION 'El grupo de demanda ya no tiene suficientes pedidos activos o fue tomado por alguien más';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) TO authenticated;

-- Política de transición de estados explícita para pedidos
-- Un pedido solo puede ser marcado como entregado por el creador o el repartidor asignado.
CREATE OR REPLACE FUNCTION trg_check_pedido_transition()
RETURNS trigger AS $$
BEGIN
  IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' THEN
    -- El usuario que hace el cambio debe ser el creador (vecino) o el driver asignado
    IF NEW.user_id != auth.uid()::text AND NEW.driver_id != auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador o el repartidor asignado pueden marcar el pedido como entregado.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_pedido_transition ON public.pedidos;
CREATE TRIGGER enforce_pedido_transition
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_pedido_transition();
