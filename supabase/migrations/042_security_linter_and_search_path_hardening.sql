-- ==============================================================================
-- 042_security_linter_and_search_path_hardening.sql
-- 1. Configuración explícita de `SET search_path = public` en todas las funciones
-- 2. Corrección de esquema y columnas para telemetría de rutas (rutas_repartidores: user_id, last_active)
-- 3. Revocación de permisos de ejecución pública/anónima en funciones de sistema y triggers
-- 4. Limpieza de funciones obsoletas huérfanas
-- ==============================================================================

-- 1. Funciones de Sanitización y Triggers con search_path inmutable
CREATE OR REPLACE FUNCTION public.sanitize_html()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.titulo IS NOT NULL THEN
    NEW.titulo = REGEXP_REPLACE(NEW.titulo, '<[^>]*>', '', 'g');
  END IF;
  IF NEW.descripcion IS NOT NULL THEN
    NEW.descripcion = REGEXP_REPLACE(NEW.descripcion, '<[^>]*>', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_html_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.texto IS NOT NULL THEN
    NEW.texto = REGEXP_REPLACE(NEW.texto, '<[^>]*>', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pedidos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_check_pedido_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A. Estados terminales protegidos
  IF OLD.estado IN ('entregado', 'cancelado') AND NEW.estado <> OLD.estado THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'No se puede modificar un pedido que ya está en estado final (%)', OLD.estado;
    END IF;
  END IF;

  -- B. Transición hacia 'entregado'
  IF NEW.estado = 'entregado' AND OLD.estado <> 'entregado' THEN
    IF NEW.user_id <> auth.uid()::text AND NEW.driver_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador o el repartidor asignado pueden marcar el pedido como entregado.';
    END IF;
  END IF;

  -- C. Transición hacia 'cancelado'
  IF NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado' THEN
    IF NEW.user_id <> auth.uid()::text AND NOT is_admin_email() THEN
      RAISE EXCEPTION 'Solo el comprador creador del pedido puede cancelarlo.';
    END IF;
  END IF;

  -- D. Transición hacia 'asignado'
  IF NEW.estado = 'asignado' AND OLD.estado NOT IN ('pendiente', 'visto', 'asignado') THEN
    IF NOT is_admin_email() THEN
      RAISE EXCEPTION 'Transición de estado no válida para asignación desde %', OLD.estado;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        nombre,
        ciudad
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            split_part(COALESCE(NEW.email, ''), '@', 1)
        ),
        COALESCE(
            NULLIF(
                NEW.raw_user_meta_data ->> 'ciudad',
                ''
            ),
            'santacruz'
        )
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- 2. Funciones de Purga y Mantenimiento (usando las columnas reales: last_active en rutas_repartidores)
CREATE OR REPLACE FUNCTION public.purge_old_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Eliminar pedidos terminados con más de 72 horas
    DELETE FROM public.pedidos 
    WHERE (estado IN ('entregado', 'cancelado') AND updated_at < now() - interval '72 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');

    -- Eliminar avisos con más de 72 horas
    DELETE FROM public.avisos 
    WHERE created_at < now() - interval '72 hours';

    -- Eliminar telemetría de rutas de camiones inactivos por más de 12 horas
    DELETE FROM public.rutas_repartidores
    WHERE last_active < now() - interval '12 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_purga_notigas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.purge_old_records();
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_purge_old_records()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedidos_borrados integer := 0;
    v_rutas_borradas integer := 0;
    v_avisos_borrados integer := 0;
BEGIN
    IF NOT is_admin_email() THEN
        RAISE EXCEPTION 'Acceso denegado: solo administradores pueden ejecutar la purga';
    END IF;

    DELETE FROM public.pedidos
    WHERE (estado IN ('entregado', 'cancelado') AND updated_at < now() - interval '72 hours')
       OR (estado = 'pendiente' AND created_at < now() - interval '14 days');
    GET DIAGNOSTICS v_pedidos_borrados = ROW_COUNT;

    DELETE FROM public.rutas_repartidores
    WHERE last_active < now() - interval '12 hours';
    GET DIAGNOSTICS v_rutas_borradas = ROW_COUNT;

    DELETE FROM public.avisos
    WHERE created_at < now() - interval '72 hours';
    GET DIAGNOSTICS v_avisos_borrados = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'pedidos_purgados', v_pedidos_borrados,
        'rutas_purgadas', v_rutas_borradas,
        'avisos_purgados', v_avisos_borrados,
        'ejecutado_el', now()
    );
