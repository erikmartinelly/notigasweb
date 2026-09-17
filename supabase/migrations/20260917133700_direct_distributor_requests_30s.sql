-- NOTIGAS: solicitud dirigida a un distribuidor desde la Lista de Repartidores.
-- El pedido sigue siendo un pedido normal: la comisión se contabiliza con el flujo
-- existente de entrega confirmada. El distribuidor elegido solo recibe prioridad
-- durante 30 segundos; después la solicitud se abre a los demás repartidores.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS requested_driver_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_request_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_request_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_request_expanded_at timestamptz DEFAULT NULL;

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_driver_request_status_check;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_driver_request_status_check
  CHECK (driver_request_status IS NULL OR driver_request_status IN ('requested','accepted','expanded','cancelled'));

CREATE INDEX IF NOT EXISTS idx_pedidos_requested_driver_pending
  ON public.pedidos (requested_driver_id, driver_request_status, driver_request_expires_at)
  WHERE requested_driver_id IS NOT NULL AND driver_request_status = 'requested';

DROP POLICY IF EXISTS pedidos_select_requested_driver ON public.pedidos;
CREATE POLICY pedidos_select_requested_driver ON public.pedidos
FOR SELECT TO authenticated
USING (
  coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) = false
  AND requested_driver_id = ((select auth.uid()))::text
  AND driver_id IS NULL
  AND estado IN ('pendiente','visto')
);

CREATE OR REPLACE FUNCTION public.rpc_request_order_to_driver(
  p_driver_id text,
  p_categoria text,
  p_titulo text DEFAULT NULL,
  p_cantidad text DEFAULT '1 un',
  p_direccion text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_ciudad text DEFAULT NULL,
  p_barrio_otb text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid text := (select auth.uid())::text;
  v_city text;
  v_order public.pedidos;
BEGIN
  IF v_uid IS NULL OR coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Debes iniciar sesión para solicitar un pedido';
  END IF;
  IF p_driver_id IS NULL OR p_driver_id = '' THEN RAISE EXCEPTION 'Distribuidor no válido'; END IF;
  IF p_categoria IS NULL OR trim(p_categoria) = '' THEN RAISE EXCEPTION 'Categoría de pedido obligatoria'; END IF;

  SELECT lower(trim(ch.ciudad)) INTO v_city
  FROM public.choferes_habilitados ch
  WHERE ch.user_id::text = p_driver_id
    AND coalesce(ch.estado_verificacion, 'aprobado') = 'aprobado'
    AND coalesce(ch.bloqueado, false) = false
  LIMIT 1;

  IF v_city IS NULL THEN RAISE EXCEPTION 'El distribuidor seleccionado no está habilitado'; END IF;
  IF p_ciudad IS NOT NULL AND lower(trim(p_ciudad)) <> v_city THEN
    RAISE EXCEPTION 'El distribuidor no pertenece a la ciudad seleccionada';
  END IF;

  INSERT INTO public.pedidos (
    user_id, titulo, categoria, cantidad, direccion, telefono,
    latitude, longitude, ciudad, barrio_otb, estado,
    requested_driver_id, driver_request_status, driver_request_expires_at
  ) VALUES (
    v_uid,
    coalesce(nullif(trim(p_titulo), ''), 'Pedido de ' || initcap(trim(p_categoria))),
    trim(p_categoria), coalesce(nullif(trim(p_cantidad), ''), '1 un'),
    nullif(trim(p_direccion), ''), nullif(trim(p_telefono), ''),
    p_latitude, p_longitude, coalesce(nullif(lower(trim(p_ciudad)), ''), v_city),
    nullif(trim(p_barrio_otb), ''), 'pendiente',
    p_driver_id, 'requested', now() + interval '30 seconds'
  ) RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

-- Convierte un pedido normal recién creado en una solicitud dirigida. Solo el
-- comprador dueño puede hacerlo y solo mientras el pedido siga pendiente.
CREATE OR REPLACE FUNCTION public.rpc_target_existing_order_to_driver(p_order_id uuid, p_driver_id text)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid text := (select auth.uid())::text;
  v_city text;
  v_order public.pedidos;
BEGIN
  IF v_uid IS NULL OR coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT lower(trim(ch.ciudad)) INTO v_city
  FROM public.choferes_habilitados ch
  WHERE ch.user_id::text = p_driver_id
    AND coalesce(ch.estado_verificacion, 'aprobado') = 'aprobado'
    AND coalesce(ch.bloqueado, false) = false
  LIMIT 1;
  IF v_city IS NULL THEN RAISE EXCEPTION 'El distribuidor seleccionado no está habilitado'; END IF;

  UPDATE public.pedidos
  SET requested_driver_id = p_driver_id,
      driver_request_status = 'requested',
      driver_request_expires_at = now() + interval '30 seconds',
      driver_request_expanded_at = NULL,
      updated_at = now()
  WHERE id = p_order_id
    AND user_id = v_uid
    AND driver_id IS NULL
    AND estado IN ('pendiente','visto')
    AND lower(trim(coalesce(ciudad, ''))) = v_city
  RETURNING * INTO v_order;

  IF v_order.id IS NULL THEN RAISE EXCEPTION 'El pedido ya no está disponible para dirigirlo a este distribuidor'; END IF;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_accept_direct_distributor_request(p_order_id uuid)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid text := (select auth.uid())::text;
  v_order public.pedidos;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión'; END IF;
  UPDATE public.pedidos
  SET driver_id = v_uid,
      requested_driver_id = NULL,
      driver_request_status = 'accepted',
      driver_request_expires_at = NULL,
      updated_at = now()
  WHERE id = p_order_id
    AND user_id <> v_uid
    AND driver_id IS NULL
    AND requested_driver_id = v_uid
    AND driver_request_status = 'requested'
    AND estado IN ('pendiente','visto')
    AND coalesce(driver_request_expires_at, now()) > now()
  RETURNING * INTO v_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'La solicitud ya no está disponible para este distribuidor'; END IF;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_expand_expired_driver_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer := 0;
BEGIN
  UPDATE public.pedidos
  SET requested_driver_id = NULL,
      driver_request_status = 'expanded',
      driver_request_expanded_at = now(),
      driver_request_expires_at = NULL,
      updated_at = now()
  WHERE driver_id IS NULL
    AND requested_driver_id IS NOT NULL
    AND driver_request_status = 'requested'
    AND driver_request_expires_at <= now()
    AND estado IN ('pendiente','visto');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_order_to_driver(text,text,text,text,text,text,text,text,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_order_to_driver(text,text,text,text,text,text,text,text,double precision,double precision) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_target_existing_order_to_driver(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_target_existing_order_to_driver(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_accept_direct_distributor_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_accept_direct_distributor_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_expand_expired_driver_requests() FROM PUBLIC, anon, authenticated;

-- Fallback server-side: pg_cron corre cada minuto. El navegador ejecuta la
-- expansión exactamente a los 30s mientras esté abierto; cron cubre cierres/offline.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notigas_expand_direct_driver_requests') THEN
      PERFORM cron.unschedule('notigas_expand_direct_driver_requests');
    END IF;
    PERFORM cron.schedule(
      'notigas_expand_direct_driver_requests',
      '* * * * *',
      $cron$SELECT public.rpc_expand_expired_driver_requests();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo registrar pg_cron para solicitudes dirigidas: %', SQLERRM;
END $do$;