END;
$$;

-- 3. Funciones de Votos Seguras
CREATE OR REPLACE FUNCTION public.incrementar_votos_aviso(aviso_id uuid, incremento integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := auth.uid()::text;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF is_banned() THEN
    RAISE EXCEPTION 'Usuario no autorizado o suspendido';
  END IF;

  IF incremento > 0 THEN
    BEGIN
      INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad) 
      VALUES (v_user_id, aviso_id, 'aviso');
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya has votado esta publicación';
    END;
    UPDATE public.avisos SET votos = votos + 1 WHERE id = aviso_id;
  ELSE
    DELETE FROM public.votos_registro 
    WHERE user_id = v_user_id AND entidad_id = aviso_id AND tipo_entidad = 'aviso';
    UPDATE public.avisos SET votos = GREATEST(0, votos - 1) WHERE id = aviso_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.incrementar_votos_comentario(comentario_id uuid, incremento integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := auth.uid()::text;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF is_banned() THEN
    RAISE EXCEPTION 'Usuario no autorizado o suspendido';
  END IF;

  IF incremento > 0 THEN
    BEGIN
      INSERT INTO public.votos_registro (user_id, entidad_id, tipo_entidad) 
      VALUES (v_user_id, comentario_id, 'comentario');
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Ya has votado este comentario';
    END;
    UPDATE public.comentarios_avisos SET votos = votos + 1 WHERE id = comentario_id;
  ELSE
    DELETE FROM public.votos_registro 
    WHERE user_id = v_user_id AND entidad_id = comentario_id AND tipo_entidad = 'comentario';
    UPDATE public.comentarios_avisos SET votos = GREATEST(0, votos - 1) WHERE id = comentario_id;
  END IF;
END;
$$;

-- 4. Validación de Administrador
CREATE OR REPLACE FUNCTION public.validar_admin(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.admin_credentials
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email));
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  RETURN (v_hash = crypt(p_password, v_hash) OR v_hash = p_password);
END;
$$;

-- 5. Eliminación en cascada de cuenta (rutas por user_id)
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid text;
    v_uuid uuid;
BEGIN
    v_uuid := auth.uid();
    v_uid := v_uuid::text;

    IF v_uuid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    DELETE FROM public.pedidos WHERE user_id = v_uid OR driver_id = v_uid;
    DELETE FROM public.choferes_habilitados WHERE user_id = v_uid;
    DELETE FROM public.rutas_repartidores WHERE user_id = v_uid;
    DELETE FROM public.comentarios_avisos WHERE user_id = v_uid;
    DELETE FROM public.avisos WHERE user_id = v_uid;
    DELETE FROM public.anuncios_globales WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uuid;
    DELETE FROM auth.users WHERE id = v_uuid;
END;
$$;

-- 6. Eliminar Funciones Huérfanas Inseguras
DROP FUNCTION IF EXISTS public.handle_new_user_role();
DROP FUNCTION IF EXISTS public.incrementar_votos_pedido(uuid, integer);
DROP FUNCTION IF EXISTS public.incrementar_votos_publicacion(uuid, integer);
DROP FUNCTION IF EXISTS public.incrementar_votos_comentario(bigint, integer);

-- 7. Revocación y Asignación de Permisos de Ejecución
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_pedidos_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_check_pedido_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_html() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sanitize_html_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_records() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_purga_notigas() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_assign_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_mark_order_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_order_seen(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_accept_demand_cluster_v2(text, text, text, double precision, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_orders_for_cluster_v2(text, text, text, double precision, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_my_assigned_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_assigned_orders() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_purge_old_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_purge_old_records() TO authenticated;

REVOKE ALL ON FUNCTION public.incrementar_votos_aviso(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_aviso(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.incrementar_votos_comentario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incrementar_votos_comentario(uuid, integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_get_demand_clusters_v2(text, text, double precision, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_email() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_admin(text, text) TO anon, authenticated;
